import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * A single validation finding from the backend story-graph validator.
 * Mirrors the openimago `Problem` shape.
 */
interface Problem {
  file: string
  path: string
  code: string
  message: string
}

interface ValidationReport {
  ok: boolean
  errors: Problem[]
  warnings: Problem[]
}

/** Resolve the openimago backend base URL + service api-key from the env. */
function backendConfig(): { backendUrl: string; apiKey: string | undefined } {
  const backendUrl =
    (typeof process !== "undefined" ? process.env.OPENIMAGO_BACKEND_URL : undefined) ??
    "http://localhost:5467"
  const apiKey =
    typeof process !== "undefined" ? process.env.OPENIMAGO_BACKEND_API_KEY : undefined
  return { backendUrl, apiKey }
}

/**
 * Read the project id from the working directory's openimago.json manifest
 * (ADR 0004 — the agent's cwd is the project directory). Returns null when the
 * manifest is absent or malformed; the caller then requires an explicit arg.
 */
async function readProjectIdFromManifest(directory: string): Promise<string | null> {
  try {
    const raw = await readFile(join(directory, "openimago.json"), "utf-8")
    const manifest = JSON.parse(raw) as { projectId?: unknown }
    return typeof manifest.projectId === "string" ? manifest.projectId : null
  } catch {
    return null
  }
}

/** Format the structured report into an agent-readable summary. */
function formatReport(report: ValidationReport): string {
  if (report.ok && report.warnings.length === 0) {
    return "✓ Story state is valid. No errors or warnings."
  }

  const lines: string[] = []
  lines.push(report.ok ? "✓ Story state is valid (with warnings)." : "✗ Story state has errors.")

  const section = (label: string, problems: Problem[]) => {
    if (problems.length === 0) return
    lines.push("", `${label} (${problems.length}):`)
    for (const p of problems) {
      const where = [p.file, p.path].filter(Boolean).join(" → ")
      lines.push(`  [${p.code}] ${where}: ${p.message}`)
    }
  }

  section("ERRORS", report.errors)
  section("WARNINGS", report.warnings)
  return lines.join("\n")
}

/**
 * Creates the `validate_story` tool — a "typecheck" for story state.
 *
 * Calls the openimago backend's GET /api/platform/projects/:id/story/validate
 * over the trusted service channel (x-api-key), which validates the full
 * referential graph across bible/series/episodes/workflow/runs and returns a
 * structured { ok, errors[], warnings[] } report.
 */
export function createValidateStoryTool(): ToolDefinition {
  return tool({
    description:
      "Validate the project's story state — a typecheck for the bible/series/episodes/workflow/runs graph. Reports schema, reference-integrity, template-ref, and association-completeness errors, plus orphan-artifact warnings.",
    args: {
      projectId: tool.schema
        .string()
        .optional()
        .describe("Project id. Defaults to the projectId in the working directory's openimago.json."),
    },
    async execute(args, context) {
      const directory = context.directory
      const projectId = args.projectId ?? (await readProjectIdFromManifest(directory))
      if (!projectId) {
        return "Could not determine the project id. Run this inside a project directory (with openimago.json) or pass projectId explicitly."
      }

      const { backendUrl, apiKey } = backendConfig()
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (apiKey) headers["x-api-key"] = apiKey

      let response: Response
      try {
        response = await fetch(
          `${backendUrl}/api/platform/projects/${encodeURIComponent(projectId)}/story/validate`,
          { method: "GET", headers },
        )
      } catch (err) {
        return `Failed to reach the openimago backend at ${backendUrl}: ${
          err instanceof Error ? err.message : String(err)
        }`
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "(no body)")
        return `validate_story request failed (${response.status}): ${text}`
      }

      const data = (await response.json()) as { validation?: ValidationReport }
      if (!data.validation) {
        return "validate_story response missing the validation report."
      }
      return formatReport(data.validation)
    },
  })
}
