package repository

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// ensureExpiresAtColumn makes the test schema match the 6a migration (ADR 0010)
// regardless of whether this test DB has been migrated yet.
func ensureExpiresAtColumn(t *testing.T, db *gorm.DB) {
	require.NoError(t, db.Exec(
		"ALTER TABLE billing_ledger ADD COLUMN IF NOT EXISTS expires_at timestamptz",
	).Error)
}

func cleanupExpiry(db *gorm.DB, accountID, userID string) {
	db.Exec("DELETE FROM billing_ledger WHERE account_id = ?", accountID)
	db.Exec("DELETE FROM billing_accounts WHERE owner_id = ?", userID)
}

// insertPrecharge writes a media pre-charge ledger row directly (does not touch
// the account balance — that models the immediate-debit already having happened).
func insertPrecharge(t *testing.T, db *gorm.DB, accountID, userID, sourceID string, amountMicros int64, sourceStatus string, expiresAt *time.Time) {
	entry := BillingLedger{
		ID:                 "bdl_" + generateShortUUID(),
		AccountID:          accountID,
		UserID:             userID,
		SessionID:          "ses_expiry_test",
		EntryType:          "charge",
		SourceType:         "toolcall",
		SourceID:           sourceID,
		SourceStatus:       sourceStatus,
		AmountMicros:       amountMicros,
		BalanceAfterMicros: amountMicros,
		Currency:           "CNY",
		PricingSnapshot:    "{}",
		Metadata:           "{}",
		CreatedAt:          time.Now(),
		ExpiresAt:          expiresAt,
	}
	require.NoError(t, db.Create(&entry).Error)
}

// insertRefund writes a refund entry linked to a charge's source_id, mirroring
// the TS refundToolCallPrecharge metadata contract.
func insertRefund(t *testing.T, db *gorm.DB, accountID, userID, chargeSourceID string, amountMicros int64) {
	entry := BillingLedger{
		ID:                 "bdl_" + generateShortUUID(),
		AccountID:          accountID,
		UserID:             userID,
		SessionID:          "ses_expiry_test",
		EntryType:          "refund",
		SourceType:         "toolcall_refund",
		SourceID:           "tcr_" + generateShortUUID(),
		SourceStatus:       "completed",
		AmountMicros:       amountMicros,
		BalanceAfterMicros: amountMicros,
		Currency:           "CNY",
		PricingSnapshot:    "{}",
		Metadata:           buildReleaseMetadata(chargeSourceID),
		CreatedAt:          time.Now(),
	}
	require.NoError(t, db.Create(&entry).Error)
}

func countRefunds(db *gorm.DB, accountID, chargeSourceID string) int64 {
	var n int64
	db.Model(&BillingLedger{}).
		Where("entry_type = ? AND account_id = ? AND metadata->>'originalChargeSourceId' = ?",
			"refund", accountID, chargeSourceID).
		Count(&n)
	return n
}

func accountBalance(t *testing.T, db *gorm.DB, accountID string) int64 {
	var account BillingAccount
	require.NoError(t, db.Where("id = ?", accountID).First(&account).Error)
	return account.BalanceMicros
}

func TestReleaseExpiredPrecharge_ReleasesExpiredUnconfirmed(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()
	ensureExpiresAtColumn(t, repo.DB())

	const userID = "user_expiry_release_01"
	accountID, err := repo.GetOrCreateAccount(userID, "CNY")
	require.NoError(t, err)
	defer cleanupExpiry(repo.DB(), accountID, userID)

	past := time.Now().Add(-1 * time.Hour)
	insertPrecharge(t, repo.DB(), accountID, userID, "tch_expired_01", -500_000, "pending", &past)

	released, err := repo.ReleaseExpiredPrecharges()
	require.NoError(t, err)

	// Filter to this test's charge (DB may hold other rows).
	var mine *ReleasedPrecharge
	for i := range released {
		if released[i].ChargeSourceID == "tch_expired_01" {
			mine = &released[i]
		}
	}
	require.NotNil(t, mine, "expected the expired pre-charge to be released")
	assert.Equal(t, accountID, mine.AccountID)
	assert.Equal(t, userID, mine.UserID)
	assert.Equal(t, int64(500_000), mine.RefundMicros)

	// Exactly one refund written, linked to the charge.
	assert.Equal(t, int64(1), countRefunds(repo.DB(), accountID, "tch_expired_01"))
	// Account credited by the refund amount (started at 0).
	assert.Equal(t, int64(500_000), accountBalance(t, repo.DB(), accountID))
}

func TestReleaseExpiredPrecharge_SkipsConfirmed(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()
	ensureExpiresAtColumn(t, repo.DB())

	const userID = "user_expiry_confirmed_01"
	accountID, err := repo.GetOrCreateAccount(userID, "CNY")
	require.NoError(t, err)
	defer cleanupExpiry(repo.DB(), accountID, userID)

	// Confirmed pre-charge: source_status='confirmed', expires_at cleared (NULL).
	insertPrecharge(t, repo.DB(), accountID, userID, "tch_confirmed_01", -500_000, "confirmed", nil)

	released, err := repo.ReleaseExpiredPrecharges()
	require.NoError(t, err)

	for _, r := range released {
		assert.NotEqual(t, "tch_confirmed_01", r.ChargeSourceID, "confirmed charge must not be released")
	}
	assert.Equal(t, int64(0), countRefunds(repo.DB(), accountID, "tch_confirmed_01"))
	assert.Equal(t, int64(0), accountBalance(t, repo.DB(), accountID))
}

func TestReleaseExpiredPrecharge_SkipsAlreadyRefunded(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()
	ensureExpiresAtColumn(t, repo.DB())

	const userID = "user_expiry_refunded_01"
	accountID, err := repo.GetOrCreateAccount(userID, "CNY")
	require.NoError(t, err)
	defer cleanupExpiry(repo.DB(), accountID, userID)

	past := time.Now().Add(-1 * time.Hour)
	insertPrecharge(t, repo.DB(), accountID, userID, "tch_refunded_01", -500_000, "pending", &past)
	// A refund already exists for this charge.
	insertRefund(t, repo.DB(), accountID, userID, "tch_refunded_01", 500_000)

	released, err := repo.ReleaseExpiredPrecharges()
	require.NoError(t, err)

	for _, r := range released {
		assert.NotEqual(t, "tch_refunded_01", r.ChargeSourceID, "already-refunded charge must not be released again")
	}
	// Still exactly one refund — no duplicate.
	assert.Equal(t, int64(1), countRefunds(repo.DB(), accountID, "tch_refunded_01"))
}

func TestReleaseExpiredPrecharge_SkipsNotYetExpired(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()
	ensureExpiresAtColumn(t, repo.DB())

	const userID = "user_expiry_future_01"
	accountID, err := repo.GetOrCreateAccount(userID, "CNY")
	require.NoError(t, err)
	defer cleanupExpiry(repo.DB(), accountID, userID)

	future := time.Now().Add(1 * time.Hour)
	insertPrecharge(t, repo.DB(), accountID, userID, "tch_future_01", -500_000, "pending", &future)

	released, err := repo.ReleaseExpiredPrecharges()
	require.NoError(t, err)

	for _, r := range released {
		assert.NotEqual(t, "tch_future_01", r.ChargeSourceID, "not-yet-expired charge must not be released")
	}
	assert.Equal(t, int64(0), countRefunds(repo.DB(), accountID, "tch_future_01"))
	assert.Equal(t, int64(0), accountBalance(t, repo.DB(), accountID))
}

func TestReleaseExpiredPrecharge_Idempotent(t *testing.T) {
	skipIfNoDB(t)
	repo := newRepo(t)
	defer repo.Close()
	ensureExpiresAtColumn(t, repo.DB())

	const userID = "user_expiry_idempotent_01"
	accountID, err := repo.GetOrCreateAccount(userID, "CNY")
	require.NoError(t, err)
	defer cleanupExpiry(repo.DB(), accountID, userID)

	past := time.Now().Add(-1 * time.Hour)
	insertPrecharge(t, repo.DB(), accountID, userID, "tch_idem_01", -500_000, "pending", &past)

	// First run releases it.
	released1, err := repo.ReleaseExpiredPrecharges()
	require.NoError(t, err)
	found := false
	for _, r := range released1 {
		if r.ChargeSourceID == "tch_idem_01" {
			found = true
		}
	}
	assert.True(t, found, "first run should release the expired pre-charge")

	// Second run is a no-op for this charge.
	released2, err := repo.ReleaseExpiredPrecharges()
	require.NoError(t, err)
	for _, r := range released2 {
		assert.NotEqual(t, "tch_idem_01", r.ChargeSourceID, "second run must not release again")
	}

	// Exactly one refund and one credit despite two runs.
	assert.Equal(t, int64(1), countRefunds(repo.DB(), accountID, "tch_idem_01"))
	assert.Equal(t, int64(500_000), accountBalance(t, repo.DB(), accountID))
}
