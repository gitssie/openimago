/**
 * Story-state graph validator — a "typecheck" for the 5-layer story JSON
 * (ADR 0004: bible / series / episodes / workflow / runs).
 *
 * This module is PURE and IO-free: it takes already-parsed documents plus the
 * set of known artifact ids and returns a structured report. All file reading
 * and artifact lookup happens in StoryValidationService, which wraps this. The
 * split keeps the graph logic trivially unit-testable against fixtures with no
 * database or filesystem.
 */

// ── Report shape ──────────────────────────────────────────────────────────────

/** A single validation finding. */
export interface Problem {
  /** Story file the problem was found in (relative path), or "" if cross-file. */
  file: string
  /** JSON-ish path to the offending value (e.g. "episodes[ep_001].shots[2].sceneId"). */
  path: string
  /** Stable machine code (e.g. "DANGLING_SHOT_REF"). */
  code: string
  /** Human-readable explanation. */
  message: string
}

/**
 * errors = must-fix problems that break the referential graph.
 * warnings = soft issues (orphans, dangling-but-tolerable references).
 */
export interface StoryValidationReport {
  ok: boolean
  errors: Problem[]
  warnings: Problem[]
}

// ── Input shape ─────────────────────────────────────────────────────────────

/** A parsed story file paired with its relative path (for error reporting). */
export interface NamedDoc {
  file: string
  data: unknown
}

export interface StoryValidationInput {
  bible?: NamedDoc
  series?: NamedDoc
  episodes: NamedDoc[]
  workflows: NamedDoc[]
  runs: NamedDoc[]
  /** Episode ids whose episodes/ep_*.json file actually exists on disk. */
  presentEpisodeIds: string[]
  /** Artifact ids known to exist (workspace_generated_files ids + outputs file ids). */
  knownArtifactIds: Set<string>
  /**
   * Artifacts whose metadata stamps a shotId/nodeId (the closed-loop stamp from
   * the follow-up generate-image work). Used for ORPHAN detection: a stamped
   * artifact that no run references is a soft issue (warning). Optional — when
   * absent, no orphan warnings are produced.
   */
  stampedArtifacts?: StampedArtifact[]
}

/** A generated artifact carrying a shot/node stamp in its metadata. */
export interface StampedArtifact {
  artifactId: string
  shotId?: string | null
  nodeId?: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Slug = lowercase alphanumerics with hyphens/underscores, not starting with a separator. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/

/** Recognized template-ref tokens: {{character.<id>.<field>}} etc. */
const TEMPLATE_REF_PATTERN = /\{\{\s*(character|scene|style|shot)\.([a-z0-9][a-z0-9_-]*)\.([a-zA-Z0-9_]+)\s*\}\}/g

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(isObject) : []
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/** Shot statuses that mean the shot is expected to have generated media. */
const GENERATED_SHOT_STATUSES = new Set(["generated", "approved"])
const COMPLETED_RUN_STATUS = "completed"

// ── Validator ─────────────────────────────────────────────────────────────────

export function validateStoryGraph(input: StoryValidationInput): StoryValidationReport {
  const errors: Problem[] = []
  const warnings: Problem[] = []
  const err = (file: string, path: string, code: string, message: string) =>
    errors.push({ file, path, code, message })
  const warn = (file: string, path: string, code: string, message: string) =>
    warnings.push({ file, path, code, message })

  // ── Bible: schema + slug ids → build canon id sets ──────────────────────────
  const characterIds = new Set<string>()
  const sceneIds = new Set<string>()
  const styleIds = new Set<string>()
  // Field maps for template-ref field resolution: id → set of field names.
  const characterFields = new Map<string, Set<string>>()
  const sceneFields = new Map<string, Set<string>>()
  const styleFields = new Map<string, Set<string>>()

  if (!input.bible) {
    err("story/bible.json", "bible", "MISSING_FILE", "Required story/bible.json is missing")
  } else {
    const b = input.bible.data
    const f = input.bible.file
    if (!isObject(b)) {
      err(f, "bible", "INVALID_JSON", "bible.json is not an object")
    } else {
      if (b["schemaVersion"] === undefined) {
        err(f, "schemaVersion", "MISSING_SCHEMA_VERSION", "bible.json missing schemaVersion")
      }
      const collect = (
        list: Record<string, unknown>[],
        idSet: Set<string>,
        fieldMap: Map<string, Set<string>>,
        kind: string,
      ) => {
        list.forEach((item, i) => {
          const id = str(item["id"])
          if (!id) {
            err(f, `${kind}[${i}].id`, "MISSING_ID", `${kind} entry missing id`)
            return
          }
          if (!SLUG_PATTERN.test(id)) {
            err(f, `${kind}[${i}].id`, "INVALID_SLUG", `${kind} id is not a slug: "${id}"`)
          }
          if (idSet.has(id)) {
            err(f, `${kind}[${i}].id`, "DUPLICATE_ID", `Duplicate ${kind} id: "${id}"`)
          }
          idSet.add(id)
          fieldMap.set(id, new Set(Object.keys(item)))
        })
      }
      collect(asArray(b["characters"]), characterIds, characterFields, "characters")
      collect(asArray(b["scenes"]), sceneIds, sceneFields, "scenes")
      collect(asArray(b["styleSeeds"]), styleIds, styleFields, "styleSeeds")
    }
  }

  // ── Episodes: schema, slug ids, shot ref integrity → build shot id sets ──────
  // episodeId → set of shot ids; episodeId → field map for {{shot.<id>.<field>}}.
  const shotIdsByEpisode = new Map<string, Set<string>>()
  const shotFieldsByEpisode = new Map<string, Map<string, Set<string>>>()

  for (const ep of input.episodes) {
    const f = ep.file
    const e = ep.data
    if (!isObject(e)) {
      err(f, "episode", "INVALID_JSON", "episode file is not an object")
      continue
    }
    if (e["schemaVersion"] === undefined) {
      err(f, "schemaVersion", "MISSING_SCHEMA_VERSION", "episode missing schemaVersion")
    }
    const episodeId = str(e["id"])
    if (!episodeId) {
      err(f, "id", "MISSING_ID", "episode missing id")
    }
    const shotIds = new Set<string>()
    const shotFields = new Map<string, Set<string>>()
    const shots = asArray(e["shots"])
    shots.forEach((shot, i) => {
      const shotId = str(shot["id"])
      if (!shotId) {
        err(f, `shots[${i}].id`, "MISSING_ID", "shot missing id")
      } else {
        if (!SLUG_PATTERN.test(shotId)) {
          err(f, `shots[${i}].id`, "INVALID_SLUG", `shot id is not a slug: "${shotId}"`)
        }
        if (shotIds.has(shotId)) {
          err(f, `shots[${i}].id`, "DUPLICATE_ID", `Duplicate shot id: "${shotId}"`)
        }
        shotIds.add(shotId)
        shotFields.set(shotId, new Set(Object.keys(shot)))
      }

      // shot.sceneId → bible.scenes[].id
      const sceneId = str(shot["sceneId"])
      if (sceneId && !sceneIds.has(sceneId)) {
        err(f, `shots[${i}].sceneId`, "DANGLING_SCENE_REF", `shot.sceneId "${sceneId}" not found in bible.scenes`)
      }
      // shot.characterIds[] → bible.characters[].id
      const charIds = Array.isArray(shot["characterIds"]) ? shot["characterIds"] : []
      charIds.forEach((cid, ci) => {
        const id = str(cid)
        if (id && !characterIds.has(id)) {
          err(f, `shots[${i}].characterIds[${ci}]`, "DANGLING_CHARACTER_REF", `shot.characterIds "${id}" not found in bible.characters`)
        }
      })
      // dialog[].characterId → bible.characters[].id
      const dialog = asArray(shot["dialog"])
      dialog.forEach((line, di) => {
        const id = str(line["characterId"])
        if (id && !characterIds.has(id)) {
          err(f, `shots[${i}].dialog[${di}].characterId`, "DANGLING_CHARACTER_REF", `dialog.characterId "${id}" not found in bible.characters`)
        }
      })
    })
    if (episodeId) {
      shotIdsByEpisode.set(episodeId, shotIds)
      shotFieldsByEpisode.set(episodeId, shotFields)
    }
  }

  // ── Series: schema + episode-file existence ─────────────────────────────────
  if (input.series) {
    const f = input.series.file
    const s = input.series.data
    if (!isObject(s)) {
      err(f, "series", "INVALID_JSON", "series.json is not an object")
    } else {
      if (s["schemaVersion"] === undefined) {
        err(f, "schemaVersion", "MISSING_SCHEMA_VERSION", "series.json missing schemaVersion")
      }
      const present = new Set(input.presentEpisodeIds)
      asArray(s["episodes"]).forEach((entry, i) => {
        const id = str(entry["id"])
        if (id && !present.has(id)) {
          err(f, `episodes[${i}].id`, "MISSING_EPISODE_FILE", `series references episode "${id}" but no episodes/${id}.json exists`)
        }
      })
    }
  }

  // ── Helper: episode id parsed from a workflow/runs doc's episodeId field ─────
  const templateRefField = (kind: string, id: string, episodeIdForShot: string): Set<string> | undefined => {
    if (kind === "character") return characterFields.get(id)
    if (kind === "scene") return sceneFields.get(id)
    if (kind === "style") return styleFields.get(id)
    if (kind === "shot") return shotFieldsByEpisode.get(episodeIdForShot)?.get(id)
    return undefined
  }

  // ── Workflow: node.shotId / dependsOn / edges + template-ref resolution ──────
  // Track node ids globally per workflow for run.nodeId resolution.
  // workflowEpisodeId → { nodeIds, nodeShotId }
  const nodeIdsByEpisode = new Map<string, Set<string>>()
  const nodeShotIdByEpisode = new Map<string, Map<string, string | null>>()

  for (const wf of input.workflows) {
    const f = wf.file
    const w = wf.data
    if (!isObject(w)) {
      err(f, "workflow", "INVALID_JSON", "workflow file is not an object")
      continue
    }
    if (w["schemaVersion"] === undefined) {
      err(f, "schemaVersion", "MISSING_SCHEMA_VERSION", "workflow missing schemaVersion")
    }
    const episodeId = str(w["episodeId"])
    const shotIds = shotIdsByEpisode.get(episodeId) ?? new Set<string>()
    const nodes = asArray(w["nodes"])
    const nodeIds = new Set<string>()
    const nodeShotId = new Map<string, string | null>()

    // First pass: collect node ids.
    nodes.forEach((node, i) => {
      const id = str(node["id"])
      if (!id) {
        err(f, `nodes[${i}].id`, "MISSING_ID", "workflow node missing id")
        return
      }
      if (nodeIds.has(id)) {
        err(f, `nodes[${i}].id`, "DUPLICATE_ID", `Duplicate workflow node id: "${id}"`)
      }
      nodeIds.add(id)
    })

    // Second pass: shotId, dependsOn, template refs.
    nodes.forEach((node, i) => {
      const id = str(node["id"])
      // node.shotId (when non-null) → episode shot.id. null = concept-art node.
      const rawShotId = node["shotId"]
      if (rawShotId === null || rawShotId === undefined) {
        if (id) nodeShotId.set(id, null)
      } else {
        const shotId = str(rawShotId)
        if (id) nodeShotId.set(id, shotId)
        if (shotId && !shotIds.has(shotId)) {
          err(f, `nodes[${i}].shotId`, "DANGLING_SHOT_REF", `node.shotId "${shotId}" not found in episode "${episodeId}" shots`)
        }
      }
      // dependsOn[] → node.id
      const deps = Array.isArray(node["dependsOn"]) ? node["dependsOn"] : []
      deps.forEach((dep, di) => {
        const depId = str(dep)
        if (depId && !nodeIds.has(depId)) {
          err(f, `nodes[${i}].dependsOn[${di}]`, "DANGLING_NODE_REF", `node.dependsOn "${depId}" not found in workflow nodes`)
        }
      })
      // Template refs in params.promptTemplate / negativePromptTemplate.
      const params = isObject(node["params"]) ? node["params"] : {}
      for (const key of ["promptTemplate", "negativePromptTemplate"]) {
        const tmpl = str(params[key])
        if (!tmpl) continue
        for (const m of tmpl.matchAll(TEMPLATE_REF_PATTERN)) {
          const [, kind, refId, field] = m
          const fields = templateRefField(kind!, refId!, episodeId)
          if (!fields) {
            err(f, `nodes[${i}].params.${key}`, "UNRESOLVED_TEMPLATE_REF", `template ref {{${kind}.${refId}.${field}}} references unknown ${kind} "${refId}"`)
          } else if (!fields.has(field!)) {
            err(f, `nodes[${i}].params.${key}`, "UNRESOLVED_TEMPLATE_FIELD", `template ref {{${kind}.${refId}.${field}}} references unknown field "${field}" on ${kind} "${refId}"`)
          }
        }
      }
    })

    // edges.from / edges.to → node.id
    asArray(w["edges"]).forEach((edge, i) => {
      const from = str(edge["from"])
      const to = str(edge["to"])
      if (from && !nodeIds.has(from)) {
        err(f, `edges[${i}].from`, "DANGLING_NODE_REF", `edge.from "${from}" not found in workflow nodes`)
      }
      if (to && !nodeIds.has(to)) {
        err(f, `edges[${i}].to`, "DANGLING_NODE_REF", `edge.to "${to}" not found in workflow nodes`)
      }
    })

    if (episodeId) {
      nodeIdsByEpisode.set(episodeId, nodeIds)
      nodeShotIdByEpisode.set(episodeId, nodeShotId)
    }
  }

  // ── Runs: nodeId / shotId consistency / artifact resolution ─────────────────
  // Track which (shotId) have at least one completed run with a result artifact,
  // and which artifact ids are referenced by runs (for orphan detection).
  const shotsWithCompletedArtifact = new Set<string>()
  const artifactIdsReferencedByRuns = new Set<string>()

  for (const rf of input.runs) {
    const f = rf.file
    const r = rf.data
    if (!isObject(r)) {
      err(f, "runs", "INVALID_JSON", "runs file is not an object")
      continue
    }
    if (r["schemaVersion"] === undefined) {
      err(f, "schemaVersion", "MISSING_SCHEMA_VERSION", "runs missing schemaVersion")
    }
    const episodeId = str(r["episodeId"])
    const nodeIds = nodeIdsByEpisode.get(episodeId) ?? new Set<string>()
    const nodeShotId = nodeShotIdByEpisode.get(episodeId) ?? new Map<string, string | null>()

    asArray(r["runs"]).forEach((run, i) => {
      // run.nodeId → workflow node.id
      const nodeId = str(run["nodeId"])
      if (!nodeId) {
        err(f, `runs[${i}].nodeId`, "MISSING_NODE_REF", "run is missing nodeId")
      } else if (!nodeIds.has(nodeId)) {
        err(f, `runs[${i}].nodeId`, "DANGLING_NODE_REF", `run.nodeId "${nodeId}" not found in workflow for episode "${episodeId}"`)
      } else {
        // run.shotId consistent with that node's shotId (both null OR equal).
        const nodeShot = nodeShotId.get(nodeId) ?? null
        const rawRunShot = run["shotId"]
        const runShot = rawRunShot === null || rawRunShot === undefined ? null : str(rawRunShot)
        if (nodeShot !== runShot) {
          err(f, `runs[${i}].shotId`, "RUN_SHOT_MISMATCH", `run.shotId "${runShot ?? "null"}" does not match its node's shotId "${nodeShot ?? "null"}"`)
        }
      }

      // run.result.artifactId → real artifact (only for completed runs with a result).
      const status = str(run["status"])
      const result = isObject(run["result"]) ? run["result"] : undefined
      if (status === COMPLETED_RUN_STATUS) {
        if (!result) {
          err(f, `runs[${i}].result`, "MISSING_RUN_RESULT", "completed run has no result")
        } else {
          const artifactId = str(result["artifactId"])
          if (!artifactId) {
            err(f, `runs[${i}].result.artifactId`, "MISSING_ARTIFACT_ID", "completed run result missing artifactId")
          } else {
            artifactIdsReferencedByRuns.add(artifactId)
            if (!input.knownArtifactIds.has(artifactId)) {
              err(f, `runs[${i}].result.artifactId`, "DANGLING_ARTIFACT_REF", `run.result.artifactId "${artifactId}" does not resolve to a known artifact`)
            }
            const runShot = str(run["shotId"])
            if (runShot) shotsWithCompletedArtifact.add(runShot)
          }
        }
      }
    })
  }

  // ── Association completeness: a "generated"/"approved" shot must have media ──
  // Build node-by-shot index across all workflows.
  const nodeShotIdsAll = new Set<string>()
  for (const map of nodeShotIdByEpisode.values()) {
    for (const shotId of map.values()) {
      if (shotId) nodeShotIdsAll.add(shotId)
    }
  }
  for (const ep of input.episodes) {
    const e = ep.data
    if (!isObject(e)) continue
    const f = ep.file
    asArray(e["shots"]).forEach((shot, i) => {
      const status = str(shot["status"])
      if (!GENERATED_SHOT_STATUSES.has(status)) return
      const shotId = str(shot["id"])
      if (!shotId) return
      if (!nodeShotIdsAll.has(shotId)) {
        err(f, `shots[${i}]`, "MISSING_WORKFLOW_NODE", `shot "${shotId}" is ${status} but has no workflow node`)
      }
      if (!shotsWithCompletedArtifact.has(shotId)) {
        err(f, `shots[${i}]`, "MISSING_COMPLETED_RUN", `shot "${shotId}" is ${status} but has no completed run with a result artifact`)
      }
    })
  }

  // ── Orphan artifacts (warning) ──────────────────────────────────────────────
  // An artifact stamped with a shotId/nodeId in its metadata but referenced by
  // NO run is an orphan: media was generated and associated with the story, but
  // the run log never recorded it, so the timeline can't link it. Soft issue.
  for (const stamped of input.stampedArtifacts ?? []) {
    if (artifactIdsReferencedByRuns.has(stamped.artifactId)) continue
    const stampDesc =
      stamped.shotId != null
        ? `shot "${stamped.shotId}"`
        : stamped.nodeId != null
          ? `node "${stamped.nodeId}"`
          : "a shot/node"
    warn(
      "",
      `artifacts[${stamped.artifactId}]`,
      "ORPHAN_ARTIFACT",
      `artifact "${stamped.artifactId}" is stamped with ${stampDesc} but is not referenced by any run`,
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}
