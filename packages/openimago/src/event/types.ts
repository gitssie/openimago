/**
 * Raw event from opencode /global/event SSE stream.
 * Contains workspace metadata so the proxy can route to the right user.
 */
export interface GlobalEvent {
  /** workspaceId of the OpenCode workspace that produced this event */
  workspace?: string
  /** filesystem directory of the instance */
  directory?: string
  /** project identifier */
  project?: string
  /** The actual bus event payload */
  payload: BusEvent
}

/**
 * Bus event payload — what gets delivered to the web frontend.
 * Matches the structure from @opencode-ai/sdk/v2 Event type.
 */
export interface BusEvent {
  id: string
  type: string
  properties: unknown
}
