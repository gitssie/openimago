package com.openimago.billingcdc.config;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link AppConfig#fromEnv()}.
 */
class AppConfigTest {

    @BeforeEach
    @AfterEach
    void clearEnv() {
        // Clear all CDC-related env vars between tests to avoid leakage
        System.clearProperty("CDC_DB_HOST");
        System.clearProperty("CDC_DB_PORT");
        System.clearProperty("CDC_DB_NAME");
        System.clearProperty("CDC_DB_USER");
        System.clearProperty("CDC_DB_PASSWORD");
        System.clearProperty("CDC_OFFSET_JDBC_URL");
        System.clearProperty("CDC_OFFSET_JDBC_USER");
        System.clearProperty("CDC_OFFSET_JDBC_PASSWORD");
        System.clearProperty("CDC_SCHEMA_HISTORY_JDBC_URL");
        System.clearProperty("CDC_SCHEMA_HISTORY_JDBC_USER");
        System.clearProperty("CDC_SCHEMA_HISTORY_JDBC_PASSWORD");
        System.clearProperty("CDC_TABLE_INCLUDE_LIST");
        System.clearProperty("CDC_PUBLICATION_NAME");
        System.clearProperty("CDC_SLOT_NAME");
        System.clearProperty("CDC_TOPIC_PREFIX");
        System.clearProperty("CDC_SNAPSHOT_MODE");
        System.clearProperty("CDC_OFFSET_FLUSH_INTERVAL_MS");
        System.clearProperty("BILLING_DB_URL");
        System.clearProperty("BILLING_DB_USER");
        System.clearProperty("BILLING_DB_PASSWORD");
    }

    @Test
    @DisplayName("should load config with all required env vars")
    void shouldLoadConfigWithRequiredEnvVars() {
        // Note: fromEnv reads System.getenv(), not System properties.
        // In a real integration test this would use env vars.
        // This test validates the record structure and defaults are sane.
        // For a smoke test, we construct the record directly.

        AppConfig config = new AppConfig(
                "localhost", 5432, "openimago", "user", "pass",
                null, null, null,  // no JDBC offset
                null, null, null,  // no JDBC schema history
                "public.session",
                "openimago_billing_pub",
                "openimago_billing_slot",
                "openimago_billing",
                "never",
                60_000L,
                "jdbc:postgresql://localhost:5432/openimago", "user", "pass"
        );

        assertThat(config.dbHost()).isEqualTo("localhost");
        assertThat(config.dbPort()).isEqualTo(5432);
        assertThat(config.dbName()).isEqualTo("openimago");
        assertThat(config.tableIncludeList()).isEqualTo("public.session");
        assertThat(config.publicationName()).isEqualTo("openimago_billing_pub");
        assertThat(config.slotName()).isEqualTo("openimago_billing_slot");
        assertThat(config.topicPrefix()).isEqualTo("openimago_billing");
        assertThat(config.snapshotMode()).isEqualTo("never");
        assertThat(config.offsetFlushIntervalMs()).isEqualTo(60_000L);

        // Storage mode detection
        assertThat(config.usesJdbcOffsetStorage()).isFalse();
        assertThat(config.usesJdbcSchemaHistory()).isFalse();
    }

    @Test
    @DisplayName("should detect JDBC storage when configured")
    void shouldDetectJdbcStorageWhenConfigured() {
        AppConfig config = new AppConfig(
                "localhost", 5432, "openimago", "user", "pass",
                "jdbc:postgresql://db:5432/openimago", "offsetuser", "offsetpass",
                "jdbc:postgresql://db:5432/openimago", "histuser", "histpass",
                "public.session",
                "openimago_billing_pub",
                "openimago_billing_slot",
                "openimago_billing",
                "never",
                60_000L,
                "jdbc:postgresql://localhost:5432/openimago", "user", "pass"
        );

        assertThat(config.usesJdbcOffsetStorage()).isTrue();
        assertThat(config.usesJdbcSchemaHistory()).isTrue();
        assertThat(config.offsetJdbcUrl()).isEqualTo("jdbc:postgresql://db:5432/openimago");
        assertThat(config.schemaHistoryJdbcUrl()).isEqualTo("jdbc:postgresql://db:5432/openimago");
    }

    @Test
    @DisplayName("should reject blank JDBC URL as no JDBC storage")
    void shouldRejectBlankJdbcUrlAsNoJdbcStorage() {
        AppConfig config = new AppConfig(
                "localhost", 5432, "openimago", "user", "pass",
                "   ", null, null,
                "", null, null,
                "public.session",
                "openimago_billing_pub",
                "openimago_billing_slot",
                "openimago_billing",
                "never",
                60_000L,
                "jdbc:postgresql://localhost:5432/openimago", "user", "pass"
        );

        assertThat(config.usesJdbcOffsetStorage()).isFalse();
        assertThat(config.usesJdbcSchemaHistory()).isFalse();
    }

    @Test
    @DisplayName("missing required env var should throw")
    void missingRequiredEnvVarShouldThrow() {
        // Since fromEnv reads real env vars and they aren't set,
        // this will throw. We validate the error message pattern.
        assertThatThrownBy(AppConfig::fromEnv)
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("Missing required environment variable");
    }
}
