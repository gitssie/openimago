# Issue tracker: Beads

Issues and PRDs for this repo live in Beads, a Dolt-backed graph issue tracker. Data stored in `.beads/` directory.

## Conventions

- Issues are beads, managed via `bd` CLI
- Each bead has: id, title, status, priority, dependencies, labels, description
- Bead statuses: `○` open, `◐` in_progress, `●` blocked, `✓` closed, `❄` deferred
- Triage state is represented via bead status (see `triage-labels.md` for mapping)
- Dependencies between beads form a graph via `--deps` flag
- Use `bd dolt push` to sync with remote (if Dolt remote configured)

## When a skill says "publish to the issue tracker"

```bash
bd create "<title>" -t <type> -p <priority> --json
```

Types: `bug`, `feature`, `task`, `epic`.

## When a skill says "fetch the relevant ticket"

```bash
bd show <id> --long --json
```

## Task management workflow

```bash
bd ready --json                                            # Find unblocked work
bd show <id> --json                                        # Get full context
bd update <id> --claim --json                              # Claim and start
bd close <id> --reason "Completed: <summary>" --json       # Complete
```

## After compaction recovery

```bash
bd list --status in_progress --json   # Find active work
bd show <id> --long --json            # Recover full context
```

## Adding notes mid-task (critical for compaction survival)

```bash
bd update <id> --note "Current progress: <details>" --json
```
