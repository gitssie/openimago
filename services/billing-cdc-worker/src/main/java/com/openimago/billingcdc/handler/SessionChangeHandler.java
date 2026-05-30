package com.openimago.billingcdc.handler;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.openimago.billingcdc.handler.models.BillingEvent;
import com.openimago.billingcdc.repository.BillingRepository;

import io.debezium.engine.ChangeEvent;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Handles CDC change events for the {@code public.session} table.
 *
 * <p>For UPDATE events where {@code after.cost > before.cost}, this handler:
 * <ol>
 *   <li>Parses the schemaless JSON Debezium event payload</li>
 *   <li>Skips non-session, non-update, unchanged/decreased cost, and zero/negative deltas</li>
 *   <li>Converts the cost delta to signed micros (charge = negative)</li>
 *   <li>Resolves the user billing account from the session's workspace</li>
 *   <li>Writes a billing ledger charge and CDC processed event in one JDBC transaction</li>
 * </ol>
 *
 * <p>Errors during processing propagate to the engine (no swallowed exceptions for
 * write failures), preventing Debezium from advancing offsets for unposted events.</p>
 */
public class SessionChangeHandler implements ChangeEventHandler {

    private static final Logger log = LoggerFactory.getLogger(SessionChangeHandler.class);

    private static final ObjectMapper mapper = new ObjectMapper();

    private final BillingRepository repository;

    /**
     * Creates a handler that writes billing events via the given repository.
     *
     * @param repository JDBC repository for billing write operations
     */
    public SessionChangeHandler(BillingRepository repository) {
        this.repository = repository;
    }

    @Override
    public void handle(ChangeEvent<String, String> event) {
        try {
            JsonNode valueNode = mapper.readTree(event.value());
            if (valueNode == null || valueNode.isNull()) {
                log.debug("Event value is null — skipping");
                return;
            }

            // With schemas disabled, the JSON is a flat envelope (no nested "payload")
            BillingEvent billingEvent = parseEvent(valueNode);
            if (billingEvent == null) {
                return; // skipped by parseEvent
            }

            processBillingEvent(billingEvent);

        } catch (BillingRepository.DuplicateEventException e) {
            // Already processed — OK to continue
            log.debug("Duplicate event — skip: {}", e.getMessage());
        } catch (Exception e) {
            log.error("Failed to handle CDC event — NOT advancing offset", e);
            // Re-throw runtime exception so Debezium does NOT advance offset
            throw new RuntimeException("CDC event processing failed", e);
        }
    }

    /**
     * Parses the raw Debezium JSON value node into a {@link BillingEvent}.
     *
     * <p>Returns {@code null} if the event should be skipped (wrong table, wrong op, etc.).</p>
     */
    private BillingEvent parseEvent(JsonNode node) {
        // --- Source metadata ---
        JsonNode source = node.path("source");
        if (source.isMissingNode()) {
            log.debug("Event has no source — skipping");
            return null;
        }

        String schema = source.path("schema").asText("");
        String table = source.path("table").asText("");
        String tableName = schema + "." + table;

        // Skip non-session events
        if (!"public".equals(schema) || !"session".equals(table)) {
            log.debug("Skipping non-session event: {}", tableName);
            return null;
        }

        // --- Operation ---
        String operation = node.path("op").asText("");
        if (operation.isEmpty()) {
            log.debug("Event has no operation — skipping");
            return null;
        }

        // Skip snapshot/read events
        if ("r".equals(operation)) {
            log.debug("Skipping snapshot/read event for session");
            return null;
        }

        // Skip inserts — we only care about cost changes (UPDATE)
        if ("c".equals(operation)) {
            log.debug("Skipping insert event for session");
            return null;
        }

        // Skip deletes
        if ("d".equals(operation)) {
            log.debug("Skipping delete event for session");
            return null;
        }

        // Only proceed with UPDATE
        if (!"u".equals(operation)) {
            log.debug("Skipping unknown operation '{}' for session", operation);
            return null;
        }

        // --- Before/After rows ---
        JsonNode before = node.path("before");
        JsonNode after = node.path("after");

        if (before.isNull() || before.isMissingNode()) {
            log.debug("Skipping UPDATE with no before row");
            return null;
        }
        if (after.isNull() || after.isMissingNode()) {
            log.debug("Skipping UPDATE with no after row");
            return null;
        }

        // --- Cost values ---
        double beforeCost = before.path("cost").asDouble(Double.NaN);
        double afterCost = after.path("cost").asDouble(Double.NaN);

        if (Double.isNaN(beforeCost) || Double.isNaN(afterCost)) {
            log.debug("Skipping UPDATE with missing cost values");
            return null;
        }

        // Skip unchanged or decreased cost (after.cost <= before.cost)
        if (afterCost <= beforeCost) {
            log.debug("Skipping UPDATE with unchanged/decreased cost: before={} after={}",
                    beforeCost, afterCost);
            return null;
        }

        // --- Compute delta ---
        double delta = afterCost - beforeCost;
        long deltaMicros = Math.round(delta * 1_000_000.0);

        // Skip zero or negative deltas
        if (deltaMicros <= 0) {
            log.debug("Skipping UPDATE with zero/negative delta: {} micros", deltaMicros);
            return null;
        }

        // --- Extract identifiers ---
        String primaryKey = after.path("id").asText("");
        if (primaryKey.isEmpty()) {
            log.warn("Skipping UPDATE with no session id in after row");
            return null;
        }

        String sourceLsn = source.path("lsn").asText("");
        long txId = source.path("txId").asLong(0);
        long tsMs = node.path("ts_ms").asLong(0);

        String workspaceId = after.path("workspace_id").asText(null);
        String projectId = after.path("project_id").asText(null);

        // Token values (for pricing snapshot metadata)
        Long tokensInput = after.has("tokens_input") ? after.path("tokens_input").asLong() : null;
        Long tokensOutput = after.has("tokens_output") ? after.path("tokens_output").asLong() : null;
        Long tokensReasoning = after.has("tokens_reasoning") ? after.path("tokens_reasoning").asLong() : null;
        Long tokensCacheRead = after.has("tokens_cache_read") ? after.path("tokens_cache_read").asLong() : null;
        Long tokensCacheWrite = after.has("tokens_cache_write") ? after.path("tokens_cache_write").asLong() : null;

        log.info("Parsed session UPDATE: session={} beforeCost={} afterCost={} deltaMicros={}",
                primaryKey, beforeCost, afterCost, deltaMicros);

        return new BillingEvent(
                sourceLsn, txId, tableName, operation, primaryKey, tsMs,
                workspaceId, projectId,
                beforeCost, afterCost,
                tokensInput, tokensOutput, tokensReasoning,
                tokensCacheRead, tokensCacheWrite
        );
    }

    /**
     * Processes a parsed billing event: resolves account, computes charge, writes to DB.
     */
    private void processBillingEvent(BillingEvent event) throws Exception {
        long deltaMicros = event.deltaMicros();

        // Amount for a charge is NEGATIVE (money leaves the account)
        long amountMicros = -deltaMicros;

        if (amountMicros >= 0) {
            log.debug("Skipping non-negative charge amount: {} micros", amountMicros);
            return;
        }

        // Resolve user ID from workspace
        String userId = repository.resolveUserIdFromWorkspace(event.workspaceId());
        if (userId == null) {
            log.warn("Cannot resolve user for workspace_id={} — skipping charge for session={}",
                    event.workspaceId(), event.primaryKey());
            return;
        }

        // Get or create billing account
        String accountId = repository.getOrCreateAccount(userId, "CNY");

        // Execute the transactional charge
        repository.processSessionCharge(event, accountId, userId, amountMicros);

        log.info("Successfully processed CDC charge: session={} user={} amount={} micros",
                event.primaryKey(), userId, amountMicros);
    }
}
