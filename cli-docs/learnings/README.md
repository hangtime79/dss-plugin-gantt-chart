# Learnings Index

This folder previously contained raw learnings from development. These have been **integrated into the main documentation** for better discoverability.

## Where Learnings Live Now

| Topic | Integrated Into |
|-------|-----------------|
| **Dataiku Plugin General** | [guides/webapps.md](../guides/webapps.md) → "Gotchas & Common Issues" |
| **Dataiku Charts** | [guides/webapps.md](../guides/webapps.md) → "Chart-Specific Configuration" |
| **Frappe Gantt** | [reference/frappe-gantt.md](../reference/frappe-gantt.md) → Full document |
| **General Coding** | [guides/best-practices.md](../guides/best-practices.md) → "JavaScript & Frontend", "Development Workflow" |
| **Repo-Specific** | [CLAUDE.md](../../CLAUDE.md) → "Discovered Gotchas" |

## Adding New Learnings

Use the staging file: `plan/cli-docs-template-update.md`

1. Add learning using the exemplary format
2. Validate in development
3. Integrate into appropriate cli-docs file
4. Mark as integrated in the staging file

## Progressive Disclosure Structure

```
QUICK_START.md          ← Get started fast
guides/                 ← How to do X (includes gotchas sections)
reference/              ← Full API details (includes common issues)
CLAUDE.md               ← Project-specific institutional memory
```

Learnings are now embedded in context rather than isolated.
