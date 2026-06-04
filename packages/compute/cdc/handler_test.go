package cdc

import (
	"testing"
	"time"

	"github.com/Trendyol/go-pq-cdc/pq/message/format"
	"github.com/openimago/billing-cdc-worker/model"
	"github.com/openimago/billing-cdc-worker/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

const (
	testDSN          = "postgresql://postgres:my-secret-pw@localhost:15432/billing_cdc_test"
	testWorkspaceID  = "ws_test_001"
	testUserID       = "user_test_001"
	testSessionID    = "ses_test_001"
)

func floatPtr(v float64) *float64 { return &v }
func intPtr(v int64) *int64      { return &v }
func strPtr(v string) *string    { return &v }

// skipIfNoDB skips the test if the database is not reachable.
func skipIfNoDB(t *testing.T) {
	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{})
	if err != nil {
		t.Skipf("Skipping integration test: cannot connect to database: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Skipf("Skipping integration test: %v", err)
	}
	sqlDB.Close()
}

func newTestRepo(t *testing.T) *repository.BillingRepository {
	repo, err := repository.NewBillingRepository(testDSN)
	require.NoError(t, err, "Failed to create repository")
	return repo
}

func setupHandlerAndRepo(t *testing.T) (*SessionChangeHandler, *repository.BillingRepository) {
	repo := newTestRepo(t)
	handler := NewSessionChangeHandler(repo)
	return handler, repo
}

func cleanupBillingTables(t *testing.T, repo *repository.BillingRepository) {
	db := repo.DB()
	db.Exec("DELETE FROM billing_ledger WHERE session_id = ?", testSessionID)
	db.Exec("DELETE FROM billing_cdc_processed_events WHERE primary_key = ?", testSessionID)
	db.Exec("UPDATE billing_accounts SET balance_micros = 0, updated_at = NOW() WHERE owner_id = ? AND owner_type = 'user'", testUserID)
}

// makeUpdate creates a format.Update message with the given data maps.
func makeUpdate(newData, oldData map[string]any) *format.Update {
	return &format.Update{
		MessageTime:    time.UnixMilli(1234567890),
		NewDecoded:     newData,
		OldDecoded:     oldData,
		TableNamespace: "public",
		TableName:      "session",
		OID:            16384,
		XID:            570,
	}
}

// makeEvent creates a BillingEvent from raw before/after data for direct process testing.
func makeEvent(sourceLSN string, txID int64, beforeCost, afterCost float64) *model.BillingEvent {
	return &model.BillingEvent{
		SourceLSN:       sourceLSN,
		TxID:            txID,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      testSessionID,
		TsMs:            1234567890,
		WorkspaceID:     strPtr(testWorkspaceID),
		ProjectID:       strPtr("proj_test_001"),
		BeforeCost:      floatPtr(beforeCost),
		AfterCost:       floatPtr(afterCost),
		TokensInput:     intPtr(1000),
		TokensOutput:    intPtr(500),
		TokensReasoning: intPtr(200),
		TokensCacheRead: intPtr(50),
		TokensCacheWrite: intPtr(10),
	}
}

// TestCreateLedgerEntryOnCostIncrease — Session UPDATE with cost increase → ledger entry created
func TestCreateLedgerEntryOnCostIncrease(t *testing.T) {
	skipIfNoDB(t)
	handler, repo := setupHandlerAndRepo(t)
	defer repo.Close()
	defer cleanupBillingTables(t, repo)

	newData := map[string]any{
		"id":               testSessionID,
		"cost":             2.5,
		"workspace_id":     testWorkspaceID,
		"project_id":       "proj_test_001",
		"tokens_input":     float64(2000),
		"tokens_output":    float64(800),
		"tokens_reasoning": float64(300),
		"tokens_cache_read": float64(60),
		"tokens_cache_write": float64(20),
	}
	oldData := map[string]any{
		"id":               testSessionID,
		"cost":             1.0,
		"workspace_id":     testWorkspaceID,
		"project_id":       "proj_test_001",
		"tokens_input":     float64(1000),
		"tokens_output":    float64(500),
		"tokens_reasoning": float64(200),
		"tokens_cache_read": float64(50),
		"tokens_cache_write": float64(10),
	}

	msg := makeUpdate(newData, oldData)
	err := handler.handleUpdate(msg)
	require.NoError(t, err)

	// Verify ledger entry
	var ledger repository.BillingLedger
	err = repo.DB().Where("session_id = ?", testSessionID).First(&ledger).Error
	require.NoError(t, err)
	assert.Equal(t, int64(-1_500_000), ledger.AmountMicros)
	assert.Equal(t, int64(-1_500_000), ledger.BalanceAfterMicros)
	assert.Equal(t, "charge", ledger.EntryType)
	assert.Equal(t, "session_token", ledger.SourceType)
	assert.Equal(t, testSessionID, ledger.SessionID)
	assert.Equal(t, testWorkspaceID, *ledger.WorkspaceID)
	assert.Equal(t, testUserID, ledger.UserID)
	assert.NotEmpty(t, ledger.AccountID)

	// Only one ledger entry
	var count int64
	repo.DB().Model(&repository.BillingLedger{}).Where("session_id = ?", testSessionID).Count(&count)
	assert.Equal(t, int64(1), count)

	// Verify account balance updated
	var account repository.BillingAccount
	err = repo.DB().Where("owner_id = ? AND owner_type = ?", testUserID, "user").First(&account).Error
	require.NoError(t, err)
	assert.Equal(t, int64(-1_500_000), account.BalanceMicros)

	// Verify processed event recorded
	var peCount int64
	repo.DB().Model(&repository.ProcessedEvent{}).
		Where("primary_key = ? AND source_lsn = ?", testSessionID, "0/23A").
		Count(&peCount)
	assert.Equal(t, int64(1), peCount)
}

// TestNotDuplicateOnSameEvent — Duplicate event → second call caught as DuplicateEventError
func TestNotDuplicateOnSameEvent(t *testing.T) {
	skipIfNoDB(t)
	handler, repo := setupHandlerAndRepo(t)
	defer repo.Close()
	defer cleanupBillingTables(t, repo)

	newData := map[string]any{
		"id":           testSessionID,
		"cost":         3.0,
		"workspace_id": testWorkspaceID,
		"project_id":   "proj_test_001",
	}
	oldData := map[string]any{
		"id":           testSessionID,
		"cost":         1.0,
		"workspace_id": testWorkspaceID,
		"project_id":   "proj_test_001",
	}

	msg := makeUpdate(newData, oldData)
	// First call — should succeed and create ledger entry
	err := handler.handleUpdate(msg)
	require.NoError(t, err)

	// Second identical call — should NOT error (catches DuplicateEventError internally)
	err = handler.handleUpdate(msg)
	require.NoError(t, err)

	// Verify exactly ONE ledger entry
	var ledgerCount int64
	repo.DB().Model(&repository.BillingLedger{}).Where("session_id = ?", testSessionID).Count(&ledgerCount)
	assert.Equal(t, int64(1), ledgerCount)

	// Verify exactly ONE processed event
	var peCount int64
	repo.DB().Model(&repository.ProcessedEvent{}).
		Where("primary_key = ? AND source_lsn = ?", testSessionID, "0/23A").
		Count(&peCount)
	assert.Equal(t, int64(1), peCount)
}

// TestSkipUnchangedCost — Session UPDATE with same cost → skipped
func TestSkipUnchangedCost(t *testing.T) {
	skipIfNoDB(t)
	handler, repo := setupHandlerAndRepo(t)
	defer repo.Close()
	defer cleanupBillingTables(t, repo)

	newData := map[string]any{
		"id":           testSessionID,
		"cost":         1.0,
		"workspace_id": testWorkspaceID,
		"project_id":   "proj_test_001",
	}
	oldData := map[string]any{
		"id":           testSessionID,
		"cost":         1.0,
		"workspace_id": testWorkspaceID,
		"project_id":   "proj_test_001",
	}

	msg := makeUpdate(newData, oldData)
	err := handler.handleUpdate(msg)
	require.NoError(t, err)

	// Verify no ledger entry was written
	var ledgerCount int64
	repo.DB().Model(&repository.BillingLedger{}).Where("session_id = ?", testSessionID).Count(&ledgerCount)
	assert.Equal(t, int64(0), ledgerCount)

	// Verify no processed event was recorded
	var peCount int64
	repo.DB().Model(&repository.ProcessedEvent{}).Where("primary_key = ?", testSessionID).Count(&peCount)
	assert.Equal(t, int64(0), peCount)

	// Account balance should still be 0 (no charge)
	var account repository.BillingAccount
	err = repo.DB().Where("owner_id = ? AND owner_type = ?", testUserID, "user").First(&account).Error
	if err == nil {
		assert.Equal(t, int64(0), account.BalanceMicros)
	}
}
