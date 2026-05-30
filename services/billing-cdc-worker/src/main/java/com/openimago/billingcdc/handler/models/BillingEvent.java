package com.openimago.billingcdc.handler.models;

/**
 * A parsed Debezium change event for billing processing.
 *
 * @param sourceLsn      PostgreSQL Log Sequence Number from the event source
 * @param txId           PostgreSQL transaction ID
 * @param tableName      fully-qualified table name (e.g., {@code public.session})
 * @param operation      operation type: {@code r} (read/snapshot), {@code c} (create/insert),
 *                       {@code u} (update), {@code d} (delete)
 * @param primaryKey     primary key value of the changed row (= session ID)
 * @param tsMs           event timestamp in milliseconds
 * @param workspaceId    workspace ID from the after row
 * @param projectId      project ID from the after row
 * @param beforeCost     session cost before the change (from before row)
 * @param afterCost      session cost after the change (from after row)
 * @param tokensInput    tokens input from the after row
 * @param tokensOutput   tokens output from the after row
 * @param tokensReasoning tokens reasoning from the after row
 * @param tokensCacheRead  tokens cache read from the after row
 * @param tokensCacheWrite tokens cache write from the after row
 */
public record BillingEvent(
        String sourceLsn,
        long txId,
        String tableName,
        String operation,
        String primaryKey,
        long tsMs,
        String workspaceId,
        String projectId,
        Double beforeCost,
        Double afterCost,
        Long tokensInput,
        Long tokensOutput,
        Long tokensReasoning,
        Long tokensCacheRead,
        Long tokensCacheWrite
) {

    /**
     * Creates a uniqueness key from source metadata and operation details.
     *
     * <pre>{@code
     * source_lsn :: txid :: table_name :: operation :: primary_key
     * }</pre>
     */
    public String uniquenessKey() {
        return String.join("::",
                sourceLsn,
                String.valueOf(txId),
                tableName,
                operation,
                primaryKey
        );
    }

    /**
     * Returns true if this event is an INSERT.
     */
    public boolean isInsert() {
        return "c".equals(operation);
    }

    /**
     * Returns true if this event is an UPDATE.
     */
    public boolean isUpdate() {
        return "u".equals(operation);
    }

    /**
     * Returns true if this event is a DELETE.
     */
    public boolean isDelete() {
        return "d".equals(operation);
    }

    /**
     * Returns true if this is a snapshot/read event (should be skipped).
     */
    public boolean isSnapshot() {
        return "r".equals(operation);
    }

    /**
     * Computes the cost delta in micros (after - before, rounded).
     *
     * @return delta in micros, or 0 if costs are null/missing
     */
    public long deltaMicros() {
        if (beforeCost == null || afterCost == null) return 0;
        double delta = afterCost - beforeCost;
        // Deterministic rounding: multiply by 1_000_000 and round to nearest long
        return Math.round(delta * 1_000_000.0);
    }
}
