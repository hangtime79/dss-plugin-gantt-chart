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
- **Dataiku config messaging** — Dataiku does NOT send periodic config heartbeats; only real user changes trigger messages. "Keep alive" pings every 10s don't include config.
- **Sticky header narrow content** — JS transform-based sticky works when content fills viewport but is janky when SVG narrower than container (browser paint/composite issue). See #21.
- **on_view_change mode parameter** — The `mode` passed to frappe-gantt's `on_view_change` callback is an object `{name, padding, step, ...}`, not a string. Use `mode.name` to get the view mode string.
- **Dataiku iframe context** — The webapp runs in an iframe. DOM queries from parent console return empty. Debug logging must be in app.js code, not browser console.
- **Frappe Gantt custom_class whitespace** — `custom_class` must be a single class name without spaces. Frappe uses `classList.add()` which throws DOMException on whitespace.
- **SVG transform centering** — Use `transform-box: fill-box` when scaling SVG elements. Default `transform-origin` is relative to viewport, not element bounding box.
- **Dataiku body.html is a fragment** — Never add `<!DOCTYPE html>` to body.html. It's injected into Dataiku's iframe wrapper, not a standalone document. DOCTYPE triggers Quirks Mode warning.
- **Frappe Gantt `.big` label class** — When task names don't fit inside bars, library positions them outside and adds `.big` class. Our white text CSS made these invisible on white background. External labels need dark text override.
- **Frappe Gantt task properties become CSS classes** — Library creates `.highlight-{id}` selectors. Task IDs with periods (e.g., `54.8`) create invalid CSS (`.highlight-54.8`). Use hex-encoding for CSS-unsafe chars.
- **Frappe Gantt Month view diff() bug** — Library's `diff()` function used `o%30/30` for fractional month, which is meaningless. Patched to `(n.getDate()-1)/30` for proper day-of-month position.
- **DOM data-id location** — `data-id` attribute is on `.bar-wrapper`, not `.bar-group`. Use `wrapper.getAttribute('data-id')` directly, not `.closest('.bar-group')`.

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

**Phase:** Branch Exit - v0.7.0 ready for merge

**Current Branch:** `feature/v0.7.0-expected-progress-and-polish`
**Intervention File:** `plan/interventions/v0.7.0-intervention.md`

**Latest Release:** v0.6.1 (2025-12-26)
**Release URL:** https://github.com/hangtime79/dss-plugin-gantt-chart/releases/tag/v0.6.1

**Backlog:** [GitHub Issues](https://github.com/hangtime79/dss-plugin-gantt-chart/issues)
**Upstream Bugs:** `plan/frappe-gantt-upstream-bugs.md`

---

## Roadmap to v1.0.0

| Milestone | Issues | Theme |
|-----------|--------|-------|
| **v0.7.0** | #33, #45, #43, #42, #38, #37 | Analytics + Polish: Expected progress indicator, quick wins |
| **v0.7.1** | #21 | Sticky Header: Dedicated fix for narrow content jank |
| **v0.8.0** | #31, #34, #47 | Theming: Dark mode, grid lines, pill box labels |
| **v0.9.0** | #32, #35, #12, #14, #41 | i18n + Headers: Language, date formats, header improvements |
| **v0.10.0** | #24, #25, #36, #44 | Export + UX: Print, global params, task details interaction |
| **v1.0.0** | — | Public Release: Final polish |

**Next milestone:** v0.7.0
