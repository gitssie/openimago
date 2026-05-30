package com.openimago.billingcdc.handler;

import io.debezium.engine.ChangeEvent;

/**
 * Interface for handling Debezium change events.
 *
 * <p>Implementations process captured CDC events, such as
 * session cost changes. Implementations should be idempotent
 * and must not throw exceptions — the Debezium engine will
 * skip records that cause handler exceptions.</p>
 */
@FunctionalInterface
public interface ChangeEventHandler {

    /**
     * Handles a single Debezium change event.
     *
     * @param event the captured change event (key and value as JSON strings)
     */
    void handle(ChangeEvent<String, String> event);
}
