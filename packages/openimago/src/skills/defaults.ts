// ── Default / shared skill provisioning (openimago-q41x) ──────────────────────
//
// Deployment/admin tier. These curated skills are written to the opencode GLOBAL
// config dir so opencode loads them for EVERY location. Users cannot write here
// (no per-user API); this is provisioned by a seed/CLI script on the host.
//
// Collision rule (verified against opencode core/src/config.ts skill discovery):
//   opencode loads global defaults first, then walks up the project's `.opencode`
//   dirs. A PROJECT skill of the same name (written by the per-project feature,
//   openimago-wjcp, at ${projectDir}/.opencode/skills/<name>/SKILL.md) OVERRIDES
//   the global default — the closer `.opencode/skills` entry wins.
//
// DB row is the source of truth ONLY for the per-project tier. This global tier
// has no DB; its source of truth is the DEFAULT_SKILLS array below, materialized
// idempotently to disk.

import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { serializeSkillMd, type SkillFileSystem } from "./service"
import { logger } from "../server/logger"

// ── Curated default set (edit here — this array is the source of truth) ───────

export interface DefaultSkill {
  name: string // slug: lowercase alphanumeric + internal hyphens
  description: string
  content: string // SKILL.md body, instructions-only
}

export const DEFAULT_SKILLS: DefaultSkill[] = [
  {
    name: "story-bible-keeper",
    description: "Keep the project story bible consistent: characters, world rules, and visual style stay in sync across episodes.",
    content: [
      "When working on any story file, first read `story/bible.json` to ground",
      "yourself in the established world, characters, and visual style.",
      "",
      "Rules:",
      "1. Never introduce a character, place, or rule that contradicts the bible.",
      "2. When a new canonical fact is established, update `story/bible.json` so",
      "   later work stays consistent.",
      "3. Keep visual-style descriptors (palette, lens, mood) identical across",
      "   shots of the same scene unless the script explicitly calls for a change.",
    ].join("\n"),
  },
  {
    name: "shot-prompt-smith",
    description: "Write precise, render-ready image/video prompts for a shot from its script, camera, and the story bible's visual style.",
    content: [
      "When asked to generate media for a shot, build the prompt from three",
      "sources, in order: the shot's action/dialogue, its camera + lens, and the",
      "bible's visual-style descriptors.",
      "",
      "A good shot prompt names: subject + action, framing (wide/medium/close),",
      "lens + camera move, lighting + palette, and mood. Keep it one tight",
      "paragraph; omit anything the bible already enforces globally.",
      "",
      "Always stamp the generated artifact with its `shotId`/`nodeId` so",
      "validate_story can close the loop.",
    ].join("\n"),
  },
]

// ── Global skills dir resolution ──────────────────────────────────────────────

/**
 * Resolve the opencode GLOBAL skills directory the way the rest of the host
 * resolves config paths. Precedence (highest first):
 *   1. OPENCODE_CONFIG_DIR  → <that>/skills              (explicit override)
 *   2. XDG_CONFIG_HOME      → <that>/opencode/skills     (freedesktop standard)
 *   3. HOME / os.homedir()  → <home>/.config/opencode/skills  (platform default)
 *
 * This is a documented platform default, not a hidden default for required
 * config — there is always a well-defined location, so it never silently
 * masks a missing required value.
 */
export function resolveGlobalSkillsDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCODE_CONFIG_DIR
  if (override && override.length > 0) {
    return path.join(override, "skills")
  }

  const xdg = env.XDG_CONFIG_HOME
  if (xdg && xdg.length > 0) {
    return path.join(xdg, "opencode", "skills")
  }

  const home = env.HOME && env.HOME.length > 0 ? env.HOME : homedir()
  return path.join(home, ".config", "opencode", "skills")
}

// ── Provisioning ──────────────────────────────────────────────────────────────

const realFs: SkillFileSystem = {
  mkdir: async (dir) => { await mkdir(dir, { recursive: true }) },
  writeFile: async (file, data) => { await writeFile(file, data, "utf-8") },
  rm: async () => { /* provisioning never removes — upsert-only */ },
}

export interface ProvisionOptions {
  /** Target skills dir. Defaults to resolveGlobalSkillsDir(). Injected in tests. */
  baseDir?: string
  /** Injectable filesystem (mirrors WorkDirService). Defaults to real fs. */
  fs?: SkillFileSystem
}

export interface ProvisionResult {
  baseDir: string
  written: number
  names: string[]
}

/**
 * Idempotently materialize DEFAULT_SKILLS into the global skills dir. Each skill
 * becomes `<baseDir>/<name>/SKILL.md`. Re-running overwrites in place (upsert) —
 * `mkdir` is recursive and `writeFile` truncates — so no duplicates accumulate.
 */
export async function provisionDefaultSkills(opts: ProvisionOptions = {}): Promise<ProvisionResult> {
  const baseDir = opts.baseDir ?? resolveGlobalSkillsDir()
  const fs = opts.fs ?? realFs

  for (const skill of DEFAULT_SKILLS) {
    const dir = path.join(baseDir, skill.name)
    await fs.mkdir(dir)
    await fs.writeFile(
      path.join(dir, "SKILL.md"),
      serializeSkillMd(skill.name, skill.description, skill.content),
    )
  }

  logger.info({ baseDir, written: DEFAULT_SKILLS.length }, "skills.provision: default skills provisioned")
  return { baseDir, written: DEFAULT_SKILLS.length, names: DEFAULT_SKILLS.map((s) => s.name) }
}
