package com.openimago.billingcdc.config;

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
        long offsetFlushIntervalMs
) {

    private static final String DEFAULT_TABLE_INCLUDE_LIST = "public.session";
    private static final String DEFAULT_PUBLICATION_NAME = "openimago_billing_pub";
    private static final String DEFAULT_SLOT_NAME = "openimago_billing_slot";
    private static final String DEFAULT_TOPIC_PREFIX = "openimago_billing";
    private static final String DEFAULT_SNAPSHOT_MODE = "never";
    private static final long DEFAULT_OFFSET_FLUSH_INTERVAL_MS = 60_000L;

    /**
     * Creates an {@link AppConfig} from environment variables.
     *
     * @throws IllegalStateException if any required variable is missing
     */
    public static AppConfig fromEnv() {
        String dbHost = require("CDC_DB_HOST");
        int dbPort = Integer.parseInt(require("CDC_DB_PORT"));
        String dbName = require("CDC_DB_NAME");
        String dbUser = require("CDC_DB_USER");
        String dbPassword = require("CDC_DB_PASSWORD");

        String offsetJdbcUrl = System.getenv("CDC_OFFSET_JDBC_URL");
        String offsetJdbcUser = System.getenv("CDC_OFFSET_JDBC_USER");
        String offsetJdbcPassword = System.getenv("CDC_OFFSET_JDBC_PASSWORD");

        String schemaHistoryJdbcUrl = System.getenv("CDC_SCHEMA_HISTORY_JDBC_URL");
        String schemaHistoryJdbcUser = System.getenv("CDC_SCHEMA_HISTORY_JDBC_USER");
        String schemaHistoryJdbcPassword = System.getenv("CDC_SCHEMA_HISTORY_JDBC_PASSWORD");

        String tableIncludeList = envOrDefault("CDC_TABLE_INCLUDE_LIST", DEFAULT_TABLE_INCLUDE_LIST);
        String publicationName = envOrDefault("CDC_PUBLICATION_NAME", DEFAULT_PUBLICATION_NAME);
        String slotName = envOrDefault("CDC_SLOT_NAME", DEFAULT_SLOT_NAME);
        String topicPrefix = envOrDefault("CDC_TOPIC_PREFIX", DEFAULT_TOPIC_PREFIX);
        String snapshotMode = envOrDefault("CDC_SNAPSHOT_MODE", DEFAULT_SNAPSHOT_MODE);

        long offsetFlushIntervalMs = Long.parseLong(
                envOrDefault("CDC_OFFSET_FLUSH_INTERVAL_MS", String.valueOf(DEFAULT_OFFSET_FLUSH_INTERVAL_MS))
        );

        return new AppConfig(
                dbHost, dbPort, dbName, dbUser, dbPassword,
                offsetJdbcUrl, offsetJdbcUser, offsetJdbcPassword,
                schemaHistoryJdbcUrl, schemaHistoryJdbcUser, schemaHistoryJdbcPassword,
                tableIncludeList, publicationName, slotName, topicPrefix,
                snapshotMode, offsetFlushIntervalMs
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

    private static String require(String envName) {
        String value = System.getenv(envName);
        Objects.requireNonNull(value,
                "Missing required environment variable: " + envName
                + ". No hardcoded defaults for critical credentials.");
        return value;
    }

    private static String envOrDefault(String envName, String defaultValue) {
        String value = System.getenv(envName);
        return (value != null && !value.isBlank()) ? value : defaultValue;
    }
}
