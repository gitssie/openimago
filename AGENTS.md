# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
```

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

## CodeGraph — Semantic Code Search

This project has **CodeGraph** indexing enabled (115 files indexed). The LLM (yourself) **MUST** use these tools for ALL code exploration instead of falling back to grep/read/glob:

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `codegraph_context(task)` | **Primary entry point** — describes task in natural language, returns relevant symbols + code + call graph | FIRST call for any "how does X work", architecture, feature, or bug |
| `codegraph_search(query, kind)` | Quick symbol lookup by name | Find a function/class/component by name |
| `codegraph_node(symbol)` | Detailed info on one symbol (signature, doc, source) | Deep-dive into a specific symbol |
| `codegraph_explore(query)` | Source of multiple related symbols in one call | After context(), when you need actual code of several symbols |
| `codegraph_callers(symbol)` | Find who calls this symbol | Impact analysis, understanding usage |
| `codegraph_callees(symbol)` | Find what this symbol calls | Dependency analysis |
| `codegraph_impact(symbol, depth)` | Analyze change impact radius | Before modifying code |
| `codegraph_files(path)` | Get project file tree (faster than Glob) | Project structure exploration |
| `codegraph_status()` | Index statistics | Check what's indexed |

### Workflow

```
codegraph_context("描述任务/问题")   // 1 次调用获取全景
  → 如需深挖: codegraph_node() / codegraph_explore()
  → 如需改代码: codegraph_impact() 看影响范围
```

**FORBIDDEN:** Starting code exploration with grep/read/glob when codegraph tools can answer the question faster.

## Quality Gates

- Use `bun run typecheck` from the repository root for TypeScript/Vue type checking.
- The root `typecheck` script delegates to `bun turbo typecheck`, so each workspace package should expose its own `typecheck` script.
- Current package commands: backend uses `tsc --noEmit`; web uses `vue-tsc --noEmit`.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
