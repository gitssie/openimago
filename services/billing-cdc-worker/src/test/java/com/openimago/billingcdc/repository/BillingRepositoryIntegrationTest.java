package com.openimago.billingcdc.repository;

import com.openimago.billingcdc.config.AppConfig;
import com.openimago.billingcdc.handler.models.BillingEvent;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Integration tests for {@link BillingRepository} against real PostgreSQL.
 *
 * <p>Connects to the test database at {@code localhost:15432/billing_cdc_test}
 * with pre-seeded data (user_test_001, ws_test_001, ses_test_001).</p>
 */
class BillingRepositoryIntegrationTest {

    private static final String TEST_DB_URL = "jdbc:postgresql://localhost:15432/billing_cdc_test";
    private static final String TEST_DB_USER = "postgres";
    private static final String TEST_DB_PASSWORD = "my-secret-pw";

    private static final String TEST_WORKSPACE_ID = "ws_test_001";
    private static final String TEST_USER_ID = "user_test_001";
    private static final String TEST_SESSION_ID = "ses_test_001";

    private static BillingRepository repository;

    @BeforeAll
    static void setUp() {
        AppConfig config = new AppConfig(
                "localhost", 15432, "billing_cdc_test", TEST_DB_USER, TEST_DB_PASSWORD,
                null, null, null,
                null, null, null,
                "public.session",
                "openimago_billing_pub",
                "openimago_billing_slot",
                "openimago_billing",
                "never",
                60_000L,
                TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD
        );
        repository = new BillingRepository(config);
    }

    @AfterAll
    static void tearDown() {
        if (repository != null) {
            repository.close();
        }
    }

    @AfterEach
    void cleanUp() throws SQLException {
        try (Connection conn = DriverManager.getConnection(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD)) {
            // Order: delete ledger first (FK to accounts), then processed events, then accounts
            try (PreparedStatement stmt = conn.prepareStatement(
                    "DELETE FROM billing_ledger WHERE session_id = ?")) {
                stmt.setString(1, TEST_SESSION_ID);
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement(
                    "DELETE FROM billing_cdc_processed_events WHERE primary_key = ?")) {
                stmt.setString(1, TEST_SESSION_ID);
                stmt.executeUpdate();
            }
            try (PreparedStatement stmt = conn.prepareStatement(
                    "DELETE FROM billing_accounts WHERE owner_id = ?")) {
                stmt.setString(1, TEST_USER_ID);
                stmt.executeUpdate();
            }
        }
    }

    @Test
    @DisplayName("resolveUserIdFromWorkspace should return user_test_001 for ws_test_001")
    void resolveUserIdFromWorkspace() {
        String userId = repository.resolveUserIdFromWorkspace(TEST_WORKSPACE_ID);
        assertThat(userId).isEqualTo(TEST_USER_ID);
    }

    @Test
    @DisplayName("getOrCreateAccount should create account and return existing on second call")
    void getOrCreateAccount() throws SQLException {
        // First call: creates a new account
        String accountId1 = repository.getOrCreateAccount(TEST_USER_ID, "CNY");
        assertThat(accountId1).isNotNull().startsWith("bac_");

        // Second call: returns the same account
        String accountId2 = repository.getOrCreateAccount(TEST_USER_ID, "CNY");
        assertThat(accountId2).isEqualTo(accountId1);

        // Verify account exists in DB with correct fields
        try (Connection conn = DriverManager.getConnection(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT id, owner_type, owner_id, balance_micros " +
                     "FROM billing_accounts WHERE id = ?")) {
            stmt.setString(1, accountId1);
            try (ResultSet rs = stmt.executeQuery()) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("owner_type")).isEqualTo("user");
                assertThat(rs.getString("owner_id")).isEqualTo(TEST_USER_ID);
                assertThat(rs.getLong("balance_micros")).isEqualTo(0L);
            }
        }
    }

    @Test
    @DisplayName("processSessionCharge should create ledger entry and update account balance")
    void processSessionCharge() throws SQLException {
        // Create account first
        String accountId = repository.getOrCreateAccount(TEST_USER_ID, "CNY");

        // Billing event: session cost increased from 1.0 to 2.5
        BillingEvent event = new BillingEvent(
                "0/16B3748", 100L, "public.session", "u", TEST_SESSION_ID, 1234567890L,
                TEST_WORKSPACE_ID, "proj_test_001",
                1.0, 2.5,
                1000L, 500L, 200L, 50L, 10L
        );

        // Charge amount = -(2.5 - 1.0) * 1_000_000 = -1_500_000 micros
        long amountMicros = -1_500_000L;
        repository.processSessionCharge(event, accountId, TEST_USER_ID, amountMicros);

        // Verify ledger entry was created with correct values
        try (Connection conn = DriverManager.getConnection(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT account_id, user_id, amount_micros, balance_after_micros, " +
                     "entry_type, source_type, session_id, workspace_id " +
                     "FROM billing_ledger WHERE session_id = ?")) {
            stmt.setString(1, TEST_SESSION_ID);
            try (ResultSet rs = stmt.executeQuery()) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getString("account_id")).isEqualTo(accountId);
                assertThat(rs.getString("user_id")).isEqualTo(TEST_USER_ID);
                assertThat(rs.getLong("amount_micros")).isEqualTo(amountMicros);
                assertThat(rs.getLong("balance_after_micros")).isEqualTo(-1_500_000L);
                assertThat(rs.getString("entry_type")).isEqualTo("charge");
                assertThat(rs.getString("source_type")).isEqualTo("session_token");
                assertThat(rs.getString("workspace_id")).isEqualTo(TEST_WORKSPACE_ID);
                // Only one ledger entry
                assertThat(rs.next()).isFalse();
            }
        }

        // Verify account balance was updated
        try (Connection conn = DriverManager.getConnection(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT balance_micros FROM billing_accounts WHERE id = ?")) {
            stmt.setString(1, accountId);
            try (ResultSet rs = stmt.executeQuery()) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getLong("balance_micros")).isEqualTo(-1_500_000L);
            }
        }
    }

    @Test
    @DisplayName("processSessionCharge should throw DuplicateEventException on duplicate event")
    void processSessionChargeDuplicate() throws SQLException {
        // Create account first
        String accountId = repository.getOrCreateAccount(TEST_USER_ID, "CNY");

        BillingEvent event = new BillingEvent(
                "0/16B3748", 100L, "public.session", "u", TEST_SESSION_ID, 1234567890L,
                TEST_WORKSPACE_ID, "proj_test_001",
                1.0, 2.5,
                1000L, 500L, 200L, 50L, 10L
        );

        long amountMicros = -1_500_000L;
        // First call succeeds
        repository.processSessionCharge(event, accountId, TEST_USER_ID, amountMicros);

        // Second call with same event should throw DuplicateEventException
        assertThatThrownBy(() ->
                repository.processSessionCharge(event, accountId, TEST_USER_ID, amountMicros))
                .isInstanceOf(BillingRepository.DuplicateEventException.class)
                .hasMessageContaining("Event already processed");

        // Verify only one ledger entry exists (no duplicate charge)
        try (Connection conn = DriverManager.getConnection(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT COUNT(*) AS cnt FROM billing_ledger WHERE session_id = ?")) {
            stmt.setString(1, TEST_SESSION_ID);
            try (ResultSet rs = stmt.executeQuery()) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("cnt")).isEqualTo(1);
            }
        }
    }

    @Test
    @DisplayName("processSessionCharge should rollback transaction if account does not exist")
    void processSessionChargeTransactionRollback() throws SQLException {
        String nonExistentAccountId = "bac_nonexistent";

        BillingEvent event = new BillingEvent(
                "0/ABC1234", 200L, "public.session", "u", TEST_SESSION_ID, 1234567890L,
                TEST_WORKSPACE_ID, "proj_test_001",
                1.0, 3.0,
                2000L, 1000L, 500L, 100L, 50L
        );

        long amountMicros = -2_000_000L;

        // Should throw because account does not exist
        assertThatThrownBy(() ->
                repository.processSessionCharge(event, nonExistentAccountId, TEST_USER_ID, amountMicros))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("Billing account not found");

        // Verify no ledger entry was written (transaction rolled back)
        try (Connection conn = DriverManager.getConnection(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT COUNT(*) AS cnt FROM billing_ledger WHERE session_id = ?")) {
            stmt.setString(1, TEST_SESSION_ID);
            try (ResultSet rs = stmt.executeQuery()) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("cnt")).isEqualTo(0);
            }
        }

        // Verify no processed event was recorded (transaction rolled back)
        try (Connection conn = DriverManager.getConnection(TEST_DB_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT COUNT(*) AS cnt FROM billing_cdc_processed_events WHERE primary_key = ?")) {
            stmt.setString(1, TEST_SESSION_ID);
            try (ResultSet rs = stmt.executeQuery()) {
                assertThat(rs.next()).isTrue();
                assertThat(rs.getInt("cnt")).isEqualTo(0);
            }
        }
    }
}
