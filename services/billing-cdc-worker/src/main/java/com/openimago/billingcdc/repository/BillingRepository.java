package com.openimago.billingcdc.repository;

import com.openimago.billingcdc.config.AppConfig;
import com.openimago.billingcdc.handler.models.BillingEvent;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLIntegrityConstraintViolationException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

/**
 * JDBC repository for billing write operations.
 *
 * <p>Manages a HikariCP connection pool and provides transactional methods
 * for writing billing ledger entries and CDC processed event markers.</p>
 */
public class BillingRepository {

    private static final Logger log = LoggerFactory.getLogger(BillingRepository.class);

    private final HikariDataSource dataSource;

    public BillingRepository(AppConfig config) {
        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setJdbcUrl(config.billingDbUrl());
        hikariConfig.setUsername(config.billingDbUser());
        hikariConfig.setPassword(config.billingDbPassword());
        hikariConfig.setMaximumPoolSize(4);
        hikariConfig.setMinimumIdle(1);
        hikariConfig.setConnectionTimeout(10_000);
        hikariConfig.setIdleTimeout(300_000);
        hikariConfig.setMaxLifetime(600_000);
        this.dataSource = new HikariDataSource(hikariConfig);
    }

    /**
     * Resolves a user ID from a workspace ID.
     *
     * <p>Strategy (matches backend resolver pattern):</p>
     * <ol>
     *   <li>Query {@code workspace.user_id} from workspace table</li>
     *   <li>Fall back: query {@code users.workspace_id} to find the user</li>
     * </ol>
     *
     * @param workspaceId the workspace identifier from the session
     * @return resolved user ID, or null if not found
     */
    public String resolveUserIdFromWorkspace(String workspaceId) {
        if (workspaceId == null || workspaceId.isBlank()) {
            return null;
        }

        // 1. Try workspace.user_id
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT user_id FROM workspace WHERE id = ?")) {
            stmt.setString(1, workspaceId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    String userId = rs.getString("user_id");
                    if (userId != null && !userId.isBlank()) {
                        log.debug("Resolved user_id={} from workspace.id={}", userId, workspaceId);
                        return userId;
                    }
                }
            }
        } catch (SQLException e) {
            log.warn("Failed to query workspace.user_id for workspaceId={}", workspaceId, e);
        }

        // 2. Fall back: users.workspace_id
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(
                     "SELECT id FROM users WHERE workspace_id = ? LIMIT 1")) {
            stmt.setString(1, workspaceId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    String userId = rs.getString("id");
                    log.debug("Resolved user_id={} from users.workspace_id={}", userId, workspaceId);
                    return userId;
                }
            }
        } catch (SQLException e) {
            log.warn("Failed to query users.workspace_id for workspaceId={}", workspaceId, e);
        }

        log.warn("Could not resolve user for workspace_id={}", workspaceId);
        return null;
    }

    /**
     * Gets or creates a billing account for a user.
     *
     * @param userId   the user ID
     * @param currency the currency (defaults to "CNY")
     * @return the account ID
     */
    public String getOrCreateAccount(String userId, String currency) throws SQLException {
        String effectiveCurrency = (currency != null && !currency.isBlank()) ? currency : "CNY";

        try (Connection conn = dataSource.getConnection()) {
            // Try to find existing account
            String existing = findAccount(conn, userId);
            if (existing != null) {
                return existing;
            }

            // Create new account
            return createAccount(conn, userId, effectiveCurrency);
        }
    }

    private String findAccount(Connection conn, String userId) throws SQLException {
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT id FROM billing_accounts WHERE owner_type = 'user' AND owner_id = ? LIMIT 1")) {
            stmt.setString(1, userId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    return rs.getString("id");
                }
            }
        }
        return null;
    }

    private String createAccount(Connection conn, String userId, String currency) throws SQLException {
        String accountId = "bac_" + UUID.randomUUID().toString().replace("-", "").substring(0, 25);
        try (PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO billing_accounts (id, owner_type, owner_id, currency, balance_micros, " +
                "minimum_balance_micros, credit_limit_micros, status, created_at, updated_at) " +
                "VALUES (?, 'user', ?, ?, 0, 0, 0, 'active', NOW(), NOW()) " +
                "ON CONFLICT (owner_type, owner_id) DO NOTHING")) {
            stmt.setString(1, accountId);
            stmt.setString(2, userId);
            stmt.setString(3, currency);
            int rows = stmt.executeUpdate();
            if (rows > 0) {
                log.info("Created billing account id={} for userId={}", accountId, userId);
                return accountId;
            }
        }

        // ON CONFLICT DO NOTHING means someone else created it concurrently — re-read
        return findAccount(conn, userId);
    }

    /**
     * Processes a session cost charge in a single database transaction:
     * <ol>
     *   <li>Insert a {@code billing_cdc_processed_events} row. If unique conflict, skip the entire charge.</li>
     *   <li>Lock the billing account row with {@code FOR UPDATE}.</li>
     *   <li>Update the account balance.</li>
     *   <li>Insert a {@code billing_ledger} entry with {@code entry_type='charge', source_type='session_token'}.</li>
     * </ol>
     *
     * <p>The charge amount is negative (debit). This method does NOT swallow write failures —
     * errors propagate to the caller so Debezium does not advance offsets for unposted events.</p>
     *
     * @param event       the parsed CDC event
     * @param accountId   the billing account ID
     * @param userId      the resolved user ID
     * @param amountMicros negative charge amount in micros
     */
    public void processSessionCharge(BillingEvent event, String accountId, String userId, long amountMicros)
            throws SQLException {
        try (Connection conn = dataSource.getConnection()) {
            conn.setAutoCommit(false);
            try {
                // 1. Insert processed event (unique constraint prevents duplicate processing)
                insertProcessedEvent(conn, event);

                // 2. Lock and update account balance
                long balanceAfter = lockAndUpdateBalance(conn, accountId, amountMicros);

                // 3. Insert ledger entry
                insertLedgerEntry(conn, event, accountId, userId, amountMicros, balanceAfter);

                conn.commit();
                log.info("Billing charge posted: session={} amount={} micros balanceAfter={} micros",
                        event.primaryKey(), amountMicros, balanceAfter);
            } catch (SQLException e) {
                conn.rollback();
                throw e;
            }
        }
    }

    /**
     * Inserts a processed event marker. If the event was already processed
     * (unique constraint violation), throws a special exception to indicate skip.
     */
    private void insertProcessedEvent(Connection conn, BillingEvent event) throws SQLException {
        // The txid column is defined as text in the schema
        String txidAsText = String.valueOf(event.txId());
        String id = "bce_" + UUID.randomUUID().toString().replace("-", "").substring(0, 25);

        try (PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO billing_cdc_processed_events " +
                "(id, source_lsn, txid, table_name, operation, primary_key, processed_at, metadata) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)")) {
            stmt.setString(1, id);
            stmt.setString(2, event.sourceLsn());
            stmt.setString(3, txidAsText);
            stmt.setString(4, event.tableName());
            stmt.setString(5, event.operation());
            stmt.setString(6, event.primaryKey());
            stmt.setTimestamp(7, Timestamp.from(Instant.now()));
            stmt.setString(8, "{}");
            stmt.executeUpdate();
        } catch (SQLIntegrityConstraintViolationException e) {
            // PostgreSQL error code 23505 = unique_violation
            log.info("CDC event already processed — skipping: uniquenessKey={}", event.uniquenessKey());
            throw new DuplicateEventException("Event already processed: " + event.uniquenessKey(), e);
        } catch (SQLException e) {
            // PostgreSQL wraps unique violations differently depending on JDBC driver
            // Check the SQL state for 23505
            if ("23505".equals(e.getSQLState())) {
                log.info("CDC event already processed — skipping: uniquenessKey={}", event.uniquenessKey());
                throw new DuplicateEventException("Event already processed: " + event.uniquenessKey(), e);
            }
            throw e;
        }
    }

    /**
     * Locks the account row and updates the balance.
     */
    private long lockAndUpdateBalance(Connection conn, String accountId, long amountMicros) throws SQLException {
        // Read current balance with row lock
        long currentBalance;
        try (PreparedStatement stmt = conn.prepareStatement(
                "SELECT balance_micros FROM billing_accounts WHERE id = ? FOR UPDATE")) {
            stmt.setString(1, accountId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (!rs.next()) {
                    throw new SQLException("Billing account not found: " + accountId);
                }
                currentBalance = rs.getLong("balance_micros");
            }
        }

        long newBalance = currentBalance + amountMicros;

        // Update the balance
        try (PreparedStatement stmt = conn.prepareStatement(
                "UPDATE billing_accounts SET balance_micros = ?, updated_at = NOW() WHERE id = ?")) {
            stmt.setLong(1, newBalance);
            stmt.setString(2, accountId);
            stmt.executeUpdate();
        }

        return newBalance;
    }

    /**
     * Inserts a billing ledger entry.
     */
    private void insertLedgerEntry(Connection conn, BillingEvent event, String accountId,
                                    String userId, long amountMicros, long balanceAfterMicros)
            throws SQLException {
        String id = "bdl_" + UUID.randomUUID().toString().replace("-", "").substring(0, 25);
        // Build pricing_snapshot JSONB with event metadata
        String pricingSnapshot = buildPricingSnapshot(event);
        // Build metadata JSONB with CDC source metadata
        String metadata = buildMetadata(event);

        try (PreparedStatement stmt = conn.prepareStatement(
                "INSERT INTO billing_ledger " +
                "(id, account_id, user_id, workspace_id, project_id, session_id, " +
                "entry_type, source_type, source_id, source_status, " +
                "amount_micros, balance_after_micros, currency, " +
                "pricing_snapshot, metadata, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, 'charge', 'session_token', ?, 'completed', ?, ?, 'CNY', ?::jsonb, ?::jsonb, NOW())")) {
            stmt.setString(1, id);
            stmt.setString(2, accountId);
            stmt.setString(3, userId);
            stmt.setString(4, event.workspaceId());
            stmt.setString(5, event.projectId());
            stmt.setString(6, event.primaryKey()); // session_id
            stmt.setString(7, event.uniquenessKey()); // source_id
            stmt.setLong(8, amountMicros);
            stmt.setLong(9, balanceAfterMicros);
            stmt.setString(10, pricingSnapshot);
            stmt.setString(11, metadata);
            stmt.executeUpdate();
        }
    }

    private String buildPricingSnapshot(BillingEvent event) {
        return String.format(
                "{\"before_cost\": %s, \"after_cost\": %s, " +
                "\"tokens_input\": %d, \"tokens_output\": %d, " +
                "\"tokens_reasoning\": %d, \"tokens_cache_read\": %d, \"tokens_cache_write\": %d}",
                safeJsonNumber(event.beforeCost()),
                safeJsonNumber(event.afterCost()),
                event.tokensInput(),
                event.tokensOutput(),
                event.tokensReasoning(),
                event.tokensCacheRead(),
                event.tokensCacheWrite()
        );
    }

    private String buildMetadata(BillingEvent event) {
        return String.format(
                "{\"source_lsn\": %s, \"txid\": %d, \"table_name\": %s, " +
                "\"operation\": %s, \"ts_ms\": %d}",
                escapeJson(event.sourceLsn()),
                event.txId(),
                escapeJson(event.tableName()),
                escapeJson(event.operation()),
                event.tsMs()
        );
    }

    private String safeJsonNumber(Double value) {
        if (value == null) return "null";
        if (Double.isNaN(value) || Double.isInfinite(value)) return "null";
        return String.valueOf(value);
    }

    private String safeJsonNumber(Long value) {
        if (value == null) return "null";
        return String.valueOf(value);
    }

    private String escapeJson(String s) {
        if (s == null) return "null";
        // Basic JSON string escaping
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    /**
     * Closes the connection pool.
     */
    public void close() {
        if (dataSource != null && !dataSource.isClosed()) {
            dataSource.close();
            log.info("BillingRepository connection pool closed");
        }
    }

    /**
     * Exception indicating the event was already processed (duplicate).
     * Callers should catch this and continue (not treat as failure).
     */
    public static class DuplicateEventException extends SQLException {
        public DuplicateEventException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
