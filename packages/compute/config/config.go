package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

const (
	defaultTableIncludeList  = "public.session"
	defaultPublicationName   = "openimago_billing_pub"
	defaultSlotName          = "openimago_billing_slot"
	defaultTopicPrefix       = "openimago_billing"
	defaultSnapshotMode      = "never"
	defaultOffsetFlushIntervalMs = 60000
)

// AppConfig holds all application configuration loaded from environment variables.
//
// All critical database credentials must be provided via environment variables.
// No hardcoded defaults are used for secrets.
type AppConfig struct {
	DBHost     string
	DBPort     int
	DBName     string
	DBUser     string
	DBPassword string

	OffsetJdbcURL      string
	OffsetJdbcUser     string
	OffsetJdbcPassword string

	SchemaHistoryJdbcURL      string
	SchemaHistoryJdbcUser     string
	SchemaHistoryJdbcPassword string

	TableIncludeList     string
	PublicationName      string
	SlotName             string
	TopicPrefix          string
	SnapshotMode         string
	OffsetFlushIntervalMs int64

	BillingDBURL      string
	BillingDBUser     string
	BillingDBPassword string
}

// UsesJDBCOffsetStorage returns true if JDBC offset storage is configured.
func (c AppConfig) UsesJDBCOffsetStorage() bool {
	return strings.TrimSpace(c.OffsetJdbcURL) != ""
}

// UsesJDBCSchemaHistory returns true if JDBC schema history storage is configured.
func (c AppConfig) UsesJDBCSchemaHistory() bool {
	return strings.TrimSpace(c.SchemaHistoryJdbcURL) != ""
}

// FromEnv creates an AppConfig from OS environment variables.
func FromEnv() (*AppConfig, error) {
	return fromEnvMap(envToMap())
}

// fromEnvMap creates an AppConfig from a supplied environment map.
// Internal for testability.
func fromEnvMap(env map[string]string) (*AppConfig, error) {
	dbHost, err := requireEnv(env, "CDC_DB_HOST")
	if err != nil {
		return nil, err
	}

	dbPortStr, err := requireEnv(env, "CDC_DB_PORT")
	if err != nil {
		return nil, err
	}
	dbPort, err := strconv.Atoi(dbPortStr)
	if err != nil {
		return nil, fmt.Errorf("invalid CDC_DB_PORT: %w", err)
	}

	dbName, err := requireEnv(env, "CDC_DB_NAME")
	if err != nil {
		return nil, err
	}
	dbUser, err := requireEnv(env, "CDC_DB_USER")
	if err != nil {
		return nil, err
	}
	dbPassword, err := requireEnv(env, "CDC_DB_PASSWORD")
	if err != nil {
		return nil, err
	}

	offsetJdbcURL := env["CDC_OFFSET_JDBC_URL"]
	offsetJdbcUser := env["CDC_OFFSET_JDBC_USER"]
	offsetJdbcPassword := env["CDC_OFFSET_JDBC_PASSWORD"]

	schemaHistoryJdbcURL := env["CDC_SCHEMA_HISTORY_JDBC_URL"]
	schemaHistoryJdbcUser := env["CDC_SCHEMA_HISTORY_JDBC_USER"]
	schemaHistoryJdbcPassword := env["CDC_SCHEMA_HISTORY_JDBC_PASSWORD"]

	tableIncludeList := envOrDefault(env, "CDC_TABLE_INCLUDE_LIST", defaultTableIncludeList)
	publicationName := envOrDefault(env, "CDC_PUBLICATION_NAME", defaultPublicationName)
	slotName := envOrDefault(env, "CDC_SLOT_NAME", defaultSlotName)
	topicPrefix := envOrDefault(env, "CDC_TOPIC_PREFIX", defaultTopicPrefix)
	snapshotMode := envOrDefault(env, "CDC_SNAPSHOT_MODE", defaultSnapshotMode)

	offsetFlushIntervalStr := envOrDefault(env, "CDC_OFFSET_FLUSH_INTERVAL_MS", strconv.Itoa(defaultOffsetFlushIntervalMs))
	offsetFlushIntervalMs, err := strconv.ParseInt(offsetFlushIntervalStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid CDC_OFFSET_FLUSH_INTERVAL_MS: %w", err)
	}

	// Billing write connection — defaults to same as CDC DB if not explicitly set
	billingDBURL := envOrDefault(
		env, "BILLING_DB_URL",
		fmt.Sprintf("postgresql://%s:%s@%s:%d/%s", dbUser, dbPassword, dbHost, dbPort, dbName),
	)
	billingDBUser := envOrDefault(env, "BILLING_DB_USER", dbUser)
	billingDBPassword := envOrDefault(env, "BILLING_DB_PASSWORD", dbPassword)

	return &AppConfig{
		DBHost:                   dbHost,
		DBPort:                   dbPort,
		DBName:                   dbName,
		DBUser:                   dbUser,
		DBPassword:               dbPassword,
		OffsetJdbcURL:            offsetJdbcURL,
		OffsetJdbcUser:           offsetJdbcUser,
		OffsetJdbcPassword:       offsetJdbcPassword,
		SchemaHistoryJdbcURL:     schemaHistoryJdbcURL,
		SchemaHistoryJdbcUser:    schemaHistoryJdbcUser,
		SchemaHistoryJdbcPassword: schemaHistoryJdbcPassword,
		TableIncludeList:          tableIncludeList,
		PublicationName:           publicationName,
		SlotName:                  slotName,
		TopicPrefix:               topicPrefix,
		SnapshotMode:              snapshotMode,
		OffsetFlushIntervalMs:     offsetFlushIntervalMs,
		BillingDBURL:              billingDBURL,
		BillingDBUser:             billingDBUser,
		BillingDBPassword:         billingDBPassword,
	}, nil
}

func requireEnv(env map[string]string, name string) (string, error) {
	val, ok := env[name]
	if !ok || val == "" {
		return "", fmt.Errorf("missing required environment variable: %s. No hardcoded defaults for critical credentials", name)
	}
	return val, nil
}

func envOrDefault(env map[string]string, name, defaultVal string) string {
	val, ok := env[name]
	if ok && strings.TrimSpace(val) != "" {
		return val
	}
	return defaultVal
}

func envToMap() map[string]string {
	m := make(map[string]string)
	for _, e := range os.Environ() {
		for i := 0; i < len(e); i++ {
			if e[i] == '=' {
				m[e[:i]] = e[i+1:]
				break
			}
		}
	}
	return m
}
