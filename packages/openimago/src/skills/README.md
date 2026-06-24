# Skills

Two tiers of opencode skills (instructions-only single `SKILL.md` files).

## 1. Per-project user skills (openimago-wjcp)

User-authored, DB-backed. The `user_skills` row is the **source of truth**; the
file on disk is materialized from it.

- Location: `${projectDir}/.opencode/skills/<name>/SKILL.md`
- Managed via `SkillConfigService` + `projectSkillsRoutes`
  (`/api/platform/projects/:id/skills`).
- Create/update rewrites the file; delete removes the folder.

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
`.opencode` directories. A **project** skill of the same name **overrides** the
global default — the closer `.opencode/skills` entry wins. So a user can shadow a
shared default for their project without being able to modify the global tier.
