/**
 * Shared application event bus built on Quasar's EventBus.
 * Used for cross-module communication without direct imports:
 * e.g. auth reauthentication notifies SSE manager to reconnect.
 */
import { EventBus } from 'quasar'

export interface AppEventMap extends Record<string, (...args: unknown[]) => void> {
  'auth:reauthenticated': () => void
}

export const appEventBus = new EventBus<AppEventMap>()
