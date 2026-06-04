package repository

import (
	"fmt"
	"testing"

	"github.com/openimago/billing-cdc-worker/model"
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

func newRepo(t *testing.T) *BillingRepository {
	repo, err := NewBillingRepository(testDSN)
	require.NoError(t, err, "Failed to create repository")
	return repo
}

func cleanupAccount(t *testing.T, db *gorm.DB) {
	db.Exec("DELETE FROM billing_ledger WHERE session_id = ?", testSessionID)
	db.Exec("DELETE FROM billing_cdc_processed_events WHERE primary_key = ?", testSessionID)
	db.Exec("DELETE FROM billing_accounts WHERE owner_id = ?", testUserID)
}

func TestResolveUserIdFromWorkspace(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()

	userID, err := repo.ResolveUserIDFromWorkspace(testWorkspaceID)
	require.NoError(t, err)
	assert.Equal(t, testUserID, userID)
}

func TestGetOrCreateAccount(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()

	defer cleanupAccount(t, repo.DB())

	// First call: creates a new account
	accountID1, err := repo.GetOrCreateAccount(testUserID, "CNY")
	require.NoError(t, err)
	assert.NotEmpty(t, accountID1)
	assert.True(t, len(accountID1) > 4 && accountID1[:4] == "bac_",
		fmt.Sprintf("Expected account ID to start with 'bac_', got: %s", accountID1))

	// Second call: returns the same account
	accountID2, err := repo.GetOrCreateAccount(testUserID, "CNY")
	require.NoError(t, err)
	assert.Equal(t, accountID1, accountID2)

	// Verify account exists in DB with correct fields
	var account BillingAccount
	err = repo.DB().Where("id = ?", accountID1).First(&account).Error
	require.NoError(t, err)
	assert.Equal(t, "user", account.OwnerType)
	assert.Equal(t, testUserID, account.OwnerID)
	assert.Equal(t, int64(0), account.BalanceMicros)
}

func TestProcessSessionCharge(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()

	defer cleanupAccount(t, repo.DB())

	// Create account first
	accountID, err := repo.GetOrCreateAccount(testUserID, "CNY")
	require.NoError(t, err)

	// Billing event: session cost increased from 1.0 to 2.5
	event := &model.BillingEvent{
		SourceLSN:       "0/16B3748",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      testSessionID,
		TsMs:            1234567890,
		WorkspaceID:     strPtr(testWorkspaceID),
		ProjectID:       strPtr("proj_test_001"),
		BeforeCost:      floatPtr(1.0),
		AfterCost:       floatPtr(2.5),
		TokensInput:     intPtr(1000),
		TokensOutput:    intPtr(500),
		TokensReasoning: intPtr(200),
		TokensCacheRead: intPtr(50),
		TokensCacheWrite: intPtr(10),
	}

	// Charge amount = -(2.5 - 1.0) * 1_000_000 = -1_500_000 micros
	amountMicros := int64(-1_500_000)
	err = repo.ProcessSessionCharge(event, accountID, testUserID, amountMicros)
	require.NoError(t, err)

	// Verify ledger entry was created with correct values
	var ledger BillingLedger
	err = repo.DB().Where("session_id = ?", testSessionID).First(&ledger).Error
	require.NoError(t, err)
	assert.Equal(t, accountID, ledger.AccountID)
	assert.Equal(t, testUserID, ledger.UserID)
	assert.Equal(t, amountMicros, ledger.AmountMicros)
	assert.Equal(t, int64(-1_500_000), ledger.BalanceAfterMicros)
	assert.Equal(t, "charge", ledger.EntryType)
	assert.Equal(t, "session_token", ledger.SourceType)
	assert.Equal(t, testWorkspaceID, *ledger.WorkspaceID)

	// Verify only one ledger entry
	var count int64
	repo.DB().Model(&BillingLedger{}).Where("session_id = ?", testSessionID).Count(&count)
	assert.Equal(t, int64(1), count)

	// Verify account balance was updated
	var account BillingAccount
	err = repo.DB().Where("id = ?", accountID).First(&account).Error
	require.NoError(t, err)
	assert.Equal(t, int64(-1_500_000), account.BalanceMicros)
}

func TestProcessSessionChargeDuplicate(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()

	defer cleanupAccount(t, repo.DB())

	// Create account first
	accountID, err := repo.GetOrCreateAccount(testUserID, "CNY")
	require.NoError(t, err)

	event := &model.BillingEvent{
		SourceLSN:       "0/16B3748",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      testSessionID,
		TsMs:            1234567890,
		WorkspaceID:     strPtr(testWorkspaceID),
		ProjectID:       strPtr("proj_test_001"),
		BeforeCost:      floatPtr(1.0),
		AfterCost:       floatPtr(2.5),
		TokensInput:     intPtr(1000),
		TokensOutput:    intPtr(500),
		TokensReasoning: intPtr(200),
		TokensCacheRead: intPtr(50),
		TokensCacheWrite: intPtr(10),
	}

	amountMicros := int64(-1_500_000)
	// First call succeeds
	err = repo.ProcessSessionCharge(event, accountID, testUserID, amountMicros)
	require.NoError(t, err)

	// Second call with same event should return DuplicateEventError
	err = repo.ProcessSessionCharge(event, accountID, testUserID, amountMicros)
	require.Error(t, err)
	var dupErr *DuplicateEventError
	assert.ErrorAs(t, err, &dupErr, "Expected DuplicateEventError")
	assert.Contains(t, err.Error(), "Event already processed")

	// Verify only one ledger entry exists (no duplicate charge)
	var count int64
	repo.DB().Model(&BillingLedger{}).Where("session_id = ?", testSessionID).Count(&count)
	assert.Equal(t, int64(1), count)
}

func TestProcessSessionChargeTransactionRollback(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()

	defer cleanupAccount(t, repo.DB())

	nonExistentAccountID := "bac_nonexistent"

	event := &model.BillingEvent{
		SourceLSN:       "0/ABC1234",
		TxID:            200,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      testSessionID,
		TsMs:            1234567890,
		WorkspaceID:     strPtr(testWorkspaceID),
		ProjectID:       strPtr("proj_test_001"),
		BeforeCost:      floatPtr(1.0),
		AfterCost:       floatPtr(3.0),
		TokensInput:     intPtr(2000),
		TokensOutput:    intPtr(1000),
		TokensReasoning: intPtr(500),
		TokensCacheRead: intPtr(100),
		TokensCacheWrite: intPtr(50),
	}

	amountMicros := int64(-2_000_000)

	// Should return error because account does not exist
	err := repo.ProcessSessionCharge(event, nonExistentAccountID, testUserID, amountMicros)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "billing account not found")

	// Verify no ledger entry was written (transaction rolled back)
	var ledgerCount int64
	repo.DB().Model(&BillingLedger{}).Where("session_id = ?", testSessionID).Count(&ledgerCount)
	assert.Equal(t, int64(0), ledgerCount)

	// Verify no processed event was recorded (transaction rolled back)
	var eventCount int64
	repo.DB().Model(&ProcessedEvent{}).Where("primary_key = ?", testSessionID).Count(&eventCount)
	assert.Equal(t, int64(0), eventCount)
}
