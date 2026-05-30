package com.openimago.billingcdc;

import com.openimago.billingcdc.config.AppConfig;
import com.openimago.billingcdc.engine.CdcEngine;
import com.openimago.billingcdc.engine.DebeziumRunner;
import com.openimago.billingcdc.handler.SessionChangeHandler;
import com.openimago.billingcdc.repository.BillingRepository;

import io.debezium.engine.ChangeEvent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.function.Consumer;

/**
 * Main entry point for the Billing CDC Worker.
 *
 * <p>Loads configuration from environment variables, sets up the Debezium
 * PostgreSQL CDC engine, and runs it until shutdown.</p>
 *
 * <h3>Usage</h3>
 * <pre>{@code
 *   export CDC_DB_HOST=localhost
 *   export CDC_DB_PORT=5432
 *   export CDC_DB_NAME=openimago
 *   export CDC_DB_USER=openimago
 *   export CDC_DB_PASSWORD=secret
 *
 *   # Optional: JDBC offset/schema history (production)
 *   export CDC_OFFSET_JDBC_URL=jdbc:postgresql://localhost:5432/openimago
 *   export CDC_OFFSET_JDBC_USER=openimago
 *   export CDC_OFFSET_JDBC_PASSWORD=secret
 *
 *   java -jar billing-cdc-worker.jar
 * }</pre>
 */
public final class Main {

    private static final Logger log = LoggerFactory.getLogger(Main.class);

    private Main() {
        // utility class
    }

    /**
     * Application entry point.
     *
     * @param args command-line arguments (not used)
     */
    public static void main(String[] args) {
        log.info("=== OpenImago Billing CDC Worker ===");
        log.info("Starting up...");

        // --- Load configuration ---
        AppConfig config;
        try {
            config = AppConfig.fromEnv();
        } catch (Exception e) {
            log.error("Failed to load configuration: {}", e.getMessage());
            System.exit(1);
            return;
        }
        log.info("Configuration loaded successfully");
        log.info("  DB: {}:{}/{}", config.dbHost(), config.dbPort(), config.dbName());
        log.info("  Table filter: {}", config.tableIncludeList());
        log.info("  Publication: {}", config.publicationName());
        log.info("  Slot: {}", config.slotName());
        log.info("  Offset storage: {}", config.usesJdbcOffsetStorage() ? "JDBC" : "file");
        log.info("  Schema history: {}", config.usesJdbcSchemaHistory() ? "JDBC" : "file");
        log.info("  Billing DB: {}", config.billingDbUrl());

        // --- Create billing repository ---
        BillingRepository billingRepo = new BillingRepository(config);

        // --- Create event handler ---
        Consumer<ChangeEvent<String, String>> eventConsumer = new SessionChangeHandler(billingRepo)::handle;

        // --- Build engine ---
        CdcEngine cdcEngine = new CdcEngine(config, eventConsumer);

        // --- Run ---
        DebeziumRunner runner = new DebeziumRunner(cdcEngine.engine());

        // Register shutdown hook for graceful stop
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("Shutdown signal received");
            runner.stop(30);
            billingRepo.close();
        }, "shutdown-hook"));

        runner.start();

        // Block main thread until engine stops
        try {
            runner.stopLatch().await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Main thread interrupted");
        }

        log.info("OpenImago Billing CDC Worker stopped");
    }
}
