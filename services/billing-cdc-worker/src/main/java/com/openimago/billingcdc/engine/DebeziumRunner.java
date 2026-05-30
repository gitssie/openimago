package com.openimago.billingcdc.engine;

import io.debezium.engine.ChangeEvent;
import io.debezium.engine.DebeziumEngine;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Manages the lifecycle of a {@link DebeziumEngine}.
 *
 * <p>Runs the engine on a dedicated single-thread executor and provides
 * graceful shutdown via {@link #stop()}.</p>
 */
public class DebeziumRunner {

    private static final Logger log = LoggerFactory.getLogger(DebeziumRunner.class);

    private final DebeziumEngine<ChangeEvent<String, String>> engine;
    private final ExecutorService executor;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final CountDownLatch stopLatch = new CountDownLatch(1);

    /**
     * Creates a runner for the given engine.
     *
     * @param engine a configured {@link DebeziumEngine}
     */
    public DebeziumRunner(DebeziumEngine<ChangeEvent<String, String>> engine) {
        this.engine = engine;
        this.executor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "debezium-cdc");
            t.setDaemon(false);
            return t;
        });
    }

    /**
     * Starts the engine asynchronously.
     *
     * <p>This method returns immediately. The engine runs on a background thread.</p>
     */
    public void start() {
        if (!running.compareAndSet(false, true)) {
            log.warn("Engine is already running");
            return;
        }
        log.info("Starting Debezium CDC engine...");
        executor.execute(engine);
        log.info("Debezium CDC engine started successfully");
    }

    /**
     * Stops the engine gracefully.
     *
     * <p>Blocks until the engine has flushed offsets and shut down, up to
     * the specified timeout.</p>
     *
     * @param timeoutSeconds maximum seconds to wait for shutdown
     * @return true if the engine stopped within the timeout
     */
    public boolean stop(int timeoutSeconds) {
        if (!running.compareAndSet(true, false)) {
            log.warn("Engine is not running");
            return true;
        }
        log.info("Stopping Debezium CDC engine...");
        try {
            executor.shutdown();
            boolean terminated = executor.awaitTermination(timeoutSeconds, TimeUnit.SECONDS);
            if (terminated) {
                log.info("Debezium CDC engine stopped gracefully");
            } else {
                log.warn("Debezium CDC engine did not stop within {} seconds — forcing shutdown", timeoutSeconds);
                executor.shutdownNow();
            }
            stopLatch.countDown();
            return terminated;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Interrupted while waiting for engine shutdown");
            executor.shutdownNow();
            return false;
        }
    }

    /**
     * Returns true if the engine is currently running.
     */
    public boolean isRunning() {
        return running.get();
    }

    /**
     * Returns a latch that counts down when the engine stops.
     * Useful for blocking the main thread until shutdown.
     */
    public CountDownLatch stopLatch() {
        return stopLatch;
    }
}
