# OpenImago Billing CDC Worker

Standalone Java Debezium CDC worker that captures PostgreSQL row-level changes to the `public.session` table and processes billing events.

## Technology Selection

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Language** | Java 21 | Debezium 3.4.x requires JDK 21 for development and embedded engine |
| **Build** | Maven (with wrapper) | Debezium docs and Java ecosystem examples are Maven-first |
| **CDC Engine** | Debezium Embedded Engine 3.4.3.Final (`AsyncEmbeddedEngine`) | No Kafka required; runs as a standalone service |
| **Connector** | PostgreSQL connector with pgoutput | pgoutput is PostgreSQL-native (10+), no extra plugins needed |
| **Offset Storage** | JDBC (production) / File (dev) | JDBC ensures restarts are not tied to local filesystem; file available for local dev |
| **Schema History** | JDBC (production) / File (dev) | Same rationale as offset storage |
| **JSON Parsing** | Jackson | Industry standard JSON library |
| **Logging** | SLF4J + Logback | Standard Java logging stack |
| **Testing** | JUnit 5 + AssertJ | Modern testing framework with fluent assertions |

## Prerequisites

- **JDK 21** (e.g., Temurin 21)
- **PostgreSQL 14+** with logical replication enabled
- **Maven** (or use the included Maven wrapper `./mvnw`)

## PostgreSQL Setup

The worker requires specific PostgreSQL configuration for logical replication.

### 1. Enable Logical Replication

In `postgresql.conf`:
```ini
wal_level = logical
max_replication_slots = 5       # at least 1
max_wal_senders = 5             # at least 1
```

### 2. Create Publication

```sql
CREATE PUBLICATION openimago_billing_pub FOR TABLE public.session;
```

### 3. Set Replica Identity

REPLICA IDENTITY FULL is required so that Debezium receives the full before/after row state for UPDATE operations:

```sql
ALTER TABLE public.session REPLICA IDENTITY FULL;
```

### 4. Grant Replication Privileges

The database user configured in the CDC worker must have:
- `CONNECT` on the database
- `SELECT` on `public.session`
- `USAGE` on schema `public`
- `REPLICATION` attribute (or `pg_read_all_data` + replication slot creation privilege)

```sql
ALTER ROLE openimago WITH REPLICATION;
GRANT CONNECT ON DATABASE openimago TO openimago;
GRANT USAGE ON SCHEMA public TO openimago;
GRANT SELECT ON public.session TO openimago;
```

## Environment Variables

All critical credentials must be provided via environment variables. No hardcoded defaults.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `CDC_DB_HOST` | PostgreSQL host | `localhost` |
| `CDC_DB_PORT` | PostgreSQL port | `5432` |
| `CDC_DB_NAME` | Database name | `openimago` |
| `CDC_DB_USER` | Database user | `openimago` |
| `CDC_DB_PASSWORD` | Database password | `secret` |

### Optional — JDBC Offset Storage (production)

If NOT set, file-based storage is used (OK for development).

| Variable | Description | Example |
|----------|-------------|---------|
| `CDC_OFFSET_JDBC_URL` | JDBC URL for offset table | `jdbc:postgresql://localhost:5432/openimago` |
| `CDC_OFFSET_JDBC_USER` | JDBC user for offset table | `openimago` |
| `CDC_OFFSET_JDBC_PASSWORD` | JDBC password for offset table | `secret` |

### Optional — JDBC Schema History (production)

If NOT set, file-based storage is used (OK for development).

| Variable | Description | Example |
|----------|-------------|---------|
| `CDC_SCHEMA_HISTORY_JDBC_URL` | JDBC URL for schema history | `jdbc:postgresql://localhost:5432/openimago` |
| `CDC_SCHEMA_HISTORY_JDBC_USER` | JDBC user for schema history | `openimago` |
| `CDC_SCHEMA_HISTORY_JDBC_PASSWORD` | JDBC password for schema history | `secret` |

### Optional — Tuning

| Variable | Default | Description |
|----------|---------|-------------|
| `CDC_TABLE_INCLUDE_LIST` | `public.session` | Comma-separated tables to capture |
| `CDC_PUBLICATION_NAME` | `openimago_billing_pub` | PostgreSQL publication name |
| `CDC_SLOT_NAME` | `openimago_billing_slot` | PostgreSQL replication slot name |
| `CDC_TOPIC_PREFIX` | `openimago_billing` | Debezium topic prefix |
| `CDC_SNAPSHOT_MODE` | `never` | Debezium snapshot mode (`never`, `initial`, etc.) |
| `CDC_OFFSET_FLUSH_INTERVAL_MS` | `60000` | Offset flush interval in ms |

## Build & Run

### Build

```bash
cd services/billing-cdc-worker

# Using Maven directly
mvn clean package

# Or using the Maven wrapper (if generated)
./mvnw clean package
```

The shaded JAR is written to `target/billing-cdc-worker-0.1.0-SNAPSHOT.jar`.

### Run

```bash
# Export required env vars
export CDC_DB_HOST=localhost
export CDC_DB_PORT=5432
export CDC_DB_NAME=openimago
export CDC_DB_USER=openimago
export CDC_DB_PASSWORD=your_password_here

# Optional: JDBC offset/schema history (recommended for production)
export CDC_OFFSET_JDBC_URL=jdbc:postgresql://localhost:5432/openimago
export CDC_OFFSET_JDBC_USER=openimago
export CDC_OFFSET_JDBC_PASSWORD=your_password_here

java -jar target/billing-cdc-worker-0.1.0-SNAPSHOT.jar
```

### Run Tests

```bash
mvn test
```

## Architecture

```
com.openimago.billingcdc/
├── Main.java                  # Entry point, shutdown hook, lifecycle
├── config/
│   └── AppConfig.java         # Env-based config loader (no hardcoded secrets)
├── engine/
│   ├── CdcEngine.java         # Builds DebeziumEngine with PG connector
│   └── DebeziumRunner.java    # Async lifecycle management
└── handler/
    ├── ChangeEventHandler.java # Functional interface for event processing
    ├── SessionChangeHandler.java # Handles public.session CDC events (PLACEHOLDER)
    └── models/
        └── BillingEvent.java   # Parsed CDC event data model
```

### Data Flow

```
PostgreSQL WAL → pgoutput logical decoding → Debezium PG Connector
    → AsyncEmbeddedEngine → JSON ChangeEvent → SessionChangeHandler
    → (FUTURE) billing_ledger + billing_cdc_processed_events
```

## Intentionally Not Implemented

The following items are **not yet implemented** and will be filled in from user-provided reference code:

1. **Billing ledger writing logic** — comparing `before.cost` vs `after.cost` and inserting ledger entries
2. **CDC processed events deduplication** — writing to `billing_cdc_processed_events` with uniqueness key (`source_lsn + txid + table_name + operation + primary_key`)
3. **Database transaction handling** — atomic write of ledger + processed-events rows
4. **Database connection management** — HikariCP or similar connection pool for the billing database
5. **Error retry and DLQ** — handling transient DB failures
6. **Metrics and health checks** — Prometheus metrics, readiness/liveness probes
7. **Multi-table support** — currently only `public.session` is captured
8. **Initial snapshot handling** — `snapshot.mode` is set to `never` by default

## CDC Processing Contract

When the full implementation is added, the processing rule is:

> If `after.cost > before.cost` for a `public.session` UPDATE event, write:
> 1. One **negative** `billing_ledger` charge row
> 2. One `billing_cdc_processed_events` row
>
> Both in a single database transaction. Processed event uniqueness uses:
> `source_lsn :: txid :: table_name :: operation :: primary_key`

## Cleanup

If the worker is stopped and the replication slot is no longer needed:

```sql
SELECT pg_drop_replication_slot('openimago_billing_slot');
```

Leaving an unused replication slot active will cause PostgreSQL WAL accumulation and disk growth.
