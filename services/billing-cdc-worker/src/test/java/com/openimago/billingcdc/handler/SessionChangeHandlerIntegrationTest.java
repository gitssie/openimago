package com.openimago.billingcdc.handler;

import com.openimago.billingcdc.config.AppConfig;
import com.openimago.billingcdc.repository.BillingRepository;

import io.debezium.engine.ChangeEvent;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Integration tests for {@link SessionChangeHandler} — parses Debezium-style
 * JSON change events and verifies billing ledger writes against a real PostgreSQL.
 *
 * <p>Requires PostgreSQL on {@code localhost:15432}, database {@code billing_cdc_test},
 * with pre-seeded users and workspaces.</p>
 */
class SessionChangeHandlerIntegrationTest {

    private static final String JDBC_URL = "jdbc:postgresql://localhost:15432/billing_cdc_test";
    private static final String DB_USER = "postgres";
    private static final String DB_PASSWORD = "my-secret-pw";

    private BillingRepository repository;
    private SessionChangeHandler handler;

    @BeforeEach
    void setUp() {
        AppConfig config = new AppConfig(
                "localhost", 15432, "billing_cdc_test", DB_USER, DB_PASSWORD,
                null, null, null,
                null, null, null,
                "public.session",
                "openimago_billing_pub",
                "openimago_billing_slot",
                "openimago_billing",
                "never",
                60_000L,
                JDBC_URL, DB_USER, DB_PASSWORD
        );
        repository = new BillingRepository(config);
        handler = new SessionChangeHandler(repository);
    }

    @AfterEach
    void tearDown() {
        cleanupBillingTables();
        if (repository != null) {
            repository.close();
        }
    }

    private void cleanupBillingTables() {
        try (Connection conn = DriverManager.getConnection(JDBC_URL, DB_USER, DB_PASSWORD)) {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "DELETE FROM billing_ledger WHERE session_id = 'ses_test_001'")) {
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement(
                    "DELETE FROM billing_cdc_processed_events WHERE primary_key = 'ses_test_001'")) {
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement(
                    "UPDATE billing_accounts SET balance_micros = 0, updated_at = NOW() " +
                    "WHERE owner_id = 'user_test_001' AND owner_type = 'user'")) {
                stmt.executeUpdate();
            }
        } catch (Exception e) {
            // Cleanup is best-effort; don't fail tests on cleanup
        }
    }

    /**
     * Creates a minimal {@link ChangeEvent} with the given JSON value string.
     * The handler only reads {@code event.value()}.
     */
    private ChangeEvent<String, String> createChangeEvent(String valueJson) {
        return new ChangeEvent<>() {
            @Override
            public String key() {
                return null;
            }

            @Override
            public String value() {
                return valueJson;
            }

            @Override
            public String destination() {
                return "";
            }

            @Override
            public Integer partition() {
                return null;
            }
        };
    }

    // ── Test 1: Cost increase → ledger entry created ────────────────────────

    @Test
    @DisplayName("Session UPDATE with cost increase → ledger entry created and balance updated")
    void shouldCreateLedgerEntryOnCostIncrease() throws Exception {
        String eventJson = """
        {
            "source": {
                "schema": "public",
                "table": "session",
                "lsn": "0/16B3748",
                "txId": 570
            },
            "op": "u",
            "ts_ms": 1234567890,
            "before": {
                "id": "ses_test_001",
                "cost": 1.0,
                "workspace_id": "ws_test_001",
                "project_id": "proj_test_001",
                "tokens_input": 1000,
                "tokens_output": 500,
                "tokens_reasoning": 200,
                "tokens_cache_read": 50,
                "tokens_cache_write": 10
            },
            "after": {
                "id": "ses_test_001",
                "cost": 2.5,
                "workspace_id": "ws_test_001",
                "project_id": "proj_test_001",
                "tokens_input": 2000,
                "tokens_output": 800,
                "tokens_reasoning": 300,
                "tokens_cache_read": 60,
                "tokens_cache_write": 20
            }
        }
        """;

        handler.handle(createChangeEvent(eventJson));

        // Verify ledger entry
        try (Connection conn = DriverManager.getConnection(JDBC_URL, DB_USER, DB_PASSWORD)) {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT amount_micros, balance_after_micros, entry_type, source_type, " +
                    "session_id, account_id, user_id, workspace_id " +
                    "FROM billing_ledger WHERE session_id = 'ses_test_001'")) {
                ResultSet rs = stmt.executeQuery();
                assertThat(rs.next())
                        .as("Ledger entry should exist for session ses_test_001")
                        .isTrue();
                assertThat(rs.getLong("amount_micros")).isEqualTo(-1_500_000L);
                assertThat(rs.getLong("balance_after_micros")).isEqualTo(-1_500_000L);
                assertThat(rs.getString("entry_type")).isEqualTo("charge");
                assertThat(rs.getString("source_type")).isEqualTo("session_token");
                assertThat(rs.getString("session_id")).isEqualTo("ses_test_001");
                assertThat(rs.getString("workspace_id")).isEqualTo("ws_test_001");
                assertThat(rs.getString("user_id")).isEqualTo("user_test_001");
                assertThat(rs.getString("account_id")).isNotNull();

                assertThat(rs.next())
                        .as("Only one ledger entry should exist")
                        .isFalse();
            }

            // Verify account balance updated
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT balance_micros FROM billing_accounts " +
                    "WHERE owner_id = 'user_test_001' AND owner_type = 'user'")) {
                ResultSet rs = stmt.executeQuery();
                assertThat(rs.next())
                        .as("Billing account should exist for user_test_001")
                        .isTrue();
                assertThat(rs.getLong("balance_micros")).isEqualTo(-1_500_000L);
            }

            // Verify processed event recorded
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT source_lsn, txid, table_name, operation, primary_key " +
                    "FROM billing_cdc_processed_events WHERE primary_key = 'ses_test_001' " +
                    "AND source_lsn = '0/16B3748'")) {
                ResultSet rs = stmt.executeQuery();
                assertThat(rs.next())
                        .as("Processed event should be recorded")
                        .isTrue();
            }
        }
    }

    // ── Test 2: Duplicate event → no duplicate ledger entry ──────────────────

    @Test
    @DisplayName("Duplicate event → second handle() caught as DuplicateEventException, no duplicate rows")
    void shouldNotDuplicateOnSameEvent() throws Exception {
        String eventJson = """
        {
            "source": {
                "schema": "public",
                "table": "session",
                "lsn": "0/16B3749",
                "txId": 571
            },
            "op": "u",
            "ts_ms": 1234567891,
            "before": {
                "id": "ses_test_001",
                "cost": 1.0,
                "workspace_id": "ws_test_001",
                "project_id": "proj_test_001"
            },
            "after": {
                "id": "ses_test_001",
                "cost": 3.0,
                "workspace_id": "ws_test_001",
                "project_id": "proj_test_001"
            }
        }
        """;

        // First event — should succeed and create ledger entry
        handler.handle(createChangeEvent(eventJson));

        // Second identical event — should NOT throw RuntimeException
        // The handler catches DuplicateEventException internally and logs it
        assertThatCode(() -> handler.handle(createChangeEvent(eventJson)))
                .as("Duplicate event should be silently consumed, not re-thrown")
                .doesNotThrowAnyException();

        // Verify exactly ONE ledger entry
        try (Connection conn = DriverManager.getConnection(JDBC_URL, DB_USER, DB_PASSWORD)) {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT COUNT(*) as cnt FROM billing_ledger WHERE session_id = 'ses_test_001'")) {
                ResultSet rs = stmt.executeQuery();
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("cnt"))
                        .as("Duplicate event should NOT create a second ledger entry")
                        .isEqualTo(1);
            }

            // Verify exactly ONE processed event
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT COUNT(*) as cnt FROM billing_cdc_processed_events " +
                    "WHERE primary_key = 'ses_test_001' AND source_lsn = '0/16B3749'")) {
                ResultSet rs = stmt.executeQuery();
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("cnt"))
                        .as("Duplicate event should NOT create a second processed event")
                        .isEqualTo(1);
            }
        }
    }

    // ── Test 3: Unchanged cost → skipped ─────────────────────────────────────

    @Test
    @DisplayName("Session UPDATE with same cost → skipped (no ledger entry)")
    void shouldSkipUnchangedCost() throws Exception {
        String eventJson = """
        {
            "source": {
                "schema": "public",
                "table": "session",
                "lsn": "0/16B3750",
                "txId": 572
            },
            "op": "u",
            "ts_ms": 1234567892,
            "before": {
                "id": "ses_test_001",
                "cost": 1.0,
                "workspace_id": "ws_test_001",
                "project_id": "proj_test_001"
            },
            "after": {
                "id": "ses_test_001",
                "cost": 1.0,
                "workspace_id": "ws_test_001",
                "project_id": "proj_test_001"
            }
        }
        """;

        handler.handle(createChangeEvent(eventJson));

        // Verify no ledger entry or processed event was written
        try (Connection conn = DriverManager.getConnection(JDBC_URL, DB_USER, DB_PASSWORD)) {
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT COUNT(*) as cnt FROM billing_ledger WHERE session_id = 'ses_test_001'")) {
                ResultSet rs = stmt.executeQuery();
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("cnt"))
                        .as("Unchanged cost should NOT create a ledger entry")
                        .isEqualTo(0);
            }

            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT COUNT(*) as cnt FROM billing_cdc_processed_events " +
                    "WHERE primary_key = 'ses_test_001'")) {
                ResultSet rs = stmt.executeQuery();
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("cnt"))
                        .as("Unchanged cost should NOT create a processed event")
                        .isEqualTo(0);
            }

            // Account balance should still be 0 (no charge)
            try (PreparedStatement stmt = conn.prepareStatement(
                    "SELECT balance_micros FROM billing_accounts " +
                    "WHERE owner_id = 'user_test_001' AND owner_type = 'user'")) {
                ResultSet rs = stmt.executeQuery();
                // Account might not exist yet if never created — that's fine
                if (rs.next()) {
                    assertThat(rs.getLong("balance_micros"))
                            .as("Account balance should be unchanged (0)")
                            .isEqualTo(0L);
                }
            }
        }
    }
}
