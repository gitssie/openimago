/**
 * Idempotent dev/e2e seed.
 *
 * Provisions, in a re-runnable way:
 *   1. A login-ready test user (email + password auth, emailVerified=true) with
 *      STABLE user/workspace ids.
 *   2. A sample project with a STABLE projectId whose story/ is filled from the
 *      docs/story-schema/* fixtures, trimmed to be internally consistent so
 *      validate_story reports no hard errors.
 *
 * Run with: bun run seed   (from packages/openimago)
 *
 * Idempotency: the user is upserted by stable id; the project is
 * delete-and-recreated (DB rows + on-disk story files) on every run.
 */
import { readFile, mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { db } from "../src/db/client"
import { projects, users, userAuths, workspaceGeneratedFiles } from "../src/db/schema"
import { WorkspaceTable } from "../src/db/workspace-schema"
import { projectService } from "../src/project/service"
import { authId } from "../src/utils/ids"
import { logger } from "../src/server/logger"
import {
  completedRunArtifacts,
  trimSeriesToPresent,
  withProjectId,
  type JsonObject,
} from "./seed-helpers"

// ── Stable constants (env-overridable for the credentials) ────────────────────

const SEED_USER_EMAIL = (process.env.SEED_USER_EMAIL ?? "default_user@example.com").toLowerCase()
const SEED_USER_PASSWORD = process.env.SEED_USER_PASSWORD ?? "default_password"

// Deterministic ids so re-runs and the project link stay consistent, and the
// e2e URL (/projects/<id>/...) is fixed. Format mirrors utils/ids.ts prefixes.
const SEED_USER_ID = "usr_seed0000000000000000a"
const SEED_WORKSPACE_ID = "wrk_seed0000000000000000a"
const SEED_PROJECT_ID = "proj_seed0000000000000a"
const SEED_USERNAME = "default_user"
const SEED_PROJECT_NAME = "Neon Drift (seed)"

const COS_BASE_PATH = process.env.COS_BASE_PATH ?? "/opt/work"

// Repo fixtures live at <repo>/docs/story-schema relative to this script
// (packages/openimago/scripts → ../../.. → repo root).
const FIXTURE_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "docs", "story-schema")

// ── User ──────────────────────────────────────────────────────────────────────

/**
 * Provision the seed user and return its effective id. Keyed by EMAIL (the
 * stable unique key) to stay idempotent without breaking FKs: if a row already
 * exists for the seed email (e.g. from a prior register), adopt it in place
 * rather than delete-and-recreate (which would orphan its projects/auths).
 * Otherwise insert under the stable SEED_USER_ID. The returned id is stable
 * across re-runs because the email is.
 */
async function seedUser(): Promise<{ userId: string; workspaceId: string }> {
  const now = new Date()
  const passwordHash = await Bun.password.hash(SEED_USER_PASSWORD)

  const existing = await db
    .select({ id: users.id, workspaceId: users.workspaceId })
    .from(users)
    .where(eq(users.email, SEED_USER_EMAIL))
    .limit(1)

  let effectiveUserId: string
  let effectiveWorkspaceId: string

  if (existing.length > 0) {
    // Adopt the existing email row; canonicalize its login-relevant fields.
    effectiveUserId = existing[0]!.id
    effectiveWorkspaceId = existing[0]!.workspaceId ?? SEED_WORKSPACE_ID
    await db
      .update(users)
      .set({
        emailVerified: true,
        emailVerifiedAt: now,
        workspaceId: effectiveWorkspaceId,
        updatedAt: now,
      })
      .where(eq(users.id, effectiveUserId))
  } else {
    effectiveUserId = SEED_USER_ID
    effectiveWorkspaceId = SEED_WORKSPACE_ID
    await db.insert(users).values({
      id: effectiveUserId,
      username: SEED_USERNAME,
      email: SEED_USER_EMAIL,
      emailVerified: true,
      emailVerifiedAt: now,
      displayName: "Default User",
      workspaceId: effectiveWorkspaceId,
      role: "user",
      createdAt: now,
      updatedAt: now,
    })
  }

  // Replace the password auth row (re-runnable: drop then insert with a fresh
  // hash so the documented password always works).
  await db.delete(userAuths).where(eq(userAuths.userId, effectiveUserId))
  await db.insert(userAuths).values({
    id: authId(),
    userId: effectiveUserId,
    provider: "password",
    providerId: null,
    passwordHash,
    createdAt: now,
  })

  logger.info({ userId: effectiveUserId, email: SEED_USER_EMAIL }, "seed: user ready")
  return { userId: effectiveUserId, workspaceId: effectiveWorkspaceId }
}

// ── Project + story ─────────────────────────────────────────────────────────

async function readFixture(relativePath: string): Promise<JsonObject> {
  const raw = await readFile(path.join(FIXTURE_ROOT, relativePath), "utf-8")
  return JSON.parse(raw) as JsonObject
}

/** Write a JSON doc into the project's story/ tree (creating parent dirs). */
async function writeStoryFile(directory: string, relativePath: string, doc: unknown): Promise<void> {
  const full = path.join(directory, relativePath)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, `${JSON.stringify(doc, null, 2)}\n`, "utf-8")
}

async function seedProject(userId: string, workspaceId: string): Promise<void> {
  const directory = `${COS_BASE_PATH}/${SEED_PROJECT_ID}`
  const now = new Date()

  // Delete-and-recreate (idempotent): drop the project row + its on-disk dir so
  // a re-run starts from a clean, fixture-defined state.
  await db.delete(projects).where(eq(projects.id, SEED_PROJECT_ID))
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })

  await db.insert(projects).values({
    id: SEED_PROJECT_ID,
    userId,
    name: SEED_PROJECT_NAME,
    description: "Seeded sample project with a complete ep_001 story graph.",
    directory,
    status: "active",
    createdAt: now,
    updatedAt: now,
  })

  // Link the seed user's workspace to this project (mirrors projectService.create
  // so artifact/session resolution by project works). Upsert by workspace id.
  await db
    .insert(WorkspaceTable)
    .values({
      id: workspaceId,
      type: "local",
      name: SEED_PROJECT_NAME,
      directory,
      project_id: SEED_PROJECT_ID,
      time_used: Date.now(),
      userId,
    })
    .onConflictDoUpdate({
      target: WorkspaceTable.id,
      set: { directory, name: SEED_PROJECT_NAME, project_id: SEED_PROJECT_ID, userId },
    })

  // Scaffold AGENTS.md + openimago.json (and stub story files); then OVERWRITE
  // the story files with the real fixtures below.
  await projectService.scaffoldProjectFiles(SEED_PROJECT_ID, SEED_PROJECT_NAME, directory, now)

  // Load fixtures and make them internally consistent for THIS project.
  const bible = withProjectId(await readFixture("bible.json"), SEED_PROJECT_ID)
  const seriesRaw = withProjectId(await readFixture("series.json"), SEED_PROJECT_ID)
  const episode = await readFixture("episodes/ep_001.json")
  const workflow = await readFixture("workflow/ep_001.workflow.json")
  const runs = await readFixture("runs/ep_001.runs.json")

  // Only ep_001 files exist → trim the series index to ep_001 so validate_story
  // does not flag MISSING_EPISODE_FILE for ep_002/ep_003.
  const series = trimSeriesToPresent(seriesRaw, ["ep_001"])

  await writeStoryFile(directory, "story/bible.json", bible)
  await writeStoryFile(directory, "story/series.json", series)
  await writeStoryFile(directory, "story/episodes/ep_001.json", episode)
  await writeStoryFile(directory, "story/workflow/ep_001.workflow.json", workflow)
  await writeStoryFile(directory, "story/runs/ep_001.runs.json", runs)

  // Register a real workspace_generated_files row for every completed run's
  // result artifact, so validate_story's run.result.artifactId resolution
  // passes (otherwise each completed run is a DANGLING_ARTIFACT_REF). Linked to
  // the project's workspace so the project-scoped artifact query finds them.
  const artifacts = completedRunArtifacts(runs)
  if (artifacts.length > 0) {
    await db
      .delete(workspaceGeneratedFiles)
      .where(eq(workspaceGeneratedFiles.workspaceId, workspaceId))
    const createdAt = now
    await db.insert(workspaceGeneratedFiles).values(
      artifacts.map((a) => ({
        id: a.artifactId,
        sessionId: `seed_${SEED_PROJECT_ID}`,
        workspaceId,
        kind: a.kind,
        mimeType: a.mime,
        filename: a.filename,
        accessLocators: {
          preview: { href: a.previewHref },
          ...(a.thumbnailHref ? { thumbnail: { href: a.thumbnailHref } } : {}),
        },
        status: "active",
        createdAt,
        updatedAt: createdAt,
      })),
    )
  }

  logger.info(
    { projectId: SEED_PROJECT_ID, directory, artifacts: artifacts.length },
    "seed: project + story ready",
  )
}

// ── Entry ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { userId, workspaceId } = await seedUser()
  await seedProject(userId, workspaceId)
  logger.info(
    { email: SEED_USER_EMAIL, projectId: SEED_PROJECT_ID },
    "seed: done — login with the seed credentials; project URL uses the stable projectId",
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "seed: failed")
    process.exit(1)
  })
