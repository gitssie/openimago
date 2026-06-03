package cdc

import (
	"errors"
	"fmt"
	"log"
	"math"

	"github.com/Trendyol/go-pq-cdc/pq/message/format"
	"github.com/Trendyol/go-pq-cdc/pq/replication"
	"github.com/openimago/billing-cdc-worker/model"
	"github.com/openimago/billing-cdc-worker/repository"
)

// SessionChangeHandler handles CDC change events for the public.session table.
//
// For UPDATE events where after.cost > before.cost, this handler:
// 1. Extracts data from the go-pq-cdc format message
// 2. Skips non-session, non-update, unchanged/decreased cost, and zero/negative deltas
// 3. Converts the cost delta to signed micros (charge = negative)
// 4. Resolves the user billing account from the session's workspace
// 5. Writes a billing ledger charge and CDC processed event in one DB transaction
type SessionChangeHandler struct {
	repo *repository.BillingRepository
}

// NewSessionChangeHandler creates a new handler with the given repository.
func NewSessionChangeHandler(repo *repository.BillingRepository) *SessionChangeHandler {
	return &SessionChangeHandler{repo: repo}
}

// Handle processes a go-pq-cdc listener context.
// This is the callback function for go-pq-cdc's NewConnector.
func (h *SessionChangeHandler) Handle(ctx *replication.ListenerContext) {
	switch msg := ctx.Message.(type) {
	case *format.Update:
		if err := h.handleUpdate(msg); err != nil {
			var dupErr *repository.DuplicateEventError
			if errors.As(err, &dupErr) {
				log.Printf("Duplicate event - skip: %v", dupErr)
			} else {
				log.Printf("ERROR: Failed to handle CDC event - NOT acknowledging: %v", err)
				// Do NOT ack on failure — preserves offset
				return
			}
		}

	case *format.Insert, *format.Delete, *format.Snapshot:
		// Only UPDATE events are processed for billing
	}

	if err := ctx.Ack(); err != nil {
		log.Printf("ERROR: Failed to ack CDC message: %v", err)
	}
}

// handleUpdate processes a single UPDATE message from go-pq-cdc.
func (h *SessionChangeHandler) handleUpdate(msg *format.Update) error {
	billingEvent := h.parseUpdateToEvent(msg)
	if billingEvent == nil {
		return nil // Skipped by parse logic
	}

	err := h.processBillingEvent(billingEvent)
	if err != nil {
		var dupErr *repository.DuplicateEventError
		if errors.As(err, &dupErr) {
			log.Printf("Duplicate event - skip: %v", dupErr)
			return nil // Swallow duplicate error — already processed
		}
		return err
	}
	return nil
}

// parseUpdateToEvent converts a format.Update to a BillingEvent.
// Returns nil if the event should be skipped.
func (h *SessionChangeHandler) parseUpdateToEvent(msg *format.Update) *model.BillingEvent {
	schema := msg.TableNamespace
	table := msg.TableName

	// Skip non-session events
	if schema != "public" || table != "session" {
		log.Printf("Skipping non-session event: %s.%s", schema, table)
		return nil
	}

	// Get before/after data
	before := msg.OldDecoded
	after := msg.NewDecoded

	if before == nil || after == nil {
		log.Printf("Skipping UPDATE with missing before or after data")
		return nil
	}

	// Extract cost values
	beforeCost := getFloat64(before, "cost")
	afterCost := getFloat64(after, "cost")

	if beforeCost == nil || afterCost == nil {
		log.Printf("Skipping UPDATE with missing cost values")
		return nil
	}

	// Skip unchanged or decreased cost
	if *afterCost <= *beforeCost {
		log.Printf("Skipping UPDATE with unchanged/decreased cost: before=%v after=%v", *beforeCost, *afterCost)
		return nil
	}

	// Compute delta
	delta := *afterCost - *beforeCost
	deltaMicros := int64(math.Round(delta * 1_000_000.0))

	// Skip zero or negative deltas
	if deltaMicros <= 0 {
		log.Printf("Skipping UPDATE with zero/negative delta: %d micros", deltaMicros)
		return nil
	}

	// Extract identifiers
	primaryKey := getString(after, "id")
	if primaryKey == "" {
		log.Printf("Skipping UPDATE with no session id in after row")
		return nil
	}

	// Build source LSN from XID and OID (go-pq-cdc doesn't expose raw LSN on DML messages)
	sourceLSN := fmt.Sprintf("0/%X", msg.XID)
	txID := int64(msg.XID)
	tsMs := msg.MessageTime.UnixMilli()

	workspaceID := getStringPtr(after, "workspace_id")
	projectID := getStringPtr(after, "project_id")

	tokensInput := getInt64Ptr(after, "tokens_input")
	tokensOutput := getInt64Ptr(after, "tokens_output")
	tokensReasoning := getInt64Ptr(after, "tokens_reasoning")
	tokensCacheRead := getInt64Ptr(after, "tokens_cache_read")
	tokensCacheWrite := getInt64Ptr(after, "tokens_cache_write")

	tableName := fmt.Sprintf("%s.%s", schema, table)
	operation := "u" // Debezium-compatible operation code

	log.Printf("Parsed session UPDATE: session=%s beforeCost=%v afterCost=%v deltaMicros=%d",
		primaryKey, *beforeCost, *afterCost, deltaMicros)

	return &model.BillingEvent{
		SourceLSN:       sourceLSN,
		TxID:            txID,
		TableName:       tableName,
		Operation:       operation,
		PrimaryKey:      primaryKey,
		TsMs:            tsMs,
		WorkspaceID:     workspaceID,
		ProjectID:       projectID,
		BeforeCost:      beforeCost,
		AfterCost:       afterCost,
		TokensInput:     tokensInput,
		TokensOutput:    tokensOutput,
		TokensReasoning: tokensReasoning,
		TokensCacheRead: tokensCacheRead,
		TokensCacheWrite: tokensCacheWrite,
	}
}

// processBillingEvent processes a parsed billing event: resolves account, computes charge, writes to DB.
func (h *SessionChangeHandler) processBillingEvent(event *model.BillingEvent) error {
	deltaMicros := event.DeltaMicros()

	// Amount for a charge is NEGATIVE (money leaves the account)
	amountMicros := -deltaMicros

	if amountMicros >= 0 {
		log.Printf("Skipping non-negative charge amount: %d micros", amountMicros)
		return nil
	}

	// Resolve user ID from workspace
	workspaceID := ""
	if event.WorkspaceID != nil {
		workspaceID = *event.WorkspaceID
	}
	userID, err := h.repo.ResolveUserIDFromWorkspace(workspaceID)
	if err != nil {
		return fmt.Errorf("failed to resolve user for workspace_id=%s: %w", workspaceID, err)
	}
	if userID == "" {
		log.Printf("Cannot resolve user for workspace_id=%s - skipping charge for session=%s",
			workspaceID, event.PrimaryKey)
		return nil
	}

	// Get or create billing account
	accountID, err := h.repo.GetOrCreateAccount(userID, "CNY")
	if err != nil {
		return fmt.Errorf("failed to get or create account for user=%s: %w", userID, err)
	}

	// Execute the transactional charge
	err = h.repo.ProcessSessionCharge(event, accountID, userID, amountMicros)
	if err != nil {
		return fmt.Errorf("failed to process session charge: %w", err)
	}

	log.Printf("Successfully processed CDC charge: session=%s user=%s amount=%d micros",
		event.PrimaryKey, userID, amountMicros)
	return nil
}

// --- Helper functions for extracting typed values from map[string]any ---

func getString(data map[string]any, key string) string {
	v, ok := data[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return fmt.Sprintf("%v", v)
	}
	return s
}

func getStringPtr(data map[string]any, key string) *string {
	v, ok := data[key]
	if !ok || v == nil {
		return nil
	}
	s, ok := v.(string)
	if !ok {
		str := fmt.Sprintf("%v", v)
		return &str
	}
	if s == "" {
		return nil
	}
	return &s
}

func getFloat64(data map[string]any, key string) *float64 {
	v, ok := data[key]
	if !ok || v == nil {
		return nil
	}
	switch val := v.(type) {
	case float64:
		if math.IsNaN(val) {
			return nil
		}
		return &val
	case float32:
		f := float64(val)
		return &f
	case int64:
		f := float64(val)
		return &f
	case int32:
		f := float64(val)
		return &f
	case int:
		f := float64(val)
		return &f
	case string:
		// Try to parse as float (some drivers might return numeric as string)
		var f float64
		if _, err := fmt.Sscanf(val, "%f", &f); err == nil {
			return &f
		}
	}
	return nil
}

func getInt64Ptr(data map[string]any, key string) *int64 {
	v, ok := data[key]
	if !ok || v == nil {
		return nil
	}
	switch val := v.(type) {
	case int64:
		return &val
	case int32:
		i := int64(val)
		return &i
	case int:
		i := int64(val)
		return &i
	case float64:
		i := int64(val)
		return &i
	case float32:
		i := int64(val)
		return &i
	}
	return nil
}


