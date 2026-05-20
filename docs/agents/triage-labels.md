# Triage Labels

Triage roles are mapped to Beads statuses.

| Triage role | Beads status | Icon | Meaning |
|---|---|---|---|
| `needs-triage` | `open` | `○` | New issue, not yet evaluated by maintainer |
| `needs-info` | `blocked` | `●` | Waiting on reporter for more information; cannot proceed |
| `ready-for-agent` | `open` | `○` | Fully specified, ready for an AFK agent to claim |
| `ready-for-human` | `open` | `○` | Specified but requires human implementation |
| `wontfix` | `deferred` | `❄` | Will not be actioned |

## Distinguishing ready-for-agent from needs-triage

Both use `open` status. Use bead labels to disambiguate:
- `needs-triage`: no label, or label `triage:pending`
- `ready-for-agent`: label `ready-for-agent`
- `ready-for-human`: label `ready-for-human`

```bash
# Create a ready-for-agent bead
bd create "Add login form" --label ready-for-agent

# Mark as needs-triage (remove label)
bd update <id> --label ""
```

## When creating from to-prd

After publishing a PRD bead, mark it `ready-for-agent` if it's fully specified and ready for AFK implementation.
