# ADR 0010: Media Pre-charge Expiry Safety Net (not full reservation)

**Status:** Accepted
**Date:** 2026-07-01
**Scope note:** narrows openimago-3xp — we build the safety net, not the full reservation state machine.

## Context

Media generation already bills inline (openimago-xqr): opencode's media service
pre-charges the ledger before calling the provider and refunds on provider
failure (`billingService.prechargeToolCall` / `refundToolCallPrecharge`, posted
from `packages/opencode/src/lib/media/billing.ts`). LLM-token cost is billed
separately by the golang CDC Worker off `session.cost` — a different path.

The one real hole: if the process crashes **between pre-charge and refund**, the
debit is stranded — there is no TTL and no auto-release, so the user is
over-charged permanently. openimago-3xp proposed a full reservation redesign
(hold→execute→settle/release/expire, idempotency keys everywhere, async video
reserve→submit→poll→settle). That is large; the forcing function for most of it
is **async video**, which we are not tackling now.

A pre-charge that succeeded and one that is stuck currently look identical in the
DB (both = a debit with no refund). So an expiry sweeper cannot tell them apart
without a success signal.

## Decision

Build only the **expiry safety net**, keeping the immediate-debit pre-charge model:

1. **Confirm marker.** Add a minimal confirm step. Pre-charge stamps
   `expiresAt = now + TTL` (TTL is **config, no hidden default**). On provider
   success the media service calls a new **confirm** (marks the entry CONFIRMED,
   clears `expiresAt`); on failure it refunds as today.
2. **Expiry release in the CDC Worker.** The golang `billing-cdc-worker`
   (`packages/compute`) — already the single-instance billing background service —
   gains a per-minute ticker that finds pre-charges past `expiresAt` still
   unconfirmed and unrefunded, and auto-refunds them in an idempotent SQL
   transaction (same style as its charge handler). Single-runner by construction,
   no distributed lock needed.

## Considered Options

1. Full 3xp reservation state machine (hold/settle/release/expire + idempotency +
   async video). Correct long-term, but large; deferred.
2. **(Chosen) Minimal confirm marker + expiry release in the CDC Worker.**
3. Infer success from a side signal (a run / workspace-file was written). No
   billing change, but cross-module and fragile — rejected.
4. Run the expiry tick as an in-process TS timer in openimago. Simpler code reuse,
   but multi-instance deployments would double-fire without a lock — rejected in
   favor of the already-single-instance CDC Worker.

## Consequences

- New backend: `confirmPrecharge` on `billingService` + `POST
  /api/platform/billing/media-charge/confirm`; `expiresAt` + a CONFIRMED status on
  the pre-charge ledger entry.
- opencode `billing.ts` gains `reportConfirm`, called on media-gen success.
- The CDC Worker now does two things: charge on `session.cost` deltas (LLM) **and**
  release expired media pre-charges. Both are billing background work — coherent.
- Full async-video reservation remains future work under openimago-3xp.
