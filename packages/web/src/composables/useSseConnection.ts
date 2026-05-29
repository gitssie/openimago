/**
 * Singleton SSE connection manager.
 *
 * Only ONE SSE connection exists at a time for the entire app.
 * Multiple callers can register event handlers; the connection
 * is shared among them.
 *
 * State machine:
 *   disconnected → connecting → connected
 *                      ↑           ↓ (error / stream end → retry)
 *                      └───────────┘
 *   connected → server-closed  (server sent server.close; do NOT auto-reconnect)
 *   server-closed → connecting  (connect() was called explicitly, e.g. on sendMessage)
 */

import { ref } from 'vue';
import type { Event } from '@opencode-ai/sdk/v2';
import { AgentService } from 'src/services/agents';

export type SseState = 'disconnected' | 'connecting' | 'connected' | 'server-closed';

// ── Module-level singleton state ────────────────────────────────────────────

const RECENT_EVENT_ID_LIMIT = 500;

/** Reactive connection state, readable by any component. */
export const sseState = ref<SseState>('disconnected');

/** Registered event handlers (all share the same SSE stream). */
const handlers = new Set<(event: Event) => void>();

/** Whether the async loop is currently running. */
let running = false;

/** Abort controller for stopping the current loop. */
let abortCtrl: AbortController | null = null;

/** Sliding window of recently seen event IDs (deduplication). */
const recentEventIds: string[] = [];
const recentEventIdSet = new Set<string>();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the event ID has already been seen (duplicate). */
function rememberEventId(id: string | undefined): boolean {
  if (!id) return false;
  if (recentEventIdSet.has(id)) return true;
  recentEventIdSet.add(id);
  recentEventIds.push(id);
  while (recentEventIds.length > RECENT_EVENT_ID_LIMIT) {
    const stale = recentEventIds.shift();
    if (stale) recentEventIdSet.delete(stale);
  }
  return false;
}

/**
 * Normalize raw SSE payloads into typed Event objects.
 * Handles sync envelope unwrapping, versioned event types (e.g. session.updated.1),
 * and the data→properties rename.
 */
function normalizeEvent(raw: Event): Event | null {
  const rawRec = raw as Record<string, unknown>;
  const syncEvt = rawRec.syncEvent as Record<string, unknown> | undefined;
  const source: Record<string, unknown> = syncEvt ?? rawRec;
  const id = typeof source.id === 'string' ? source.id : undefined;
  if (rememberEventId(id)) return null;

  const rawType = source.type;
  const type = (typeof rawType === 'string' ? rawType : '').replace(/\.\d+$/, '');
  if (!type) return null;

  const properties = 'properties' in source ? source.properties : source.data;
  return { ...source, id, type, properties } as Event;
}

/** Dispatch a normalized event to all registered handlers. */
function dispatch(event: Event) {
  for (const h of handlers) {
    try { h(event); } catch { /* individual handler errors must not break others */ }
  }
}

// ── Core loop ────────────────────────────────────────────────────────────────

async function _runLoop(ctrl: AbortController): Promise<'aborted' | 'server-closed'> {
  let retryDelay = 1000;

  while (!ctrl.signal.aborted) {
    sseState.value = 'connecting';
    try {
      const stream = await AgentService.subscribeToEvents();
      retryDelay = 1000; // reset on successful connect

      sseState.value = 'connected';
      for await (const raw of stream) {
        if (ctrl.signal.aborted) return 'aborted';
        const event = normalizeEvent(raw);
        if (!event) continue;

        dispatch(event);

        if ((event as { type: string }).type === 'server.close') {
          // Server is intentionally closing this connection (e.g. LRU eviction).
          // Stop auto-reconnecting — the caller must explicitly call connect().
          return 'server-closed';
        }
      }
    } catch {
      if (ctrl.signal.aborted) return 'aborted';
      // Connection error — retry after back-off
    }

    if (ctrl.signal.aborted) return 'aborted';

    // Wait before reconnecting (exponential back-off, max 30s)
    sseState.value = 'connecting';
    await new Promise<void>((resolve) => {
      const tid = setTimeout(resolve, retryDelay);
      ctrl.signal.addEventListener('abort', () => { clearTimeout(tid); resolve(); }, { once: true });
    });
    retryDelay = Math.min(retryDelay * 2, 30_000);
  }

  return 'aborted';
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the SSE connection. No-op if already running.
 * Safe to call multiple times (idempotent).
 */
function connect(): void {
  if (running) return;
  running = true;
  abortCtrl = new AbortController();
  const ctrl = abortCtrl;

  void _runLoop(ctrl).then((reason) => {
    running = false;
    abortCtrl = null;
    sseState.value = reason === 'server-closed' ? 'server-closed' : 'disconnected';
  });
}

/**
 * Stop the SSE connection gracefully.
 * The state will become 'disconnected'.
 */
function disconnect(): void {
  abortCtrl?.abort();
  // sseState will be set to 'disconnected' by the loop's .then()
}

/**
 * Register an event handler. Returns a cleanup function to remove it.
 * Typically called once per composable/component.
 */
function onEvent(handler: (event: Event) => void): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/**
 * Ensure the SSE connection is running.
 * Call this before sending a message if the connection may have been
 * closed by the server (server-closed state).
 */
function ensureConnected(): void {
  if (!running) connect();
}

// ── Composable export ────────────────────────────────────────────────────────

export function useSseConnection() {
  return { state: sseState, connect, disconnect, onEvent, ensureConnected };
}
