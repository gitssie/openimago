package com.openimago.billingcdc.engine;

import com.openimago.billingcdc.config.AppConfig;

import io.debezium.engine.ChangeEvent;
import io.debezium.engine.DebeziumEngine;
import io.debezium.engine.format.Json;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.Properties;
import java.util.function.Consumer;

/**
 * Builds a {@link DebeziumEngine} configured for PostgreSQL CDC with
 * the pgoutput plugin.
 *
 * <p>The engine captures row-level changes from {@code public.session}
 * and delivers them as JSON change events.</p>
 */
public class CdcEngine {

    private static final Logger log = LoggerFactory.getLogger(CdcEngine.class);

    private static final String POSTGRES_CONNECTOR_CLASS =
            "io.debezium.connector.postgresql.PostgresConnector";

    private static final String JDBC_OFFSET_BACKING_STORE =
            "io.debezium.storage.jdbc.offset.JdbcOffsetBackingStore";

    private static final String FILE_OFFSET_BACKING_STORE =
            "org.apache.kafka.connect.storage.FileOffsetBackingStore";

    private static final String JDBC_SCHEMA_HISTORY =
            "io.debezium.storage.jdbc.history.JdbcSchemaHistory";

    private static final String FILE_SCHEMA_HISTORY =
            "io.debezium.relational.history.FileDatabaseHistory";

    /**
     * Default directory for file-based offset/schema history storage.
     */
    private static final String DEFAULT_STORAGE_DIR = "data/cdc";

    private final AppConfig config;
    private final DebeziumEngine<ChangeEvent<String, String>> engine;

    /**
     * Creates a CDC engine with the given configuration and event consumer.
     *
     * @param config        application configuration
     * @param eventConsumer handler that processes each captured change event
     */
    public CdcEngine(AppConfig config, Consumer<ChangeEvent<String, String>> eventConsumer) {
        this.config = config;
        this.engine = buildEngine(eventConsumer);
    }

    /**
     * Returns the underlying {@link DebeziumEngine} instance.
     */
    public DebeziumEngine<ChangeEvent<String, String>> engine() {
        return engine;
    }

    private DebeziumEngine<ChangeEvent<String, String>> buildEngine(
            Consumer<ChangeEvent<String, String>> eventConsumer
    ) {
        Properties props = buildProperties();

        log.info("Building Debezium engine with properties (secrets masked):");
        props.forEach((k, v) -> {
            if (k.toString().contains("password")) {
                log.info("  {} = ***", k);
            } else {
                log.info("  {} = {}", k, v);
            }
        });

        return DebeziumEngine.create(Json.class)
                .using(props)
                .notifying(eventConsumer)
                .build();
    }

    private Properties buildProperties() {
        Properties props = new Properties();

        // --- Engine identity ---
        props.setProperty("name", "billing-cdc-engine");

        // --- Connector ---
        props.setProperty("connector.class", POSTGRES_CONNECTOR_CLASS);
        props.setProperty("tasks.max", "1");

        // --- Offset storage ---
        configureOffsetStorage(props);

        // --- Schema history ---
        configureSchemaHistory(props);

        // --- Topic / server name ---
        props.setProperty("topic.prefix", config.topicPrefix());

        // --- PostgreSQL connection ---
        props.setProperty("database.hostname", config.dbHost());
        props.setProperty("database.port", String.valueOf(config.dbPort()));
        props.setProperty("database.user", config.dbUser());
        props.setProperty("database.password", config.dbPassword());
        props.setProperty("database.dbname", config.dbName());

        // --- CDC: pgoutput plugin ---
        props.setProperty("plugin.name", "pgoutput");
        props.setProperty("publication.name", config.publicationName());
        props.setProperty("slot.name", config.slotName());
        // Do not auto-create publication/slot — require explicit DDL setup
        props.setProperty("publication.autocreate.mode", "disabled");

        // --- Snapshot ---
        props.setProperty("snapshot.mode", config.snapshotMode());

        // --- Table filtering ---
        props.setProperty("table.include.list", config.tableIncludeList());

        // --- Offset flush ---
        props.setProperty("offset.flush.interval.ms",
                String.valueOf(config.offsetFlushIntervalMs()));

        return props;
    }

    private void configureOffsetStorage(Properties props) {
        if (config.usesJdbcOffsetStorage()) {
            log.info("Using JDBC offset storage");
            props.setProperty("offset.storage", JDBC_OFFSET_BACKING_STORE);
            props.setProperty("offset.storage.jdbc.connection.url", config.offsetJdbcUrl());
            if (config.offsetJdbcUser() != null && !config.offsetJdbcUser().isBlank()) {
                props.setProperty("offset.storage.jdbc.connection.user", config.offsetJdbcUser());
            }
            if (config.offsetJdbcPassword() != null && !config.offsetJdbcPassword().isBlank()) {
                props.setProperty("offset.storage.jdbc.connection.password", config.offsetJdbcPassword());
            }
            props.setProperty("offset.storage.jdbc.table.name", "billing_cdc_offsets");
        } else {
            log.warn("JDBC offset storage not configured — falling back to file storage (OK for development)");
            ensureStorageDir();
            props.setProperty("offset.storage", FILE_OFFSET_BACKING_STORE);
            props.setProperty("offset.storage.file.filename",
                    DEFAULT_STORAGE_DIR + File.separator + "offsets.dat");
        }
    }

    private void configureSchemaHistory(Properties props) {
        if (config.usesJdbcSchemaHistory()) {
            log.info("Using JDBC schema history storage");
            props.setProperty("schema.history.internal", JDBC_SCHEMA_HISTORY);
            props.setProperty("schema.history.internal.jdbc.connection.url",
                    config.schemaHistoryJdbcUrl());
            if (config.schemaHistoryJdbcUser() != null && !config.schemaHistoryJdbcUser().isBlank()) {
                props.setProperty("schema.history.internal.jdbc.connection.user",
                        config.schemaHistoryJdbcUser());
            }
            if (config.schemaHistoryJdbcPassword() != null && !config.schemaHistoryJdbcPassword().isBlank()) {
                props.setProperty("schema.history.internal.jdbc.connection.password",
                        config.schemaHistoryJdbcPassword());
            }
        } else {
            log.warn("JDBC schema history not configured — falling back to file storage (OK for development)");
            ensureStorageDir();
            props.setProperty("schema.history.internal", FILE_SCHEMA_HISTORY);
            props.setProperty("schema.history.internal.file.filename",
                    DEFAULT_STORAGE_DIR + File.separator + "schema-history.dat");
        }
    }

    private void ensureStorageDir() {
        File dir = new File(DEFAULT_STORAGE_DIR);
        if (!dir.exists()) {
            boolean created = dir.mkdirs();
            if (created) {
                log.info("Created storage directory: {}", dir.getAbsolutePath());
            }
        }
    }
}
