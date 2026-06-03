package com.openimago.billingcdc.integration;

import com.openimago.billingcdc.config.AppConfig;
import com.openimago.billingcdc.engine.DebeziumRunner;
import com.openimago.billingcdc.handler.SessionChangeHandler;
import com.openimago.billingcdc.repository.BillingRepository;

import io.debezium.engine.ChangeEvent;
import io.debezium.engine.DebeziumEngine;
import io.debezium.engine.format.Json;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Properties;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Full end-to-end CDC integration test.
 *
 * <p>Starts the Debezium Embedded Engine against a test PostgreSQL,
 * performs a session cost UPDATE, and verifies the billing ledger entry
 * is written by the CDC handler pipeline.</p>
 *
 * <p>Requires PostgreSQL on {@code localhost:15432}, database {@code billing_cdc_test},
 * with pre-seeded data (user_test_001, ws_test_001, ses_test_001)
 * and publication {@code openimago_billing_pub} on table {@code session}.</p>
 */
@DisplayName("CDC Engine Integration Test")
class CdcEngineIntegrationTest {

    private static final Logger log = LoggerFactory.getLogger(CdcEngineIntegrationTest.class);

    private static final String TEST_JDBC_URL = "jdbc:postgresql://localhost:15432/billing_cdc_test";
    private static final String TEST_DB_USER = "postgres";
    private static final String TEST_DB_PASSWORD = "my-secret-pw";

    private static final String TEST_DB_HOST = "localhost";
    private static final int TEST_DB_PORT = 15432;
    private static final String TEST_DB_NAME = "billing_cdc_test";

    private static final String TEST_SLOT_NAME = "openimago_billing_test_slot_integration";
    private static final String TEST_SESSION_ID = "ses_test_001";
    private static final String TEST_USER_ID = "user_test_001";

    private DebeziumRunner runner;
    private BillingRepository repository;

    @BeforeEach
    void setUp() throws Exception {
        // Ensure clean starting state: drop any leftover replication slot,
        // reset the session cost, and clean up billing tables.
        dropSlotIfExists(TEST_SLOT_NAME);
        resetSessionCost();
        cleanupBillingTables();

        // Ensure target/test-data directory exists for schema history file
        new File("target/test-data").mkdirs();

        AppConfig config = new AppConfig(
                TEST_DB_HOST, TEST_DB_PORT, TEST_DB_NAME, TEST_DB_USER, TEST_DB_PASSWORD,
                null, null, null,
                null, null, null,
                "public.session",
                "openimago_billing_pub",
                TEST_SLOT_NAME,
                "openimago_billing_test",
                "never",
                60_000L,
                TEST_JDBC_URL, TEST_DB_USER, TEST_DB_PASSWORD
        );

        repository = new BillingRepository(config);
        SessionChangeHandler handler = new SessionChangeHandler(repository);

        DebeziumEngine<ChangeEvent<String, String>> engine = buildEngine(config, handler::handle);
        runner = new DebeziumRunner(engine);
    }

    @AfterEach
    void tearDown() {
        if (runner != null && runner.isRunning()) {
            runner.stop(30);
        }
        cleanupBillingTables();
        dropSlotIfExists(TEST_SLOT_NAME);
        if (repository != null) {
            repository.close();
        }
    }

    @Test
    @DisplayName("Start Debezium engine, UPDATE session cost, verify billing ledger entry")
    void shouldCaptureSessionCostChangeAndWriteLedgerEntry() throws Exception {
        // 1. Start the engine
        runner.start();
        assertThat(runner.isRunning())
                .as("CDC engine should be running after start()")
                .isTrue();

        // 2. Allow engine time to initialize (replication slot creation, WAL polling)
        //    The engine runs asynchronously; a brief delay ensures the slot is ready.
        Thread.sleep(3_000);

        // 3. UPDATE session cost: 0 → 2.5
        try (Connection conn = DriverManager.getConnection(TEST_JDBC_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "UPDATE session SET cost = 2.5 WHERE id = ?")) {
            stmt.setString(1, TEST_SESSION_ID);
            int rowsUpdated = stmt.executeUpdate();
            assertThat(rowsUpdated).isEqualTo(1);
        }

        // 4. Poll for billing_ledger entry (max 10s timeout)
        boolean found = waitForLedgerEntry(10_000);
        assertThat(found)
                .as("Ledger entry should appear within 10s of session cost UPDATE")
                .isTrue();

        // 5. Verify the billing ledger entry
        try (Connection conn = DriverManager.getConnection(TEST_JDBC_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT amount_micros, balance_after_micros, entry_type, source_type, " +
                     "session_id, account_id, user_id, workspace_id " +
                     "FROM billing_ledger WHERE session_id = ?")) {
            stmt.setString(1, TEST_SESSION_ID);
            ResultSet rs = stmt.executeQuery();

            assertThat(rs.next())
                    .as("Ledger entry should exist for session ses_test_001")
                    .isTrue();

            // delta = 2.5 - 0 = 2.5, charge = -(2.5 * 1_000_000) = -2_500_000
            assertThat(rs.getLong("amount_micros"))
                    .as("Charge amount should be -2_500_000 micros (cost 0 → 2.5)")
                    .isEqualTo(-2_500_000L);

            assertThat(rs.getLong("balance_after_micros"))
                    .isEqualTo(-2_500_000L);

            assertThat(rs.getString("entry_type")).isEqualTo("charge");
            assertThat(rs.getString("source_type")).isEqualTo("session_token");
            assertThat(rs.getString("session_id")).isEqualTo(TEST_SESSION_ID);
            assertThat(rs.getString("workspace_id")).isEqualTo("ws_test_001");
            assertThat(rs.getString("user_id")).isEqualTo(TEST_USER_ID);
            assertThat(rs.getString("account_id")).isNotNull();

            assertThat(rs.next())
                    .as("Only one ledger entry should exist for this update")
                    .isFalse();
        }
    }

    // ── Engine Builder ─────────────────────────────────────────────────────

    /**
     * Builds a {@link DebeziumEngine} with the same properties as {@link com.openimago.billingcdc.engine.CdcEngine}
     * but using {@code MemoryOffsetBackingStore} for offset storage (no file cleanup needed).
     */
    private DebeziumEngine<ChangeEvent<String, String>> buildEngine(
            AppConfig config, Consumer<ChangeEvent<String, String>> consumer) {

        Properties props = new Properties();

        // Engine identity
        props.setProperty("name", "billing-cdc-test-engine");

        // Connector
        props.setProperty("connector.class", "io.debezium.connector.postgresql.PostgresConnector");
        props.setProperty("tasks.max", "1");

        // Memory-based offset store (fresh start each run, no file cleanup)
        props.setProperty("offset.storage",
                "org.apache.kafka.connect.storage.MemoryOffsetBackingStore");

        // File-based schema history stored under target/ (cleaned by mvn clean)
        props.setProperty("schema.history.internal",
                "io.debezium.relational.history.FileDatabaseHistory");
        props.setProperty("schema.history.internal.file.filename",
                "target" + File.separator + "test-data" + File.separator + "cdc-schema-history.dat");

        // Topic / server name
        props.setProperty("topic.prefix", config.topicPrefix());

        // PostgreSQL connection
        props.setProperty("database.hostname", config.dbHost());
        props.setProperty("database.port", String.valueOf(config.dbPort()));
        props.setProperty("database.user", config.dbUser());
        props.setProperty("database.password", config.dbPassword());
        props.setProperty("database.dbname", config.dbName());

        // CDC: pgoutput plugin
        props.setProperty("plugin.name", "pgoutput");
        props.setProperty("publication.name", config.publicationName());
        props.setProperty("slot.name", config.slotName());
        props.setProperty("publication.autocreate.mode", "disabled");

        // Snapshot mode
        props.setProperty("snapshot.mode", config.snapshotMode());

        // Table filtering
        props.setProperty("table.include.list", config.tableIncludeList());

        // Offset flush interval
        props.setProperty("offset.flush.interval.ms",
                String.valueOf(config.offsetFlushIntervalMs()));

        // JSON converter with schemas disabled (clean payloads)
        props.setProperty("key.converter", "org.apache.kafka.connect.json.JsonConverter");
        props.setProperty("value.converter", "org.apache.kafka.connect.json.JsonConverter");
        props.setProperty("key.converter.schemas.enable", "false");
        props.setProperty("value.converter.schemas.enable", "false");

        return DebeziumEngine.create(Json.class)
                .using(props)
                .notifying(consumer)
                .build();
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private void resetSessionCost() {
        try (Connection conn = DriverManager.getConnection(TEST_JDBC_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             PreparedStatement stmt = conn.prepareStatement(
                     "UPDATE session SET cost = 0 WHERE id = ?")) {
            stmt.setString(1, TEST_SESSION_ID);
            stmt.executeUpdate();
        } catch (SQLException e) {
            log.warn("Failed to reset session cost for {}", TEST_SESSION_ID, e);
        }
    }

    private void dropSlotIfExists(String slotName) {
        try (Connection conn = DriverManager.getConnection(TEST_JDBC_URL, TEST_DB_USER, TEST_DB_PASSWORD);
             Statement stmt = conn.createStatement()) {
            stmt.execute("SELECT pg_drop_replication_slot('" + slotName + "')");
        } catch (SQLException e) {
            // Slot does not exist or is still active — either is fine
        }
    }

    private void cleanupBillingTables() {
        try (Connection conn = DriverManager.getConnection(TEST_JDBC_URL, TEST_DB_USER, TEST_DB_PASSWORD)) {
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
                    "UPDATE billing_accounts SET balance_micros = 0, updated_at = NOW() " +
                    "WHERE owner_id = ? AND owner_type = 'user'")) {
                stmt.setString(1, TEST_USER_ID);
                stmt.executeUpdate();
            }
        } catch (SQLException e) {
            // Best-effort cleanup — don't fail tests on cleanup
        }
    }

    /**
     * Polls the {@code billing_ledger} table until a row appears for the test session
     * or the timeout expires.
     *
     * @param timeoutMs maximum time to wait in milliseconds
     * @return true if a ledger entry was found
     */
    private boolean waitForLedgerEntry(long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            try (Connection conn = DriverManager.getConnection(TEST_JDBC_URL, TEST_DB_USER, TEST_DB_PASSWORD);
                 PreparedStatement stmt = conn.prepareStatement(
                         "SELECT COUNT(*) AS cnt FROM billing_ledger WHERE session_id = ?")) {
                stmt.setString(1, TEST_SESSION_ID);
                ResultSet rs = stmt.executeQuery();
                if (rs.next() && rs.getInt("cnt") > 0) {
                    return true;
                }
            } catch (SQLException e) {
                log.debug("Polling ledger unsuccessful, retrying...", e);
            }
            try {
                Thread.sleep(200);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }
}
