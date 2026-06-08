# ADR 0003: Hybrid WorkspaceArtifactsPanel and Artifact-First Rerun UX

**Status:** Accepted
**Date:** 2026-06-08

## Context

openimago currently has two separate right-panel result surfaces:

- **`SessionWorkspaceResultsPanel`** on `SessionWorkspacePage` — displays image-only generated results derived from assistant `ToolPart` message parts. Tightly coupled to message stream parsing.
- **`ProjectWorkspaceGrid` outputs section** on `ProjectWorkspacePage` — displays project-scoped `OutputItem[]` from a dedicated API. Contains placeholder `storyElements` for future story features.

These two surfaces serve the same conceptual purpose — showing generated artifacts — but share zero code and have diverging data models.

Additionally, there is no rerun/regeneration UX. Users cannot click an artifact, tweak parameters, and regenerate. If they want to try different parameters, they must compose a new message in the chat, losing context from the original generation.

Key constraints:

- The codebase already has a well-defined `MediaToolOutputV1` protocol (ADR 0002) and `workspaceGeneratedFiles` table.
- Session workspace files are registered via `WorkspaceFilesService.registerFile` and served via `/api/platform/sessions/:id/workspace-files`.
- Project outputs are served via dedicated APIs (`api.projectOutputs`, `api.projectFiles`) that scan the project directory.
- The existing `SessionWorkspaceResultsPanel` style and Quasar/Vue conventions must be preserved during migration.

## Decision

### 1. Single shared WorkspaceArtifactsPanel component

Create one `WorkspaceArtifactsPanel` component used by both session and project workspaces. The component does not own data fetching — pages pass in artifacts as props. The component handles rendering (grid, detail, preview) and emits `edit-params` / `rerun` / `select` events for page-level wiring.

```typescript
// Artifact shape — unified across session and project scopes
interface WorkspaceArtifact {
  /** Stable identity. maps to workspaceFileId or project file id */
  id: string
  kind: 'image' | 'video' | 'audio'
  
  /** Access locators (opaque, from ADR 0002 protocol) */
  access: {
    preview: MediaAccessLocator
    download?: MediaAccessLocator
    thumbnail?: MediaAccessLocator
    poster?: MediaAccessLocator
  }
  
  filename?: string
  prompt?: string
  provider?: string
  model?: string
  width?: number
  height?: number
  duration?: number
  seed?: number
  
  /** Generation parameters the panel can surface for editing */
  params?: ArtifactParams
  
  timeLabel: string
}

interface ArtifactParams {
  prompt?: string
  negativePrompt?: string
  model?: string
  aspectRatio?: string
  duration?: number
  seed?: number
  referenceArtifactIds?: string[]
  /** Escape hatch for tool-specific params */
  extra?: Record<string, unknown>
}
```

**Scope behavior:**

| Page | Scope | Data source | Prop name |
|------|-------|-------------|-----------|
| `SessionWorkspacePage` | session | `sessionWorkspaceFiles` API → `WorkspaceArtifact[]` | `artifacts` |
| `ProjectWorkspacePage` | project | `projectOutputs` + `projectFiles` API → `WorkspaceArtifact[]` | `artifacts` |

**Component events:**

| Event | Payload | Purpose |
|-------|---------|---------|
| `select` | `artifactId: string` | Artifact selected for detail view |
| `edit-params` | `artifactId: string` | User wants to edit generation params |
| `rerun` | `{ artifactId: string, params: ArtifactParams }` | User submits edited params for regeneration |
| `delete` | `artifactId: string` | User requests artifact deletion |

### 2. Artifact-first rerun UX

When a user clicks an artifact and edits parameters, rerun creates a **new run + new artifact** instead of mutating the existing output.

**Rationale:**

- **Immutability**: Historical outputs are never overwritten. Users can always go back.
- **Traceability**: Every artifact links to its generation run. Every run records its full parameters.
- **Comparison**: Users can compare multiple outputs from different parameter sets side by side.
- **Safety**: A failed rerun does not destroy a successful previous output.

**Flow:**

```
User selects artifact
  → Panel shows detail + parameter editor
  → User edits prompt / params
  → Clicks "Rerun"
  → Page creates new generation run (backend: new tool call or API call)
  → On completion: new artifact registered → appended to panel
  → Old artifact remains unchanged and visible
```

**For session scope (chat context):** rerun sends a new user message to the agent with the artifact's parameters as context, or calls a dedicated rerun API that triggers a new tool call within the active session.

**For project scope (story workflow):** rerun executes a workflow node against the project's story JSON state, writing results to the runs file and registering the output artifact.

### 3. Parameter editor MVP

The parameter editor is a prompt-first form rendered inside the artifact detail view. It is **not** a standalone page — it appears inline when the user clicks "Edit Parameters" on an artifact.

**Field priority:**

1. **prompt** (required, textarea) — the primary generation prompt
2. **negativePrompt** (optional, textarea) — negative prompt
3. **model** (optional, select) — populated from available models list
4. **aspectRatio** (optional, select) — common ratios: 1:1, 16:9, 9:16, 4:3, 3:2
5. **duration** (optional, number) — for video/audio only
6. **seed** (optional, number) — random seed for reproducibility
7. **referenceArtifacts** (optional, multi-select) — select existing artifacts as style/image reference
8. **advanced (JSON editor)** — collapsible JSON editor as escape hatch for tool-specific params

**Design rules:**

- The prompt field is visually prominent (larger textarea, first in tab order).
- Common fields are structured form inputs with appropriate validation.
- The JSON editor is collapsed by default and marked "Advanced".
- When a tool-specific schema is implemented later, its fields render as structured inputs **above** the JSON fallback. The JSON editor only shows fields not covered by structured inputs.
- Form state is local to the panel instance; closing the editor discards unsaved changes.

### 4. Migration path from existing panels

1. Create `WorkspaceArtifactsPanel` with the full prop/emit contract.
2. Wire it into `SessionWorkspacePage` **alongside** the existing `SessionWorkspaceResultsPanel`, gated by a feature flag or a computed `useWorkspaceArtifactsPanel` toggle.
3. Validate artifact rendering parity (image display, time labels, prompt preview).
4. Add video/audio rendering (currently not handled by `SessionWorkspaceResultsPanel`).
5. Once stable, remove `SessionWorkspaceResultsPanel` and switch `SessionWorkspacePage` to use only `WorkspaceArtifactsPanel`.
6. Wire `ProjectWorkspacePage` to use `WorkspaceArtifactsPanel` for outputs, replacing the inline output grid in `ProjectWorkspaceGrid`.

## Consequences

### Positive

- Single component for artifact display eliminates duplicated rendering, styling, and edge-case handling.
- Session and project workspaces share the same artifact model, simplifying cross-scope features (e.g., "promote session artifact to project").
- Artifact-first rerun gives users a natural regeneration loop without leaving the visual context.
- Immutable artifact history enables comparison and rollback.
- Parameter editor MVP with JSON fallback balances simplicity and power — beginners use the form, advanced users use JSON.

### Negative

- Adds an abstraction layer over two different data sources (session workspace files vs project outputs). Adapter logic required.
- `WorkspaceArtifactsPanel` must handle loading/empty/error states for both scopes.
- Artifact `params` field may not be populated for legacy artifacts generated before this ADR. Panel must handle missing params gracefully.

### Neutral

- `SessionWorkspaceResultsPanel` is deprecated but not immediately removed. Migration is incremental.
- The parameter editor is a new UI surface not present in the current codebase.

## Alternatives Considered

### Keep separate panels per page

- **Rejected** because it perpetuates code duplication and diverging feature sets.
- The two pages already have nearly identical artifact display needs.

### Mutation-based rerun (overwrite artifact)

- **Rejected** because it destroys history and prevents comparison.
- Users working on creative projects frequently want to compare variations.

### Full tool-specific schema from day one

- **Rejected** because it increases MVP scope significantly.
- The JSON editor fallback covers all tool-specific needs until schemas are fully designed.
- Prompt + common fields cover 80%+ of regeneration use cases.

### Standalone parameter editor page

- **Rejected** because it breaks the visual context. Users should see the artifact they're editing parameters for.

## References

- `docs/adr/0002-media-toolcall-workspace-files.md` — Media ToolCall output protocol and WorkspaceFileRecord shape
- `docs/adr/0004-story-state-json-schema.md` — Story state JSON schema for project workflow
- `packages/web/src/components/session-workspace/SessionWorkspaceResultsPanel.vue` — Current session result panel to supersede
- `packages/web/src/components/session-workspace/ProjectWorkspaceGrid.vue` — Current project grid outputs
- `packages/web/src/pages/SessionWorkspacePage.vue` — Session workspace page host
- `packages/web/src/pages/ProjectWorkspacePage.vue` — Project workspace page host
- `packages/openimago/src/workspace-files/service.ts` — Backend workspace file registration
- `packages/openimago/src/db/schema.ts` — `workspaceGeneratedFiles` table
