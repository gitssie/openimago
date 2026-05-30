package com.openimago.billingcdc.handler;

import com.openimago.billingcdc.handler.models.BillingEvent;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link BillingEvent} model and event parsing.
 */
class SessionChangeHandlerTest {

    @Test
    @DisplayName("should build uniqueness key correctly for UPDATE")
    void shouldBuildUniquenessKeyCorrectly() {
        BillingEvent event = new BillingEvent(
                "0/16B3748", 570L, "public.session", "u", "ses_001", 1234567890L,
                "ws_001", "proj_001",
                1.0, 2.0,
                1000L, 500L, 200L, 50L, 10L
        );

        assertThat(event.uniquenessKey()).isEqualTo(
                "0/16B3748::570::public.session::u::ses_001"
        );
        assertThat(event.isUpdate()).isTrue();
        assertThat(event.isInsert()).isFalse();
        assertThat(event.isDelete()).isFalse();
        assertThat(event.isSnapshot()).isFalse();
    }

    @Test
    @DisplayName("should detect insert, delete, and snapshot operations")
    void shouldDetectOperations() {
        BillingEvent insertEvent = new BillingEvent(
                "0/ABC", 1L, "public.session", "c", "ses_002", 0L,
                null, null, null, 5.0, null, null, null, null, null
        );
        assertThat(insertEvent.isInsert()).isTrue();
        assertThat(insertEvent.isUpdate()).isFalse();

        BillingEvent deleteEvent = new BillingEvent(
                "0/DEF", 1L, "public.session", "d", "ses_002", 0L,
                null, null, 5.0, null, null, null, null, null, null
        );
        assertThat(deleteEvent.isDelete()).isTrue();
        assertThat(deleteEvent.isInsert()).isFalse();

        BillingEvent snapshotEvent = new BillingEvent(
                "0/GHI", 1L, "public.session", "r", "ses_002", 0L,
                null, null, null, 5.0, null, null, null, null, null
        );
        assertThat(snapshotEvent.isSnapshot()).isTrue();
        assertThat(snapshotEvent.isUpdate()).isFalse();
    }

    @Test
    @DisplayName("should compute positive delta micros for cost increase")
    void shouldComputePositiveDeltaMicros() {
        BillingEvent event = new BillingEvent(
                "0/LSN", 100L, "public.session", "u", "ses_003", 0L,
                "ws_001", "proj_001",
                1.0, 2.5,  // delta = 1.5
                null, null, null, null, null
        );

        assertThat(event.deltaMicros()).isEqualTo(1_500_000L); // 1.5 * 1M
    }

    @Test
    @DisplayName("should compute zero delta for unchanged cost")
    void shouldComputeZeroDeltaForUnchangedCost() {
        BillingEvent event = new BillingEvent(
                "0/LSN", 100L, "public.session", "u", "ses_004", 0L,
                "ws_001", "proj_001",
                5.0, 5.0,  // delta = 0
                null, null, null, null, null
        );

        assertThat(event.deltaMicros()).isEqualTo(0L);
    }

    @Test
    @DisplayName("should compute negative delta for decreased cost")
    void shouldComputeNegativeDeltaForDecreasedCost() {
        BillingEvent event = new BillingEvent(
                "0/LSN", 100L, "public.session", "u", "ses_005", 0L,
                "ws_001", "proj_001",
                3.0, 1.0,  // delta = -2.0
                null, null, null, null, null
        );

        assertThat(event.deltaMicros()).isEqualTo(-2_000_000L);
    }

    @Test
    @DisplayName("should return zero delta for null costs")
    void shouldReturnZeroDeltaForNullCosts() {
        BillingEvent event = new BillingEvent(
                "0/LSN", 100L, "public.session", "u", "ses_006", 0L,
                "ws_001", "proj_001",
                null, 2.0,  // before null
                null, null, null, null, null
        );
        assertThat(event.deltaMicros()).isEqualTo(0L);

        BillingEvent event2 = new BillingEvent(
                "0/LSN2", 100L, "public.session", "u", "ses_007", 0L,
                "ws_001", "proj_001",
                1.0, null,  // after null
                null, null, null, null, null
        );
        assertThat(event2.deltaMicros()).isEqualTo(0L);
    }

    @Test
    @DisplayName("should compute delta with fractional micros rounding")
    void shouldComputeDeltaWithFractionalMicrosRounding() {
        // 1.0000005 - 1.0 = 0.0000005 * 1M = 0.5 → rounds to 1 (banker's? no, Math.round)
        // Math.round(0.5) = 1 in Java
        BillingEvent event = new BillingEvent(
                "0/LSN", 100L, "public.session", "u", "ses_008", 0L,
                "ws_001", "proj_001",
                1.0, 1.0000005,  // very small increase
                null, null, null, null, null
        );

        // delta = 0.0000005 * 1_000_000 = 0.5 → Math.round(0.5) = 1
        assertThat(event.deltaMicros()).isEqualTo(1L);
    }
}
