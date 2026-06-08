# ADR 0004: Story State as Schema JSON Files in Project Directory

**Status:** Accepted
**Date:** 2026-06-08

## Context

openimago projects need structured story management for creative workflows (animation, film, game cinematics). The story domain involves:

- **Bible** (world settings, characters, scenes, style seeds)
- **Series** (episode index, overall status)
- **Episodes** (scripts with shot-by-shot storyboard descriptions)
- **Workflows** (generation DAGs: which shots depend on which character/scene designs)
- **Runs** (execution history: what was generated, with what parameters, and what artifacts resulted)

The question is: where should this state live?

Options considered:
1. Database tables (`story_bibles`, `story_episodes`, etc.)
2. A bd-like creative issue tracker
3. Schema JSON files in the project filesystem directory

Key constraints:

- AI agents (OpenCode) need direct filesystem access to read and modify story state.
- Story state should be version-controllable (git or other VCS).
- The project directory already exists at `/mnt/cos/{projectId}/` and is the AI agent's working directory.
- The database already stores `projects` metadata and `workspaceGeneratedFiles`, but duplicating full story content would create sync issues.

## Decision

**Story state is stored as schema JSON files in the project directory.** The filesystem is the canonical source of truth. The database stores only project metadata and artifact references.

### File layout

```
/mnt/cos/{projectId}/
  AGENTS.md                          # AI navigation guide
  openimago.json                     # Machine manifest
  story/
    bible.json                       # Global canon (characters, scenes, world, style)
    series.json                      # Series/episode index
    episodes/
      ep_001.json                    # Episode 1: script + storyboard
      ep_002.json                    # Episode 2
      ...
    workflow/
      ep_001.workflow.json           # Episode 1 generation DAG
      ep_002.workflow.json
      ...
    runs/
      ep_001.runs.json               # Episode 1 run history
      ep_002.runs.json
      ...
```

### Schema definitions

#### `openimago.json` — Machine manifest

```typescript
interface OpenImagoManifest {
  schemaVersion: 1
  projectId: string
  createdAt: string  // ISO 8601
  storyPath: string  // relative: "story/"
  outputsPath: string // relative: "outputs/"
}
```

#### `story/bible.json` — Global canon

```typescript
interface StoryBible {
  schemaVersion: 1
  projectId: string
  world: {
    name: string
    description: string
    era?: string
    moodKeywords: string[]
    visualStyleNotes: string
  }
  characters: BibleCharacter[]
  scenes: BibleScene[]
  styleSeeds: StyleSeed[]
  updatedAt: string
}

interface BibleCharacter {
  id: string                // stable slug, e.g. "kai-the-runner"
  displayName: string
  role: 'protagonist' | 'antagonist' | 'supporting' | 'extra'
  description: string
  visualNotes: string
  referenceArtifactIds: string[]  // workspace file IDs of concept art
  tags: string[]
}

interface BibleScene {
  id: string                // stable slug, e.g. "neon-alley"
  displayName: string
  type: 'interior' | 'exterior' | 'abstract'
  description: string
  mood: string
  lighting: string
  referenceArtifactIds: string[]
  tags: string[]
}

interface StyleSeed {
  id: string
  displayName: string
  description: string
  visualStyle: string       // e.g. "cyberpunk-noir", "ghibli-watercolor"
  colorPalette: string[]
  referenceArtifactIds: string[]
}
```

#### `story/series.json` — Series index

```typescript
interface StorySeries {
  schemaVersion: 1
  projectId: string
  title: string
  description: string
  status: 'planning' | 'in_progress' | 'completed'
  episodes: SeriesEpisodeEntry[]
  updatedAt: string
}

interface SeriesEpisodeEntry {
  episodeNumber: number     // 1-based
  id: string                // "ep_001"
  title: string
  status: 'draft' | 'storyboard' | 'generating' | 'review' | 'done'
  shotCount: number
  durationEstimate?: number // seconds
  updatedAt: string
}
```

#### `story/episodes/ep_NNN.json` — Episode script

```typescript
interface StoryEpisode {
  schemaVersion: 1
  id: string                // "ep_001"
  episodeNumber: number
  title: string
  logline: string           // one-sentence summary
  synopsis: string          // paragraph summary
  status: 'draft' | 'storyboard' | 'generating' | 'review' | 'done'
  shots: EpisodeShot[]
  updatedAt: string
}

interface EpisodeShot {
  id: string                // stable slug within episode, e.g. "s01-opening"
  shotNumber: number        // 1-based ordering
  sceneId: string           // refs BibleScene.id
  description: string       // shot description / director's notes
  durationEstimate?: number // seconds
  cameraNotes?: string      // angle, movement, framing
  lightingNotes?: string
  dialog?: ShotDialog[]
  characterIds: string[]    // refs BibleCharacter.id
  referenceArtifactIds: string[]
  status: 'pending' | 'in_progress' | 'generated' | 'review' | 'approved'
}

interface ShotDialog {
  characterId: string       // refs BibleCharacter.id
  text: string
  emotion?: string
}
```

#### `story/workflow/ep_NNN.workflow.json` — Generation DAG

```typescript
interface EpisodeWorkflow {
  schemaVersion: 1
  episodeId: string         // "ep_001"
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]     // defines dependencies
}

interface WorkflowNode {
  id: string                // unique within workflow
  shotId: string            // refs EpisodeShot.id
  toolKind: 'image_generate' | 'video_generate' | 'image_edit' | string
  label: string
  params: WorkflowNodeParams
  dependsOn: string[]       // node IDs this node waits for
}

interface WorkflowNodeParams {
  promptTemplate: string    // supports {{character.name}}, {{scene.description}} interpolation
  negativePromptTemplate?: string
  model?: string
  aspectRatio?: string
  duration?: number
  seed?: number
  referenceArtifactIds?: string[]
  extra?: Record<string, unknown>
}

interface WorkflowEdge {
  from: string              // node ID
  to: string                // node ID
  relation: 'depends_on' | 'style_ref' | 'character_ref'
}
```

#### `story/runs/ep_NNN.runs.json` — Run history

```typescript
interface EpisodeRuns {
  schemaVersion: 1
  episodeId: string         // "ep_001"
  runs: GenerationRun[]
}

interface GenerationRun {
  id: string                // unique run ID
  nodeId: string            // refs WorkflowNode.id
  shotId: string            // refs EpisodeShot.id
  status: 'queued' | 'running' | 'completed' | 'failed'
  
  /** Parameters used for this run (resolved from template) */
  params: ResolvedRunParams
  
  /** Result artifact references */
  result?: RunResult
  
  error?: string
  startedAt: string
  completedAt?: string
}

interface ResolvedRunParams {
  prompt: string
  negativePrompt?: string
  model: string
  aspectRatio?: string
  duration?: number
  seed?: number
  referenceArtifactIds: string[]
  extra?: Record<string, unknown>
}

interface RunResult {
  artifactId: string        // workspaceFileId or project file id
  kind: 'image' | 'video' | 'audio'
  mime: string
  filename: string
  access?: {
    preview: string
    thumbnail?: string
  }
}
```

### Stability and versioning

- Every JSON file has a `schemaVersion` field. Increment on breaking changes.
- The `id` fields across all files use stable slugs (not auto-increment integers). This ensures references survive reordering and insertion.
- Timestamps use ISO 8601 strings.
- Backend APIs read/write these JSON files directly. No database tables duplicate the content.
- Migration between schema versions is handled by the backend when the file is opened (read → migrate in memory → write back with new version).

### Why not a database?

- AI agents need filesystem access to read/write story state during tool calls. A database would require a dedicated API layer for every read/write.
- JSON files are trivially version-controllable (git) for users who want history.
- The story domain is document-oriented, not relational. A single episode JSON is self-contained.
- Avoids sync issues: the filesystem IS the database. No "state in DB doesn't match state on disk" bugs.

### Why not a bd-like issue tracker?

- bd is designed for software issue tracking (status transitions, assignees, sprints). Story workflow is about creative content (scripts, visual descriptions, generation DAGs).
- A custom JSON schema with stable IDs, status, dependencies, and artifact refs is simpler and more domain-appropriate than adapting an issue tracker.
- Can be introduced later if creative project management needs evolve toward issue-tracking patterns.

## Consequences

### Positive

- Simple: filesystem is the only source of truth. No sync logic.
- AI-friendly: OpenCode tools can directly read/write JSON files.
- Version-controllable: git or any VCS works naturally.
- Self-documenting: the schema is visible in the type definitions and example files.
- Extensible: new fields can be added to JSON schemas without database migrations.

### Negative

- No transactional integrity across files (e.g., updating bible.json and series.json atomically). Acceptable because writes are sequential and idempotent.
- Concurrent writes from multiple agents could conflict. Mitigation: single-writer model (one active agent per project at a time).
- File I/O is slower than database queries for large run histories. For episodes with thousands of runs, consider pagination or a separate runs DB table in the future. Current scope: <100 runs per episode is fine as a single JSON file.

### Neutral

- Requires backend endpoints to read/write these files for the frontend (the frontend does not access the filesystem directly).
- The `runs` file may grow large over time. Future iteration may shard by date or move hot runs to DB.

## Alternatives Considered

### Database tables for story state

- **Rejected** because AI agents need filesystem access, and dual-write (DB + filesystem) creates consistency problems.
- Would require a sync layer between DB and filesystem — added complexity without clear benefit for this domain.

### Single monolithic story.json

- **Rejected** because loading a single huge JSON for a multi-episode project is wasteful.
- Separating bible/series/episodes/workflow/runs allows targeted reads and writes.

### YAML or TOML instead of JSON

- **Rejected** because JSON is universally parseable by all tooling (TypeScript, OpenCode tools, any language).
- JSON Schema validation is well-supported.
- No meaningful readability advantage for machine-written files.

### bd-like creative issue tracker

- **Rejected** for initial scope. The schema JSON approach is simpler and domain-appropriate.
- Can be reconsidered if creative workflow complexity grows beyond what JSON files reasonably handle.

## References

- `docs/adr/0003-hybrid-artifact-panel-rerun-ux.md` — WorkspaceArtifactsPanel and rerun UX
- `docs/prd/workspace-artifacts-and-story-workflow.md` — Overall PRD
- `docs/story-schema/` — JSON schema examples
- `packages/openimago/src/project/service.ts` — Project creation (scaffolding entry point)
- `packages/openimago/src/db/schema.ts` — `workspaceGeneratedFiles` table for artifact references
