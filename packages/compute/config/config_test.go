package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func requiredEnv() map[string]string {
	return map[string]string{
		"CDC_DB_HOST":     "localhost",
		"CDC_DB_PORT":     "5432",
		"CDC_DB_NAME":     "openimago",
		"CDC_DB_USER":     "user",
		"CDC_DB_PASSWORD": "pass",
	}
}

func TestLoadConfigWithRequiredEnvVars(t *testing.T) {
	cfg, err := fromEnvMap(requiredEnv())
	assert.NoError(t, err)

	assert.Equal(t, "localhost", cfg.DBHost)
	assert.Equal(t, 5432, cfg.DBPort)
	assert.Equal(t, "openimago", cfg.DBName)
	assert.Equal(t, "user", cfg.DBUser)
	assert.Equal(t, "pass", cfg.DBPassword)
	assert.Equal(t, "public.session", cfg.TableIncludeList)
	assert.Equal(t, "openimago_billing_pub", cfg.PublicationName)
	assert.Equal(t, "openimago_billing_slot", cfg.SlotName)
	assert.Equal(t, "openimago_billing", cfg.TopicPrefix)
	assert.Equal(t, "never", cfg.SnapshotMode)
	assert.Equal(t, int64(60000), cfg.OffsetFlushIntervalMs)
	assert.Equal(t, int64(60000), cfg.ExpiryTickIntervalMs)

	// Storage mode detection
	assert.False(t, cfg.UsesJDBCOffsetStorage())
	assert.False(t, cfg.UsesJDBCSchemaHistory())

	// Billing DB defaults to CDC DB when not explicitly set
	assert.Equal(t, "postgresql://user:pass@localhost:5432/openimago", cfg.BillingDBURL)
	assert.Equal(t, "user", cfg.BillingDBUser)
	assert.Equal(t, "pass", cfg.BillingDBPassword)
}

func TestExpiryTickIntervalOverrideAndValidation(t *testing.T) {
	env := requiredEnv()
	env["CDC_EXPIRY_TICK_INTERVAL_MS"] = "30000"
	cfg, err := fromEnvMap(env)
	assert.NoError(t, err)
	assert.Equal(t, int64(30000), cfg.ExpiryTickIntervalMs)

	env["CDC_EXPIRY_TICK_INTERVAL_MS"] = "0"
	_, err = fromEnvMap(env)
	assert.Error(t, err, "non-positive expiry tick interval must be rejected")
}

func TestDetectJdbcStorageWhenConfigured(t *testing.T) {
	env := requiredEnv()
	env["CDC_OFFSET_JDBC_URL"] = "jdbc:postgresql://db:5432/openimago"
	env["CDC_OFFSET_JDBC_USER"] = "offsetuser"
	env["CDC_OFFSET_JDBC_PASSWORD"] = "offsetpass"
	env["CDC_SCHEMA_HISTORY_JDBC_URL"] = "jdbc:postgresql://db:5432/openimago"
	env["CDC_SCHEMA_HISTORY_JDBC_USER"] = "histuser"
	env["CDC_SCHEMA_HISTORY_JDBC_PASSWORD"] = "histpass"

	cfg, err := fromEnvMap(env)
	assert.NoError(t, err)

	assert.True(t, cfg.UsesJDBCOffsetStorage())
	assert.True(t, cfg.UsesJDBCSchemaHistory())
	assert.Equal(t, "jdbc:postgresql://db:5432/openimago", cfg.OffsetJdbcURL)
	assert.Equal(t, "jdbc:postgresql://db:5432/openimago", cfg.SchemaHistoryJdbcURL)
}

func TestRejectBlankJdbcUrl(t *testing.T) {
	env := requiredEnv()
	env["CDC_OFFSET_JDBC_URL"] = "   "
	env["CDC_SCHEMA_HISTORY_JDBC_URL"] = ""

	cfg, err := fromEnvMap(env)
	assert.NoError(t, err)

	// Note: in Go, empty/whitespace strings are treated as "not configured" by fromEnvMap
	// The Kotlin code uses isNullOrBlank() which is not directly available in Go
	// Our requireEnv checks for empty string but fromEnvMap accepts empty optional values
	assert.False(t, cfg.UsesJDBCOffsetStorage())
	assert.False(t, cfg.UsesJDBCSchemaHistory())
}

func TestMissingRequiredEnvVar(t *testing.T) {
	env := requiredEnv()
	delete(env, "CDC_DB_HOST")

	_, err := fromEnvMap(env)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "missing required environment variable")
}

func TestBillingEnvOverrides(t *testing.T) {
	env := requiredEnv()
	env["BILLING_DB_URL"] = "postgresql://billing_user:billing_pass@billing-db:5432/billing_cdc_test"
	env["BILLING_DB_USER"] = "billing_user"
	env["BILLING_DB_PASSWORD"] = "billing_pass"

	cfg, err := fromEnvMap(env)
	assert.NoError(t, err)

	assert.Equal(t, "postgresql://billing_user:billing_pass@billing-db:5432/billing_cdc_test", cfg.BillingDBURL)
	assert.Equal(t, "billing_user", cfg.BillingDBUser)
	assert.Equal(t, "billing_pass", cfg.BillingDBPassword)
}
