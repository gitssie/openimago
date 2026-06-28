# Skills

Two tiers of opencode skills (instructions-only single `SKILL.md` files).

## 1. Per-user skills (openimago-680i, supersedes openimago-wjcp)

User-authored, DB-backed. A single per-user skill library. The `user_skills` row
(unique on `(userId, name)`) is the **single source of truth** — CRUD does NOT
touch disk.

- Managed via `SkillConfigService` + `userSkillsRoutes` (`/api/platform/skills`).
- CRUD is keyed by `userId` only; no `projectId`.
- Skills are materialized into a project ONLY when the user uses it (session
  create) via `SkillConfigService.syncUserSkillsToDir(userId, dir)`, which writes
  each active skill to `${projectDir}/.opencode/skills/<name>/SKILL.md` and prunes
  any skill dir no longer in the user's DB set (so deletes propagate). opencode
  then discovers them through its walk-up `.opencode` discovery.

## 2. Default / shared skills (openimago-q41x)

Deployment/admin tier. **Not user-facing — no per-user API, no auth route.**
The curated `DEFAULT_SKILLS` array in `defaults.ts` is the source of truth; it is
materialized to the opencode **global** config dir, which opencode loads for
every location.

- Location: `<opencode config dir>/skills/<name>/SKILL.md`, where the config dir
  resolves as `OPENCODE_CONFIG_DIR` > `XDG_CONFIG_HOME/opencode` >
  `~/.config/opencode` (see `resolveGlobalSkillsDir`).
- Provision with: `bun run provision-skills` (from `packages/openimago`).
- Idempotent: re-running overwrites the set in place (no duplicates).

## Collision rule

opencode loads the **global** defaults first, then walks up the project's
`.opencode` directories. A synced **per-user** skill of the same name
**overrides** the global default — the closer `.opencode/skills` entry wins. So a
user can shadow a shared default in the projects they use without being able to
modify the global tier.
