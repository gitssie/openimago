import { tool, type ToolDefinition } from "@opencode-ai/plugin"

/**
 * creates the `imago_status` diagnostic tool.
 *
 * Reports workspace context info to help verify OpenImago plugin wiring
 * and surface session metadata.  This is a harmless scaffolding tool;
 * replace with real OpenImago backend-integrated tools later.
 */
export function createImagoStatusTool(): ToolDefinition {
  return tool({
    description:
      "Report diagnostic info about the OpenImago workspace context",
    args: {
      verbose: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Include detailed session context"),
    },
    async execute(args, context) {
      const { agent, sessionID, messageID, directory, worktree } = context

      const lines: string[] = [
        `OpenImago Workspace Context`,
        `==========================`,
        `Agent:       ${agent ?? "N/A"}`,
        `Session ID:  ${sessionID ?? "N/A"}`,
        `Message ID:  ${messageID ?? "N/A"}`,
        `Directory:   ${directory}`,
        `Worktree:    ${worktree}`,
      ]

      if (args.verbose) {
        lines.push(
          ``,
          `This is a diagnostic tool from the OpenImago plugin.`,
          `Future tools will integrate with the OpenImago backend.`,
        )
      }

      return lines.join(`\n`)
    },
  })
}
