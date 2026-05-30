package com.openimago.billingcdc.handler.models;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * A parsed Debezium change event for billing processing.
 *
 * @param sourceLsn  PostgreSQL Log Sequence Number from the event source
 * @param txId       PostgreSQL transaction ID
 * @param tableName  fully-qualified table name (e.g., {@code public.session})
 * @param operation  operation type: {@code r} (read/snapshot), {@code c} (create/insert),
 *                   {@code u} (update), {@code d} (delete)
 * @param primaryKey primary key value of the changed row
 * @param before     the row state before the change (null for inserts)
 * @param after      the row state after the change (null for deletes)
 */
public record BillingEvent(
        String sourceLsn,
        long txId,
        String tableName,
        String operation,
        String primaryKey,
        JsonNode before,
        JsonNode after
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
}
