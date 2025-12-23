# Gantt Chart Plugin

Dataiku DSS plugin: interactive Gantt visualization using frappe-gantt. Python validates/transforms data, JS renders SVG.

## Data Flow
```
DSS Dataset → backend.py → TaskTransformer → dependency_validator → JSON → app.js → frappe-gantt
```

## Critical Files

| File | Role | Gotcha |
|------|------|--------|
| `python-lib/ganttchart/task_transformer.py` | DataFrame → task list | Auto-generates missing IDs, clamps progress 0-100 |
| `python-lib/ganttchart/dependency_validator.py` | DFS cycle detection | MUST run before render or UI infinite-loops |
| `python-lib/ganttchart/date_parser.py` | Multi-format → ISO | Handles Unix timestamps, validates start < end |
| `webapps/gantt-chart/backend.py` | DSS bridge | Zero business logic here |
| `webapps/gantt-chart/app.js` | Gantt init + UI | View modes, tooltips, label formatting |
| `resource/webapp/style.css` | Custom CSS | Override library with `!important` |

## Hard Rules

1. **All validation in Python** — JS is display-only
2. **Never mutate inputs** — Transform functions return new objects
3. **Skip bad rows, don't crash** — Log warning, continue
4. **python-lib/ has no dataiku imports** — Must be unit-testable standalone
5. **frappe-gantt bundled in resource/** — Air-gap requirement, no CDN

## Discovered Gotchas

<!-- Add here as you hit issues — this is institutional memory -->
- Dataiku loads from COMMITTED code, not working directory — must commit before User QA
- Progress values from external data can be >100 or <0 — always clamp
- Circular dependencies will infinite-loop frappe-gantt — cycle detection is mandatory
- Nested scroll containers break sticky — override `.gantt-container { overflow-y: visible }`
- Frappe CSS variables (`--gv-column-width`, `--gv-grid-height`) — don't set manually
- View mode names are case-sensitive — "Week" not "week"
- Monkey-patching must happen BEFORE `new Gantt()` — store original, then patch
- Post-render DOM manipulation needs `requestAnimationFrame` — DOM not ready immediately
- Labels recreated on view change — must reapply formatting in `on_view_change`
- **ganttInstance.options vs .config** — `options` = primitives (strings, numbers), `config` = computed objects. Use `options.view_mode` for string, NOT `config.view_mode`
- **Month view DOM structure** — `.upper-text` = years, `.lower-text` = months (counterintuitive)
- **Frappe Gantt no destroy()** — Event listeners persist after DOM cleared. Guard against undefined when accessing potentially stale DOM refs
- **frappe-gantt.umd.js is loaded** — NOT .es.js. Patch the UMD file for browser fixes
- **SVG width 100% breaks rendering** — Library sets `width: "100%"` then conditionally overrides. Patched `set_dimensions()` to always set pixel width
- **Library bugs tracked separately** — See `plan/frappe-gantt-upstream-bugs.md` for bugs to report upstream

---

## Recovering From Compact

If you're reading this after a context compaction:

1. **Check for active intervention:**
   ```bash
   ls plan/interventions/
   ```

2. **If intervention exists** — Read it for:
   - What features are being implemented
   - What's completed vs pending (checkbox TODOs)
   - Files modified and why
   - Resume from the TODO list

3. **If no intervention exists** — Check:
   - `git status` for modified files
   - `git log --oneline -5` for recent commits
   - `git branch` for current branch
   - Read spec if branch follows naming convention

### When to Create an Intervention

Create `plan/interventions/vX.Y.Z-intervention.md` when:
- Context window is >50% used
- Work is complex or multi-session
- Multiple features being implemented

Simple fixes with plenty of context don't need intervention tracking.

---

## Branch Workflow

| Phase | Protocol | Role |
|-------|----------|------|
| **Open** | `cli-docs/cli-protocols/branch-open-protocol.md` | Architect: investigate, create spec |
| **Implement** | Use intervention file | SDE: implement spec, update intervention |
| **Exit** | `cli-docs/cli-protocols/branch-exit-protocol.md` | Generate release notes, changelog |
| **Post-Merge** | `cli-docs/cli-protocols/branch-post-merge-protocol.md` | Create GitHub release, cleanup |

**Current Phase:** Check `plan/interventions/` for active work

---

## Documentation (Read When Needed)

**Don't load upfront. Read when you hit that domain.**

### Plugin Development
| Need to understand... | Read |
|-----------------------|------|
| Webapp structure, backend.py | `cli-docs/guides/webapps.md` |
| Parameter types, webapp.json | `cli-docs/reference/parameters.md` |
| Dataset API | `cli-docs/reference/dataset-api-quick.md` |
| Generic plugin patterns | `cli-docs/guides/plugin-overview.md` |

### Gantt-Specific
| Need to understand... | Read |
|-----------------------|------|
| frappe-gantt API, events | `cli-docs/reference/frappe-gantt.md` |
| Color mapping | `python-lib/ganttchart/color_mapper.py` |
| Previous decisions | `plan/post-mortems/` (most recent first) |
| Current work | `plan/interventions/` |
| Feature designs | `plan/specs/` |

---

## Session State

**Phase:** ACTIVE - SDE Implementation (QA Round 5 pending)

**Current Branch:** `feature/v0.4.2-debounce-and-sticky-header`
**Intervention:** `plan/interventions/v0.4.2-intervention.md` ← READ THIS FIRST

**v0.4.2 Work In Progress:**
- Issues: #15 (debouncing), #11 (sticky header)
- 4 attempts completed, all partially failed
- Awaiting user console test to verify hypothesis
- Next: Implement config hash comparison if hypothesis confirmed

**CRITICAL FOR NEW SDE:**
1. Read `plan/interventions/v0.4.2-intervention.md` for full context
2. Check if user has console test results
3. If "Changed: false" messages seen → implement Attempt 5 (config hash)
4. If no duplicate messages → investigate other re-render sources

**Latest Release:** v0.4.1 (2025-12-22)
**Release URL:** https://github.com/hangtime79/dss-plugin-gantt-chart/releases/tag/v0.4.1

**Backlog:** [GitHub Issues](https://github.com/hangtime79/dss-plugin-gantt-chart/issues)
**Upstream Bugs:** `plan/frappe-gantt-upstream-bugs.md`
