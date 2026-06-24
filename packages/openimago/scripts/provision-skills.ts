/**
 * Provision the default/shared skill set into the opencode GLOBAL config dir
 * (openimago-q41x). Deployment/admin only — NOT user-facing.
 *
 * Writes <opencode config dir>/skills/<name>/SKILL.md for every entry in
 * DEFAULT_SKILLS. Idempotent: re-running overwrites the set in place.
 *
 * Target dir resolution (see resolveGlobalSkillsDir):
 *   OPENCODE_CONFIG_DIR > XDG_CONFIG_HOME/opencode > ~/.config/opencode, + /skills
 *
 * Collision rule: a PROJECT skill of the same name overrides the global default
 * (opencode loads global first; the closer project .opencode/skills wins).
 *
 * Run with: bun run provision-skills   (from packages/openimago)
 */
import { provisionDefaultSkills, resolveGlobalSkillsDir } from "../src/skills/defaults"
import { logger } from "../src/server/logger"

async function main() {
  const baseDir = resolveGlobalSkillsDir()
  const result = await provisionDefaultSkills({ baseDir })
  logger.info(
    { baseDir: result.baseDir, written: result.written, names: result.names },
    "provision-skills: done",
  )
  // eslint-disable-next-line no-console
  console.log(`Provisioned ${result.written} default skill(s) into ${result.baseDir}: ${result.names.join(", ")}`)
}

main().catch((err) => {
  logger.error({ err }, "provision-skills: failed")
  process.exitCode = 1
})
