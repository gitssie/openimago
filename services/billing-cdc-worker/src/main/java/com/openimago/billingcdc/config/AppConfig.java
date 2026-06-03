package com.openimago.billingcdc.config;

import java.util.Map;
import java.util.Objects;

/**
 * Application configuration loaded from environment variables.
 *
 * <p>All critical database credentials must be provided via environment variables.
 * No hardcoded defaults are used for secrets.</p>
 *
 * <p>Two storage modes are supported:</p>
 * <ul>
 *   <li><strong>JDBC storage</strong> (production) — offsets and schema history stored
 *       in a PostgreSQL database. Enabled when {@code CDC_OFFSET_JDBC_URL} is set.</li>
 *   <li><strong>File storage</strong> (development) — offsets and schema history stored
 *       as local files. Used when JDBC storage is not configured.</li>
 * </ul>
 *
 * @param dbHost          PostgreSQL host
 * @param dbPort          PostgreSQL port
 * @param dbName          PostgreSQL database name
 * @param dbUser          PostgreSQL user
 * @param dbPassword      PostgreSQL password
 * @param offsetJdbcUrl   JDBC URL for offset storage (null → use file storage)
 * @param offsetJdbcUser  JDBC user for offset storage
 * @param offsetJdbcPassword JDBC password for offset storage
 * @param schemaHistoryJdbcUrl   JDBC URL for schema history storage (null → use file storage)
 * @param schemaHistoryJdbcUser  JDBC user for schema history storage
 * @param schemaHistoryJdbcPassword JDBC password for schema history storage
 * @param tableIncludeList   Comma-separated list of tables to capture (default: {@code public.session})
 * @param publicationName    PostgreSQL publication name (default: {@code openimago_billing_pub})
 * @param slotName           PostgreSQL replication slot name (default: {@code openimago_billing_slot})
 * @param topicPrefix        Debezium topic/servername prefix (default: {@code openimago_billing})
 * @param snapshotMode       Debezium snapshot mode (default: {@code never})
 * @param offsetFlushIntervalMs Offset flush interval in ms (default: {@code 60000})
 * @param billingDbUrl         JDBC URL for billing write operations (defaults to same as CDC DB if not set)
 * @param billingDbUser        JDBC user for billing write operations
 * @param billingDbPassword    JDBC password for billing write operations
 */
public record AppConfig(
        String dbHost,
        int dbPort,
        String dbName,
        String dbUser,
        String dbPassword,
        String offsetJdbcUrl,
        String offsetJdbcUser,
        String offsetJdbcPassword,
        String schemaHistoryJdbcUrl,
        String schemaHistoryJdbcUser,
        String schemaHistoryJdbcPassword,
        String tableIncludeList,
        String publicationName,
        String slotName,
        String topicPrefix,
        String snapshotMode,
        long offsetFlushIntervalMs,
        String billingDbUrl,
        String billingDbUser,
        String billingDbPassword
) {

    private static final String DEFAULT_TABLE_INCLUDE_LIST = "public.session";
    private static final String DEFAULT_PUBLICATION_NAME = "openimago_billing_pub";
    private static final String DEFAULT_SLOT_NAME = "openimago_billing_slot";
    private static final String DEFAULT_TOPIC_PREFIX = "openimago_billing";
    private static final String DEFAULT_SNAPSHOT_MODE = "never";
    private static final long DEFAULT_OFFSET_FLUSH_INTERVAL_MS = 60_000L;

    /**
     * Creates an {@link AppConfig} from system environment variables.
     *
     * @throws NullPointerException if any required variable is missing
     */
    public static AppConfig fromEnv() {
        return fromEnv(System.getenv());
    }

    /**
     * Creates an {@link AppConfig} from a supplied environment map.
     * Package-private for testability; production code should use {@link #fromEnv()}.
     *
     * @param env a map of environment variable names to values
     * @throws NullPointerException if any required variable is missing
     */
    static AppConfig fromEnv(Map<String, String> env) {
        String dbHost = requireEnv(env, "CDC_DB_HOST");
        int dbPort = Integer.parseInt(requireEnv(env, "CDC_DB_PORT"));
        String dbName = requireEnv(env, "CDC_DB_NAME");
        String dbUser = requireEnv(env, "CDC_DB_USER");
        String dbPassword = requireEnv(env, "CDC_DB_PASSWORD");

        String offsetJdbcUrl = env.get("CDC_OFFSET_JDBC_URL");
        String offsetJdbcUser = env.get("CDC_OFFSET_JDBC_USER");
        String offsetJdbcPassword = env.get("CDC_OFFSET_JDBC_PASSWORD");

        String schemaHistoryJdbcUrl = env.get("CDC_SCHEMA_HISTORY_JDBC_URL");
        String schemaHistoryJdbcUser = env.get("CDC_SCHEMA_HISTORY_JDBC_USER");
        String schemaHistoryJdbcPassword = env.get("CDC_SCHEMA_HISTORY_JDBC_PASSWORD");

        String tableIncludeList = envOrDefault(env, "CDC_TABLE_INCLUDE_LIST", DEFAULT_TABLE_INCLUDE_LIST);
        String publicationName = envOrDefault(env, "CDC_PUBLICATION_NAME", DEFAULT_PUBLICATION_NAME);
        String slotName = envOrDefault(env, "CDC_SLOT_NAME", DEFAULT_SLOT_NAME);
        String topicPrefix = envOrDefault(env, "CDC_TOPIC_PREFIX", DEFAULT_TOPIC_PREFIX);
        String snapshotMode = envOrDefault(env, "CDC_SNAPSHOT_MODE", DEFAULT_SNAPSHOT_MODE);

        long offsetFlushIntervalMs = Long.parseLong(
                envOrDefault(env, "CDC_OFFSET_FLUSH_INTERVAL_MS", String.valueOf(DEFAULT_OFFSET_FLUSH_INTERVAL_MS))
        );

        // Billing write connection — defaults to same as CDC DB if not explicitly set
        String billingDbUrl = envOrDefault(env, "BILLING_DB_URL",
                "jdbc:postgresql://" + dbHost + ":" + dbPort + "/" + dbName);
        String billingDbUser = envOrDefault(env, "BILLING_DB_USER", dbUser);
        String billingDbPassword = envOrDefault(env, "BILLING_DB_PASSWORD", dbPassword);

        return new AppConfig(
                dbHost, dbPort, dbName, dbUser, dbPassword,
                offsetJdbcUrl, offsetJdbcUser, offsetJdbcPassword,
                schemaHistoryJdbcUrl, schemaHistoryJdbcUser, schemaHistoryJdbcPassword,
                tableIncludeList, publicationName, slotName, topicPrefix,
                snapshotMode, offsetFlushIntervalMs,
                billingDbUrl, billingDbUser, billingDbPassword
        );
    }

    /**
     * Returns true if JDBC offset storage is configured.
     */
    public boolean usesJdbcOffsetStorage() {
        return offsetJdbcUrl != null && !offsetJdbcUrl.isBlank();
    }

    /**
     * Returns true if JDBC schema history storage is configured.
     */
    public boolean usesJdbcSchemaHistory() {
        return schemaHistoryJdbcUrl != null && !schemaHistoryJdbcUrl.isBlank();
    }

    private static String requireEnv(Map<String, String> env, String envName) {
        String value = env.get(envName);
        Objects.requireNonNull(value,
                "Missing required environment variable: " + envName
                + ". No hardcoded defaults for critical credentials.");
        return value;
    }

    private static String envOrDefault(Map<String, String> env, String envName, String defaultValue) {
        String value = env.get(envName);
        return (value != null && !value.isBlank()) ? value : defaultValue;
    }
}
