package repository

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/openimago/billing-cdc-worker/model"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// BillingAccount maps to the billing_accounts table.
type BillingAccount struct {
	ID                  string    `gorm:"primaryKey;column:id"`
	OwnerType           string    `gorm:"column:owner_type"`
	OwnerID             string    `gorm:"column:owner_id"`
	Currency            string    `gorm:"column:currency"`
	BalanceMicros       int64     `gorm:"column:balance_micros"`
	MinimumBalanceMicros int64    `gorm:"column:minimum_balance_micros"`
	CreditLimitMicros   int64     `gorm:"column:credit_limit_micros"`
	Status              string    `gorm:"column:status"`
	CreatedAt           time.Time `gorm:"column:created_at"`
	UpdatedAt           time.Time `gorm:"column:updated_at"`
}

func (BillingAccount) TableName() string { return "billing_accounts" }

// BillingLedger maps to the billing_ledger table.
type BillingLedger struct {
	ID                 string    `gorm:"primaryKey;column:id"`
	AccountID          string    `gorm:"column:account_id"`
	UserID             string    `gorm:"column:user_id"`
	WorkspaceID        *string   `gorm:"column:workspace_id"`
	ProjectID          *string   `gorm:"column:project_id"`
	SessionID          string    `gorm:"column:session_id"`
	EntryType          string    `gorm:"column:entry_type"`
	SourceType         string    `gorm:"column:source_type"`
	SourceID           string    `gorm:"column:source_id"`
	SourceStatus       string    `gorm:"column:source_status"`
	AmountMicros       int64     `gorm:"column:amount_micros"`
	BalanceAfterMicros int64     `gorm:"column:balance_after_micros"`
	Currency           string    `gorm:"column:currency"`
	PricingSnapshot    string    `gorm:"column:pricing_snapshot;type:jsonb"`
	Metadata           string    `gorm:"column:metadata;type:jsonb"`
	CreatedAt          time.Time `gorm:"column:created_at"`
}

func (BillingLedger) TableName() string { return "billing_ledger" }

// ProcessedEvent maps to the billing_cdc_processed_events table.
type ProcessedEvent struct {
	ID          string    `gorm:"primaryKey;column:id"`
	SourceLSN   string    `gorm:"column:source_lsn"`
	TxID        string    `gorm:"column:txid"`
	EventTable  string    `gorm:"column:table_name"`
	Operation   string    `gorm:"column:operation"`
	PrimaryKey  string    `gorm:"column:primary_key"`
	ProcessedAt time.Time `gorm:"column:processed_at"`
	Metadata    string    `gorm:"column:metadata;type:jsonb;default:\"{}\""`
}

func (ProcessedEvent) TableName() string { return "billing_cdc_processed_events" }

// DuplicateEventError indicates the event was already processed.
type DuplicateEventError struct {
	Message string
}

func (e *DuplicateEventError) Error() string { return e.Message }

// BillingRepository provides billing write operations using GORM.
type BillingRepository struct {
	db *gorm.DB
}

// NewBillingRepository creates a new repository with a GORM connection pool.
func NewBillingRepository(dsn string) (*BillingRepository, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		SkipDefaultTransaction: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get underlying sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(4)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(600 * time.Second)
	sqlDB.SetConnMaxIdleTime(300 * time.Second)

	return &BillingRepository{db: db}, nil
}

// ResolveUserIDFromWorkspace resolves a user ID from a workspace ID.
//
// Strategy:
// 1. Query workspace.user_id
// 2. Fall back: query users.workspace_id
func (r *BillingRepository) ResolveUserIDFromWorkspace(workspaceID string) (string, error) {
	if strings.TrimSpace(workspaceID) == "" {
		return "", nil
	}

	// 1. Try workspace.user_id
	var userID string
	err := r.db.Raw("SELECT user_id FROM workspace WHERE id = ?", workspaceID).Scan(&userID).Error
	if err == nil && strings.TrimSpace(userID) != "" {
		return userID, nil
	}

	// 2. Fall back: users.workspace_id
	err = r.db.Raw("SELECT id FROM users WHERE workspace_id = ? LIMIT 1", workspaceID).Scan(&userID).Error
	if err == nil && strings.TrimSpace(userID) != "" {
		return userID, nil
	}

	return "", nil
}

// GetOrCreateAccount gets or creates a billing account for a user.
func (r *BillingRepository) GetOrCreateAccount(userID, currency string) (string, error) {
	if currency == "" {
		currency = "CNY"
	}

	// Try to find existing account
	var account BillingAccount
	err := r.db.Where("owner_type = ? AND owner_id = ?", "user", userID).First(&account).Error
	if err == nil {
		return account.ID, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", fmt.Errorf("failed to find account: %w", err)
	}

	// Create new account
	accountID := "bac_" + generateShortUUID()
	newAccount := BillingAccount{
		ID:                  accountID,
		OwnerType:           "user",
		OwnerID:             userID,
		Currency:            currency,
		BalanceMicros:       0,
		MinimumBalanceMicros: 0,
		CreditLimitMicros:   0,
		Status:              "active",
		CreatedAt:           time.Now(),
		UpdatedAt:           time.Now(),
	}

	// ON CONFLICT (owner_type, owner_id) DO NOTHING
	result := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(&newAccount)
	if result.Error != nil {
		return "", fmt.Errorf("failed to create account: %w", result.Error)
	}

	// If not inserted (conflict), re-read
	if result.RowsAffected == 0 {
		err = r.db.Where("owner_type = ? AND owner_id = ?", "user", userID).First(&account).Error
		if err != nil {
			return "", fmt.Errorf("failed to refetch account: %w", err)
		}
		return account.ID, nil
	}

	return accountID, nil
}

// ProcessSessionCharge processes a session cost charge in a single database transaction:
// 1. Insert a billing_cdc_processed_events row. If unique conflict, skip.
// 2. Lock the billing account row with FOR UPDATE.
// 3. Update the account balance.
// 4. Insert a billing_ledger entry.
func (r *BillingRepository) ProcessSessionCharge(event *model.BillingEvent, accountID, userID string, amountMicros int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 1. Insert processed event
		if err := insertProcessedEvent(tx, event); err != nil {
			return err
		}

		// 2. Lock and update account balance
		balanceAfter, err := lockAndUpdateBalance(tx, accountID, amountMicros)
		if err != nil {
			return err
		}

		// 3. Insert ledger entry
		if err := insertLedgerEntry(tx, event, accountID, userID, amountMicros, balanceAfter); err != nil {
			return err
		}

		return nil
	})
}

func insertProcessedEvent(tx *gorm.DB, event *model.BillingEvent) error {
	id := "bce_" + generateShortUUID()
	processedEvent := ProcessedEvent{
		ID:          id,
		SourceLSN:   event.SourceLSN,
		TxID:        fmt.Sprintf("%d", event.TxID),
		EventTable:  event.TableName,
		Operation:   event.Operation,
		PrimaryKey:  event.PrimaryKey,
		ProcessedAt: time.Now(),
		Metadata:    "{}",
	}

	err := tx.Create(&processedEvent).Error
	if err != nil {
		if isDuplicateKeyError(err) {
			return &DuplicateEventError{
				Message: fmt.Sprintf("Event already processed: %s", event.UniquenessKey()),
			}
		}
		return fmt.Errorf("failed to insert processed event: %w", err)
	}

	return nil
}

func lockAndUpdateBalance(tx *gorm.DB, accountID string, amountMicros int64) (int64, error) {
	var account BillingAccount
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", accountID).
		First(&account).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 0, fmt.Errorf("billing account not found: %s", accountID)
		}
		return 0, fmt.Errorf("failed to lock account: %w", err)
	}

	newBalance := account.BalanceMicros + amountMicros

	err = tx.Model(&BillingAccount{}).
		Where("id = ?", accountID).
		Updates(map[string]interface{}{
			"balance_micros": newBalance,
			"updated_at":     time.Now(),
		}).Error
	if err != nil {
		return 0, fmt.Errorf("failed to update balance: %w", err)
	}

	return newBalance, nil
}

func insertLedgerEntry(tx *gorm.DB, event *model.BillingEvent, accountID, userID string, amountMicros, balanceAfterMicros int64) error {
	id := "bdl_" + generateShortUUID()
	pricingSnapshot := buildPricingSnapshot(event)
	metadata := buildMetadata(event)

	ledger := BillingLedger{
		ID:                 id,
		AccountID:          accountID,
		UserID:             userID,
		WorkspaceID:        event.WorkspaceID,
		ProjectID:          event.ProjectID,
		SessionID:          event.PrimaryKey,
		EntryType:          "charge",
		SourceType:         "session_token",
		SourceID:           event.UniquenessKey(),
		SourceStatus:       "completed",
		AmountMicros:       amountMicros,
		BalanceAfterMicros: balanceAfterMicros,
		Currency:           "CNY",
		PricingSnapshot:    pricingSnapshot,
		Metadata:           metadata,
		CreatedAt:          time.Now(),
	}

	return tx.Create(&ledger).Error
}

func buildPricingSnapshot(event *model.BillingEvent) string {
	tokensInput := int64(0)
	if event.TokensInput != nil {
		tokensInput = *event.TokensInput
	}
	tokensOutput := int64(0)
	if event.TokensOutput != nil {
		tokensOutput = *event.TokensOutput
	}
	tokensReasoning := int64(0)
	if event.TokensReasoning != nil {
		tokensReasoning = *event.TokensReasoning
	}
	tokensCacheRead := int64(0)
	if event.TokensCacheRead != nil {
		tokensCacheRead = *event.TokensCacheRead
	}
	tokensCacheWrite := int64(0)
	if event.TokensCacheWrite != nil {
		tokensCacheWrite = *event.TokensCacheWrite
	}

	beforeStr := safeJsonNumber(event.BeforeCost)
	afterStr := safeJsonNumber(event.AfterCost)

	return fmt.Sprintf(
		`{"before_cost": %s, "after_cost": %s, `+
			`"tokens_input": %d, "tokens_output": %d, `+
			`"tokens_reasoning": %d, "tokens_cache_read": %d, "tokens_cache_write": %d}`,
		beforeStr, afterStr,
		tokensInput, tokensOutput, tokensReasoning,
		tokensCacheRead, tokensCacheWrite,
	)
}

func buildMetadata(event *model.BillingEvent) string {
	return fmt.Sprintf(
		`{"source_lsn": %s, "txid": %d, "table_name": %s, `+
			`"operation": %s, "ts_ms": %d}`,
		escapeJson(event.SourceLSN),
		event.TxID,
		escapeJson(event.TableName),
		escapeJson(event.Operation),
		event.TsMs,
	)
}

func safeJsonNumber(v *float64) string {
	if v == nil {
		return "null"
	}
	if math.IsNaN(*v) || math.IsInf(*v, 0) {
		return "null"
	}
	// Use json.Marshal to get proper formatting
	b, err := json.Marshal(*v)
	if err != nil {
		return "null"
	}
	return string(b)
}

func escapeJson(s string) string {
	b, err := json.Marshal(s)
	if err != nil {
		return "null"
	}
	return string(b)
}

// Close closes the underlying database connection pool.
func (r *BillingRepository) Close() error {
	sqlDB, err := r.db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// DB returns the underlying GORM database instance (for testing).
func (r *BillingRepository) DB() *gorm.DB {
	return r.db
}

// isDuplicateKeyError checks if the error is a PostgreSQL unique violation (code 23505).
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "23505") ||
		strings.Contains(errStr, "duplicate key") ||
		strings.Contains(errStr, "unique constraint")
}

func generateShortUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)[:25]
}
