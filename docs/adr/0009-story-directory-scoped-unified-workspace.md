# ADR 0009: Story is Directory-Scoped; Workspace Pages Unified

**Status:** Accepted
**Date:** 2026-06-30
**Refines:** ADR 0004 (story stays JSON-in-directory; only the *resolution key* changes)

## Context

`SessionWorkspacePage.vue` and `ProjectWorkspacePage.vue` looked like siblings but
diverged: the project page wires the `故事板 / 时间线 / 概览` tabs to real Story
panels, while the session page's `onWorkspaceTabChange` is a no-op — three dead
tabs. The apparent reason was that Story was treated as "the state of a **Project**"
and the story API is keyed by `projectId`, while a standalone session has
`projectId = null`.

But at the storage layer there is only one entity: a **directory**. Both a
standalone session (`/work/{workspaceId}`) and a project (`/mnt/cos/{projectId}`)
are just `mkdir`-ed folders written to the same `workspace.directory` field, served
by the same code. Story files (`story/bible.json`, etc.) already live *inside the
directory*; `StoryService.resolveProjectDir(projectId, userId)` uses `projectId`
**only** to look up `projects.directory` + check ownership, then every method
operates on `dir`. A parallel resolver already exists for sessions
(`workdir/resolver.ts: resolveDirectory(sessionId, workspaceId)`).

## Decision

**Story is scoped to a Workspace directory, not to a Project.** `projectId` /
`sessionId` are merely keys to resolve the directory + ownership; persistence stays
JSON-in-directory (ADR 0004 unchanged). The two workspace pages collapse into **one
folder-driven Workspace page**, parameterized by `projectId?` / `sessionId?`; the
Story tabs render whenever the resolved directory has Story files.

## Considered Options

1. **Keep two pages, delete the 3 dead session tabs.** Cheapest, but permanently
   forks two near-identical pages and denies a session any Story.
2. **Copy the project page's Story wiring into the session page.** Two ~1800-line
   pages to keep in sync forever.
3. **(Chosen) Re-key Story by directory + merge the two pages into one.** Honors the
   "a folder is the only entity" model; one page to maintain.

## Consequences

- Backend: small. Generalize `resolveProjectDir` into a resolver that accepts a
  project **or** a session key and returns `{ directory, ownership }`; story method
  bodies are untouched. Expose Story routes reachable from a session.
- Frontend: the merge **uses `ProjectWorkspacePage.vue` as the base** (it has the
  fuller feature set); `SessionWorkspacePage` becomes its no-project degenerate
  case, NOT the reverse.
- `StoryBible.projectId` and similar embedded fields become a directory/workspace
  reference; treat as a soft rename.
- Supersedes the premise (not the storage model) of ADR 0004 that Story belongs to
  a Project.
