# v0.1.1 Implementation Specification

**Version:** 0.1.1
**Branch:** `feature/v0.1.1-ux-improvements`
**Scope:** Minimal - Two features only

---

## Overview

This release adds two UX improvements with a deliberately narrow scope to avoid the cascading failures of v0.1.0. No frontend JavaScript changes. No CSS changes. Backend-only sorting integration plus webapp.json parameter reorganization.

---

## Feature 1: Task Sorting

### Description
Enable users to sort tasks by various criteria via a new dropdown in the sidebar.

### Backend Status
**Already implemented and tested.** The `sort_utils.py` module exists in `python-lib/ganttchart/` with 13 passing tests.

### Sort Options (10 total)

| Value | Label | Description |
|-------|-------|-------------|
| `none` | Dataset Order | No sorting (default) |
| `start_asc` | Start Date (Earliest First) | Timeline overview |
| `start_desc` | Start Date (Latest First) | Recent work focus |
| `end_asc` | End Date (Earliest First) | Deadline tracking |
| `end_desc` | End Date (Latest First) | Long-term view |
| `name_asc` | Name (A-Z) | Alphabetical |
| `name_desc` | Name (Z-A) | Reverse alphabetical |
| `duration_asc` | Duration (Shortest First) | Quick wins |
| `duration_desc` | Duration (Longest First) | Major efforts |
| `dependencies` | Dependencies (Topological) | Critical path |

### Implementation Required

#### 1. Add `sortBy` parameter to `webapp.json`

Add to `leftBarParams` array in the "View Settings" section (after `scrollTo`):

```json
{
    "name": "sortBy",
    "type": "SELECT",
    "label": "Sort Tasks By",
    "description": "Order tasks are displayed in the chart",
    "defaultValue": "none",
    "selectChoices": [
        {"value": "none", "label": "Dataset Order"},
        {"value": "start_asc", "label": "Start Date (Earliest First)"},
        {"value": "start_desc", "label": "Start Date (Latest First)"},
        {"value": "end_asc", "label": "End Date (Earliest First)"},
        {"value": "end_desc", "label": "End Date (Latest First)"},
        {"value": "name_asc", "label": "Name (A-Z)"},
        {"value": "name_desc", "label": "Name (Z-A)"},
        {"value": "duration_asc", "label": "Duration (Shortest First)"},
        {"value": "duration_desc", "label": "Duration (Longest First)"},
        {"value": "dependencies", "label": "Dependencies (Topological)"}
    ]
}
```

#### 2. Update `backend.py` to call sort_utils

**File:** `webapps/gantt-chart/backend.py`

**Step 2a:** Add import at top of file (after line 18):
```python
from ganttchart.sort_utils import sort_tasks
```

**Step 2b:** Add sorting after transformation (after line 113, before line 127):

The transform returns a `result` dict with `result['tasks']`. Sort the tasks in place:

```python
# After: result = transformer.transform(df)
# Before: if not result['tasks']:

# Apply sorting if specified
sort_by = config.get('sortBy', 'none')
if sort_by and sort_by != 'none':
    result['tasks'] = sort_tasks(result['tasks'], sort_by)
```

**Exact location in code flow:**
```python
# Line ~113
result = transformer.transform(df)

# INSERT SORTING HERE (new lines ~114-116)
sort_by = config.get('sortBy', 'none')
if sort_by and sort_by != 'none':
    result['tasks'] = sort_tasks(result['tasks'], sort_by)

# Line ~127 (now ~130)
if not result['tasks']:
```

**Note:** Sorting happens AFTER maxTasks limit is applied by the transformer. This is correct - we sort the tasks that will be displayed, not the entire dataset.

---

## Feature 2: Top Bar Data Columns

### Description
Move the three mandatory data columns (Task ID, Start Date, End Date) from the left sidebar to the top bar. This aligns with standard Dataiku chart patterns where primary data mappings appear in the top bar.

### Current State
- `webapp.json` has `"topBar": "NONE"`
- All 7 data columns are in `leftBarParams`

### Target State
- `webapp.json` has `"topBar": "STD_FORM"` with `topBarParams`
- 3 mandatory columns in `topBarParams`: idColumn, startColumn, endColumn
- 4 optional columns remain in `leftBarParams`: nameColumn, progressColumn, dependenciesColumn, colorColumn

### Implementation Required

#### 1. Change `topBar` value in `webapp.json`

```json
"topBar": "STD_FORM",
```

#### 2. Add `topBarParams` array in `webapp.json`

Add after the `topBar` line:

```json
"topBarParams": [
    {
        "name": "idColumn",
        "type": "DATASET_COLUMN",
        "datasetParamName": "dataset",
        "label": "Task ID",
        "description": "Unique identifier for each task (required for dependencies)",
        "mandatory": true
    },
    {
        "name": "startColumn",
        "type": "DATASET_COLUMN",
        "datasetParamName": "dataset",
        "label": "Start Date",
        "description": "Task start date",
        "mandatory": true
    },
    {
        "name": "endColumn",
        "type": "DATASET_COLUMN",
        "datasetParamName": "dataset",
        "label": "End Date",
        "description": "Task end date",
        "mandatory": true
    }
],
```

#### 3. Remove moved parameters from `leftBarParams`

Remove these three entries from `leftBarParams`:
- `idColumn`
- `startColumn`
- `endColumn`

Keep the "Data Columns" separator but rename it to "Optional Data Columns" since only optional columns remain.

#### 4. Update leftBarParams separator

Change:
```json
{
    "type": "SEPARATOR",
    "label": "Data Columns"
},
```

To:
```json
{
    "type": "SEPARATOR",
    "label": "Optional Columns"
},
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `webapps/gantt-chart/webapp.json` | Add topBar, topBarParams, sortBy; reorganize leftBarParams |
| `webapps/gantt-chart/backend.py` | Import and call sort_tasks |
| `plugin.json` | Bump version to 0.1.1 |

---

## Files NOT to Modify

**CRITICAL: Do not touch these files:**
- `webapps/gantt-chart/app.js` - No frontend changes
- `webapps/gantt-chart/style.css` - No CSS changes
- `resource/webapp/*` - No changes to bundled resources
- `webapps/gantt-chart/body.html` - No HTML changes

The lesson from v0.1.0: Frontend changes caused cascading failures. This release is backend + config only.

---

## Testing Requirements

### Unit Tests
All existing tests must pass:
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v
```

Expected: 90 tests passing

### Manual Testing Checklist

- [ ] Plugin reloads without errors
- [ ] Top bar shows Task ID, Start Date, End Date pickers
- [ ] Sidebar shows Optional Columns section with Name, Progress, Dependencies, Color
- [ ] Sidebar shows Sort Tasks By dropdown in View Settings
- [ ] All 10 sort options work correctly
- [ ] Chart renders correctly after sorting
- [ ] Existing functionality not broken (dependencies, colors, popups)

---

## Version Bump

Update `plugin.json`:
```json
"version": "0.1.1"
```

---

## CHANGELOG Entry

Add to CHANGELOG.md under `## [Unreleased]` or create `## [0.1.1]` section:

```markdown
## [0.1.1] - 2025-12-19

### Added
- Task sorting with 10 options (start/end date, name, duration, dependencies)
- Topological sort using Kahn's algorithm for dependency-based ordering

### Changed
- Moved mandatory columns (Task ID, Start Date, End Date) to top bar
- Optional columns (Name, Progress, Dependencies, Color) remain in sidebar
```

---

## Constraints

1. **No JavaScript changes** - Frontend stays untouched
2. **No CSS changes** - Styling stays untouched
3. **Backend sorting only** - sort_utils.py already exists and is tested
4. **Config reorganization only** - Just moving parameters between bars
5. **Incremental approach** - Test after each change before proceeding

---

## Success Criteria

1. `webapp.json` validates (no JSON syntax errors)
2. Plugin reloads in Dataiku without errors
3. Top bar displays 3 mandatory column pickers
4. Sidebar displays reorganized parameters with sort dropdown
5. Sorting works for all 10 options
6. All 90 unit tests pass
7. No regressions in existing functionality
