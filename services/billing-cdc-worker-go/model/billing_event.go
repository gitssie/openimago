package model

import (
	"fmt"
	"math"
	"strings"
)

// BillingEvent is a parsed CDC change event for billing processing.
type BillingEvent struct {
	SourceLSN       string
	TxID            int64
	TableName       string
	Operation       string
	PrimaryKey      string
	TsMs            int64
	WorkspaceID     *string
	ProjectID       *string
	BeforeCost      *float64
	AfterCost       *float64
	TokensInput     *int64
	TokensOutput    *int64
	TokensReasoning *int64
	TokensCacheRead *int64
	TokensCacheWrite *int64
}

// UniquenessKey creates a uniqueness key from source metadata and operation details.
// Format: source_lsn :: txid :: table_name :: operation :: primary_key
func (e BillingEvent) UniquenessKey() string {
	return strings.Join([]string{
		e.SourceLSN,
		fmt.Sprintf("%d", e.TxID),
		e.TableName,
		e.Operation,
		e.PrimaryKey,
	}, "::")
}

// IsInsert returns true if this event is an INSERT.
func (e BillingEvent) IsInsert() bool { return e.Operation == "c" }

// IsUpdate returns true if this event is an UPDATE.
func (e BillingEvent) IsUpdate() bool { return e.Operation == "u" }

// IsDelete returns true if this event is a DELETE.
func (e BillingEvent) IsDelete() bool { return e.Operation == "d" }

// IsSnapshot returns true if this is a snapshot/read event (should be skipped).
func (e BillingEvent) IsSnapshot() bool { return e.Operation == "r" }

// DeltaMicros computes the cost delta in micros (after - before, rounded).
// Returns 0 if costs are nil/missing.
func (e BillingEvent) DeltaMicros() int64 {
	if e.BeforeCost == nil || e.AfterCost == nil {
		return 0
	}
	delta := *e.AfterCost - *e.BeforeCost
	return int64(math.Round(delta * 1_000_000.0))
}
