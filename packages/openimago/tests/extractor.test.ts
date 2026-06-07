/**
 * Tests for Workspace Key Extractor — extraction from GlobalEvent.
 *
 * Behaviors tested:
 *   1. Extracts from evt.workspace when valid
 *   2. Falls back to evt.directory
 *   3. Falls back to payload.properties.workspaceID
 *   4. Falls back to payload.properties.info.workspaceID
 *   5. Falls back to last path segment of directory
 *   6. Returns empty string for unresolvable events
 */
import { describe, test, expect } from "bun:test"
import { extractWorkspaceKey } from "../src/event/extractor"
import type { GlobalEvent } from "../src/event/types"

function mkEvent(overrides: Partial<GlobalEvent> = {}): GlobalEvent {
  return {
    workspace: undefined,
    directory: undefined,
    payload: { id: "evt_1", type: "session.updated", properties: {} },
    ...overrides,
  }
}

describe("extractWorkspaceKey", () => {
  test("extracts from evt.workspace", () => {
    const evt = mkEvent({ workspace: "wrk_abc" })
    expect(extractWorkspaceKey(evt)).toBe("wrk_abc")
  })

  test("falls back to evt.directory", () => {
    const evt = mkEvent({ directory: "wrk_def" })
    expect(extractWorkspaceKey(evt)).toBe("wrk_def")
  })

  test("prefers evt.workspace over evt.directory", () => {
    const evt = mkEvent({ workspace: "wrk_abc", directory: "/tmp/wrk_def" })
    expect(extractWorkspaceKey(evt)).toBe("wrk_abc")
  })

  test("falls back to payload.properties.workspaceID", () => {
    const evt = mkEvent({
      workspace: "/",
      payload: {
        id: "evt_2",
        type: "session.updated",
        properties: { workspaceID: "wrk_from_props" },
      },
    })
    expect(extractWorkspaceKey(evt)).toBe("wrk_from_props")
  })

  test("falls back to payload.properties.info.workspaceID", () => {
    const evt = mkEvent({
      workspace: "/",
      payload: {
        id: "evt_3",
        type: "session.updated",
        properties: { info: { workspaceID: "wrk_from_info" } },
      },
    })
    expect(extractWorkspaceKey(evt)).toBe("wrk_from_info")
  })

  test("falls back to last directory path segment", () => {
    const evt = mkEvent({
      workspace: "/",
      directory: "/home/user/projects/my-workspace",
      payload: { id: "evt_4", type: "session.updated", properties: {} },
    })
    expect(extractWorkspaceKey(evt)).toBe("my-workspace")
  })

  test("returns empty string when nothing resolves", () => {
    const evt = mkEvent({
      workspace: "/",
      directory: undefined,
      payload: { id: "evt_5", type: "session.updated", properties: {} },
    })
    expect(extractWorkspaceKey(evt)).toBe("")
  })

  test("returns empty string for absolute-path-only workspace", () => {
    const evt = mkEvent({
      workspace: "/some/path",
      directory: undefined,
    })
    expect(extractWorkspaceKey(evt)).toBe("")
  })
})
