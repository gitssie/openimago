package com.openimago.billingcdc.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openimago.billingcdc.handler.models.BillingEvent;

import io.debezium.engine.ChangeEvent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles CDC change events for the {@code public.session} table.
 *
 * <p>For UPDATE events where {@code after.cost > before.cost}, this handler will
 * eventually write a billing ledger charge and a processed-events row in one
 * transaction.</p>
 *
 * <p><strong>INTENTIONALLY NOT IMPLEMENTED:</strong> The actual billing ledger
 * writing logic and database transaction handling will be filled in later from
 * user-provided reference code.</p>
 */
public class SessionChangeHandler implements ChangeEventHandler {

    private static final Logger log = LoggerFactory.getLogger(SessionChangeHandler.class);

    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void handle(ChangeEvent<String, String> event) {
        try {
            JsonNode valueNode = mapper.readTree(event.value());
            if (valueNode == null) {
                log.debug("Event value is null — skipping");
                return;
            }

            JsonNode payload = valueNode.path("payload");
            if (payload.isMissingNode()) {
                log.debug("Event has no payload — skipping");
                return;
            }

            JsonNode source = payload.path("source");
            String table = source.path("table").asText();
            String schema = source.path("schema").asText();
            String tableName = schema + "." + table;

            String operation = payload.path("op").asText();

            // Extract source metadata for uniqueness
            String sourceLsn = source.path("lsn").asText("");
            long txId = source.path("txId").asLong(0);

            // Extract before/after row data
            JsonNode before = payload.path("before");
            JsonNode after = payload.path("after");

            // Extract primary key
            String primaryKey = extractPrimaryKey(operation, before, after);

            BillingEvent billingEvent = new BillingEvent(
                    sourceLsn, txId, tableName, operation, primaryKey, before, after
            );

            log.info("Received CDC event: table={} op={} pk={}",
                    tableName, operation, primaryKey);

            // TODO: Implement actual billing logic
            // Reference contract from architecture:
            // - For UPDATE on public.session where after.cost > before.cost:
            //   write one negative billing_ledger charge and one
            //   billing_cdc_processed_events row in one transaction.
            // - Processed event uniqueness: source_lsn + txid + table_name +
            //   operation + primary_key

            if (billingEvent.isUpdate()) {
                log.debug("Session UPDATE: before.cost={} after.cost={}",
                        before != null ? before.path("cost").asDouble() : "N/A",
                        after != null ? after.path("cost").asDouble() : "N/A");
                // FUTURE: compare before.cost vs after.cost and emit ledger entries
            }

        } catch (Exception e) {
            log.error("Failed to handle CDC event", e);
            // Do NOT rethrow — Debezium engine skips records that cause handler exceptions
        }
    }

    private String extractPrimaryKey(String operation, JsonNode before, JsonNode after) {
        // For UPDATE/DELETE, the primary key may be in before or after
        // For INSERT, the primary key is in after
        if ("d".equals(operation) && before != null) {
            return before.path("id").asText("");
        }
        if (after != null) {
            return after.path("id").asText("");
        }
        return "";
    }
}
