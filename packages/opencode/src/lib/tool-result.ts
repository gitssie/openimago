/**
 * Consistent tool result formatting helpers.
 *
 * Use these to produce predictable string / JSON output from
 * OpenImago tools so the LLM can reliably parse results.
 */

export interface ToolResultPayload {
  title?: string
  output: string
  metadata?: Record<string, unknown>
}

/** Wrap plain text output with an optional title. */
export function textResult(output: string, title?: string): ToolResultPayload {
  return { title, output }
}

/** Format data as indented JSON output. */
export function jsonResult(
  data: unknown,
  title?: string,
): ToolResultPayload {
  return {
    title,
    output: JSON.stringify(data, null, 2),
    metadata: { format: "json" },
  }
}

/** Format an error as plain text with an "error" title. */
export function errorResult(message: string): ToolResultPayload {
  return { title: "error", output: message }
}
