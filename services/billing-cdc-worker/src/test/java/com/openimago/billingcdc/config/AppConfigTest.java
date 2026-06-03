package com.openimago.billingcdc.config;

import java.util.Map;
import java.util.HashMap;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link AppConfig#fromEnv()}.
 *
 * <p>Uses the package-private {@code AppConfig.fromEnv(Map)} overload to
 * supply a controlled environment map, avoiding reliance on real OS
 * environment variables or JVM property hacks.</p>
 */
class AppConfigTest {

    private static Map<String, String> requiredEnv() {
        Map<String, String> env = new HashMap<>();
        env.put("CDC_DB_HOST", "localhost");
        env.put("CDC_DB_PORT", "5432");
        env.put("CDC_DB_NAME", "openimago");
        env.put("CDC_DB_USER", "user");
        env.put("CDC_DB_PASSWORD", "pass");
        return env;
    }

    @Test
    @DisplayName("should load config with all required env vars")
    void shouldLoadConfigWithRequiredEnvVars() {
        AppConfig config = AppConfig.fromEnv(requiredEnv());

        assertThat(config.dbHost()).isEqualTo("localhost");
        assertThat(config.dbPort()).isEqualTo(5432);
        assertThat(config.dbName()).isEqualTo("openimago");
        assertThat(config.dbUser()).isEqualTo("user");
        assertThat(config.dbPassword()).isEqualTo("pass");
        assertThat(config.tableIncludeList()).isEqualTo("public.session");
        assertThat(config.publicationName()).isEqualTo("openimago_billing_pub");
        assertThat(config.slotName()).isEqualTo("openimago_billing_slot");
        assertThat(config.topicPrefix()).isEqualTo("openimago_billing");
        assertThat(config.snapshotMode()).isEqualTo("never");
        assertThat(config.offsetFlushIntervalMs()).isEqualTo(60_000L);

        // Storage mode detection
        assertThat(config.usesJdbcOffsetStorage()).isFalse();
        assertThat(config.usesJdbcSchemaHistory()).isFalse();

        // Billing DB defaults to CDC DB when not explicitly set
        assertThat(config.billingDbUrl()).isEqualTo("jdbc:postgresql://localhost:5432/openimago");
        assertThat(config.billingDbUser()).isEqualTo("user");
        assertThat(config.billingDbPassword()).isEqualTo("pass");
    }

    @Test
    @DisplayName("should detect JDBC storage when configured")
    void shouldDetectJdbcStorageWhenConfigured() {
        Map<String, String> env = requiredEnv();
        env.put("CDC_OFFSET_JDBC_URL", "jdbc:postgresql://db:5432/openimago");
        env.put("CDC_OFFSET_JDBC_USER", "offsetuser");
        env.put("CDC_OFFSET_JDBC_PASSWORD", "offsetpass");
        env.put("CDC_SCHEMA_HISTORY_JDBC_URL", "jdbc:postgresql://db:5432/openimago");
        env.put("CDC_SCHEMA_HISTORY_JDBC_USER", "histuser");
        env.put("CDC_SCHEMA_HISTORY_JDBC_PASSWORD", "histpass");

        AppConfig config = AppConfig.fromEnv(env);

        assertThat(config.usesJdbcOffsetStorage()).isTrue();
        assertThat(config.usesJdbcSchemaHistory()).isTrue();
        assertThat(config.offsetJdbcUrl()).isEqualTo("jdbc:postgresql://db:5432/openimago");
        assertThat(config.schemaHistoryJdbcUrl()).isEqualTo("jdbc:postgresql://db:5432/openimago");
    }

    @Test
    @DisplayName("should reject blank JDBC URL as no JDBC storage")
    void shouldRejectBlankJdbcUrlAsNoJdbcStorage() {
        Map<String, String> env = requiredEnv();
        env.put("CDC_OFFSET_JDBC_URL", "   ");
        env.put("CDC_SCHEMA_HISTORY_JDBC_URL", "");

        AppConfig config = AppConfig.fromEnv(env);

        assertThat(config.usesJdbcOffsetStorage()).isFalse();
        assertThat(config.usesJdbcSchemaHistory()).isFalse();
    }

    @Test
    @DisplayName("missing required env var should throw")
    void missingRequiredEnvVarShouldThrow() {
        Map<String, String> env = requiredEnv();
        env.remove("CDC_DB_HOST");

        assertThatThrownBy(() -> AppConfig.fromEnv(env))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("Missing required environment variable");
    }

    @Test
    @DisplayName("should use billing env overrides when set")
    void shouldUseBillingEnvOverridesWhenSet() {
        Map<String, String> env = requiredEnv();
        env.put("BILLING_DB_URL", "jdbc:postgresql://billing-db:5432/billing_cdc_test");
        env.put("BILLING_DB_USER", "billing_user");
        env.put("BILLING_DB_PASSWORD", "billing_pass");

        AppConfig config = AppConfig.fromEnv(env);

        assertThat(config.billingDbUrl()).isEqualTo("jdbc:postgresql://billing-db:5432/billing_cdc_test");
        assertThat(config.billingDbUser()).isEqualTo("billing_user");
        assertThat(config.billingDbPassword()).isEqualTo("billing_pass");
    }
}
