package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func floatPtr(v float64) *float64 { return &v }
func intPtr(v int64) *int64      { return &v }
func strPtr(v string) *string    { return &v }

func TestUniquenessKey(t *testing.T) {
	event := BillingEvent{
		SourceLSN:   "0/16B3748",
		TxID:        570,
		TableName:   "public.session",
		Operation:   "u",
		PrimaryKey:  "ses_001",
		TsMs:        1234567890,
		WorkspaceID: strPtr("ws_001"),
		ProjectID:   strPtr("proj_001"),
		BeforeCost:  floatPtr(1.0),
		AfterCost:   floatPtr(2.0),
		TokensInput: intPtr(1000),
		TokensOutput: intPtr(500),
		TokensReasoning: intPtr(200),
		TokensCacheRead: intPtr(50),
		TokensCacheWrite: intPtr(10),
	}

	assert.Equal(t, "0/16B3748::570::public.session::u::ses_001", event.UniquenessKey())
	assert.True(t, event.IsUpdate())
	assert.False(t, event.IsInsert())
	assert.False(t, event.IsDelete())
	assert.False(t, event.IsSnapshot())
}

func TestOperationDetection(t *testing.T) {
	insertEvent := BillingEvent{
		SourceLSN:       "0/ABC",
		TxID:            1,
		TableName:       "public.session",
		Operation:       "c",
		PrimaryKey:      "ses_002",
		TsMs:            0,
		WorkspaceID:     nil,
		ProjectID:       nil,
		BeforeCost:      nil,
		AfterCost:       floatPtr(5.0),
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}
	assert.True(t, insertEvent.IsInsert())
	assert.False(t, insertEvent.IsUpdate())

	deleteEvent := BillingEvent{
		SourceLSN:       "0/DEF",
		TxID:            1,
		TableName:       "public.session",
		Operation:       "d",
		PrimaryKey:      "ses_002",
		TsMs:            0,
		WorkspaceID:     nil,
		ProjectID:       nil,
		BeforeCost:      floatPtr(5.0),
		AfterCost:       nil,
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}
	assert.True(t, deleteEvent.IsDelete())
	assert.False(t, deleteEvent.IsInsert())

	snapshotEvent := BillingEvent{
		SourceLSN:       "0/GHI",
		TxID:            1,
		TableName:       "public.session",
		Operation:       "r",
		PrimaryKey:      "ses_002",
		TsMs:            0,
		WorkspaceID:     nil,
		ProjectID:       nil,
		BeforeCost:      nil,
		AfterCost:       floatPtr(5.0),
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}
	assert.True(t, snapshotEvent.IsSnapshot())
	assert.False(t, snapshotEvent.IsUpdate())
}

func TestPositiveDeltaMicros(t *testing.T) {
	event := BillingEvent{
		SourceLSN:       "0/LSN",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      "ses_003",
		TsMs:            0,
		WorkspaceID:     strPtr("ws_001"),
		ProjectID:       strPtr("proj_001"),
		BeforeCost:      floatPtr(1.0),
		AfterCost:       floatPtr(2.5), // delta = 1.5
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}

	assert.Equal(t, int64(1_500_000), event.DeltaMicros()) // 1.5 * 1M
}

func TestZeroDeltaForUnchangedCost(t *testing.T) {
	event := BillingEvent{
		SourceLSN:       "0/LSN",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      "ses_004",
		TsMs:            0,
		WorkspaceID:     strPtr("ws_001"),
		ProjectID:       strPtr("proj_001"),
		BeforeCost:      floatPtr(5.0),
		AfterCost:       floatPtr(5.0), // delta = 0
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}

	assert.Equal(t, int64(0), event.DeltaMicros())
}

func TestNegativeDeltaForDecreasedCost(t *testing.T) {
	event := BillingEvent{
		SourceLSN:       "0/LSN",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      "ses_005",
		TsMs:            0,
		WorkspaceID:     strPtr("ws_001"),
		ProjectID:       strPtr("proj_001"),
		BeforeCost:      floatPtr(3.0),
		AfterCost:       floatPtr(1.0), // delta = -2.0
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}

	assert.Equal(t, int64(-2_000_000), event.DeltaMicros())
}

func TestZeroDeltaForNullCosts(t *testing.T) {
	event := BillingEvent{
		SourceLSN:       "0/LSN",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      "ses_006",
		TsMs:            0,
		WorkspaceID:     strPtr("ws_001"),
		ProjectID:       strPtr("proj_001"),
		BeforeCost:      nil, // before null
		AfterCost:       floatPtr(2.0),
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}
	assert.Equal(t, int64(0), event.DeltaMicros())

	event2 := BillingEvent{
		SourceLSN:       "0/LSN2",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      "ses_007",
		TsMs:            0,
		WorkspaceID:     strPtr("ws_001"),
		ProjectID:       strPtr("proj_001"),
		BeforeCost:      floatPtr(1.0),
		AfterCost:       nil, // after null
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}
	assert.Equal(t, int64(0), event2.DeltaMicros())
}

func TestFractionalMicrosRounding(t *testing.T) {
	// 1.0000005 - 1.0 = 0.0000005 * 1M = 0.5 -> math.Round(0.5) = 1
	event := BillingEvent{
		SourceLSN:       "0/LSN",
		TxID:            100,
		TableName:       "public.session",
		Operation:       "u",
		PrimaryKey:      "ses_008",
		TsMs:            0,
		WorkspaceID:     strPtr("ws_001"),
		ProjectID:       strPtr("proj_001"),
		BeforeCost:      floatPtr(1.0),
		AfterCost:       floatPtr(1.0000005), // very small increase
		TokensInput:     nil,
		TokensOutput:    nil,
		TokensReasoning: nil,
		TokensCacheRead: nil,
		TokensCacheWrite: nil,
	}

	// delta = 0.0000005 * 1_000_000 = 0.5 -> math.Round(0.5) = 1
	assert.Equal(t, int64(1), event.DeltaMicros())
}
