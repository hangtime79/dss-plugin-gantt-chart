# Feature v0.7.0 Specification

## Branch
`feature/v0.7.0-expected-progress-and-polish`

## Linked Issues
- Fixes #33 (Expected Progress Indicator)
- Fixes #45 (Bar corner radius default to 10)
- Fixes #43 (Remove 'Disable all Editing' option)
- Fixes #42 (Weekend highlighting off by default)
- Fixes #38 (Float dependency strings not normalized)
- Fixes #37 (Pandas infer_datetime_format deprecation)

## Overview
Main feature: Expected Progress Indicator showing where task progress *should* be based on current date. Plus five quick wins: config defaults, dead code removal, and two Python bug fixes.

---

## Part 1: Quick Wins (Do First)

### 1.1 Bar Corner Radius Default (#45)

**File:** `webapps/gantt-chart/webapp.json`

**Change:** Line ~205, change `defaultValue` from 3 to 10:
```json
{
    "name": "barCornerRadius",
    "type": "INT",
    "label": "Bar Corner Radius",
    "description": "Roundness of bar corners",
    "defaultValue": 10,  // Changed from 3
    "minI": 0,
    "maxI": 15
}
```

---

### 1.2 Weekend Highlighting Default (#42)

**File:** `webapps/gantt-chart/webapp.json`

**Change:** Line ~258, change `defaultValue` from true to false:
```json
{
    "name": "highlightWeekends",
    "type": "BOOLEAN",
    "label": "Highlight weekends",
    "defaultValue": false  // Changed from true
}
```

---

### 1.3 Remove 'Disable all Editing' Option (#43)

**Rationale:** No write-back capability exists in Dataiku, so this option is misleading.

**File:** `webapps/gantt-chart/webapp.json`

**Change:** Remove the entire `readonly` parameter block (lines ~232-237):
```json
// DELETE THIS BLOCK:
{
    "name": "readonly",
    "type": "BOOLEAN",
    "label": "Read-only",
    "description": "Disable all editing",
    "defaultValue": true
},
```

**File:** `webapps/gantt-chart/app.js`

**Change:** Find and remove any references to `readonly` config option. Search for:
- `webAppConfig.readonly`
- `config.readonly`
- `readonly:` in Gantt options

If found, remove or replace with hardcoded `true` (editing always disabled).

---

### 1.4 Float Dependency Bug (#38)

**File:** `python-lib/ganttchart/task_transformer.py`

**Problem:** When dependency column contains `'1.0, 2.0'` and ID column is numeric, dependencies return empty `[]`.

**Root Cause:** Float strings like `'1.0'` aren't normalized to match integer IDs like `'1'`.

**Fix:** In the dependency normalization logic, handle float-like strings by converting to int first:
```python
def normalize_id(id_val):
    """Normalize ID to string, handling floats."""
    if pd.isna(id_val):
        return None
    # Convert to string
    str_val = str(id_val).strip()
    # If it looks like a float (e.g., '1.0'), convert to int string
    try:
        float_val = float(str_val)
        if float_val.is_integer():
            return str(int(float_val))
    except (ValueError, TypeError):
        pass
    return str_val
```

**Test:** `tests/python/unit/test_task_transformer.py::TestIDNormalization::test_multiple_dependencies_with_floats`

---

### 1.5 Pandas Deprecation Warning (#37)

**File:** `python-lib/ganttchart/date_parser.py`

**Problem:** `infer_datetime_format` parameter is deprecated in pandas 2.0+.

**Fix:** Remove the `infer_datetime_format=True` argument from `pd.to_datetime()` calls. Modern pandas infers format automatically.

**Search for:**
```python
pd.to_datetime(..., infer_datetime_format=True)
```

**Replace with:**
```python
pd.to_datetime(...)
```

---

## Part 2: Expected Progress Indicator (#33)

### 2.1 Concept

Show a visual marker on each task bar indicating where progress *should* be based on the current date:

```
Task Bar:  [████████░░░░░░░░░░░░]
                    ▲
                    Expected progress marker (today = 40% through task duration)
```

**Calculation:**
```
expected_progress = (today - start_date) / (end_date - start_date) * 100
```

**Applicability:**
- Only show for tasks where: `start_date <= today <= end_date`
- Tasks not yet started or already ended: no marker

### 2.2 Configuration

**File:** `webapps/gantt-chart/webapp.json`

**Add new parameter** in "View Settings" section (after `sortBy`):
```json
{
    "name": "showExpectedProgress",
    "type": "BOOLEAN",
    "label": "Show expected progress",
    "description": "Display marker showing where progress should be based on current date",
    "defaultValue": false
}
```

### 2.3 Backend Changes

**File:** `webapps/gantt-chart/backend.py`

Pass `showExpectedProgress` config to frontend (already happens via `webAppConfig`).

**File:** `python-lib/ganttchart/task_transformer.py`

Add `expected_progress` calculation to each task:
```python
def calculate_expected_progress(start_date, end_date, today=None):
    """Calculate expected progress based on current date."""
    if today is None:
        today = datetime.now().date()

    if isinstance(start_date, str):
        start_date = parse_date(start_date).date()
    if isinstance(end_date, str):
        end_date = parse_date(end_date).date()

    # Task not started yet
    if today < start_date:
        return 0

    # Task already ended
    if today > end_date:
        return 100

    # Calculate progress
    total_duration = (end_date - start_date).days
    if total_duration <= 0:
        return 100

    elapsed = (today - start_date).days
    return min(100, max(0, (elapsed / total_duration) * 100))
```

Add to task output:
```python
task['expected_progress'] = calculate_expected_progress(task['start'], task['end'])
```

### 2.4 Frontend Changes

**File:** `webapps/gantt-chart/app.js`

**Option A: CSS-based marker (Preferred)**

After Gantt renders, inject a marker element into each task bar:
```javascript
function addExpectedProgressMarkers() {
    if (!webAppConfig.showExpectedProgress) return;

    const tasks = window._ganttTasks || [];
    const bars = document.querySelectorAll('.gantt .bar-wrapper');

    bars.forEach((barWrapper, index) => {
        const task = tasks[index];
        if (!task || task.expected_progress === undefined) return;

        // Only show for in-progress tasks
        if (task.expected_progress <= 0 || task.expected_progress >= 100) return;

        const bar = barWrapper.querySelector('.bar');
        if (!bar) return;

        // Create marker
        const marker = document.createElement('div');
        marker.className = 'expected-progress-marker';
        marker.style.left = task.expected_progress + '%';

        bar.appendChild(marker);
    });
}
```

**File:** `resource/webapp/style.css`

Add marker styling:
```css
/* Expected Progress Marker */
.expected-progress-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: #ff6b6b;
    z-index: 10;
    pointer-events: none;
}

/* Small triangle indicator at top */
.expected-progress-marker::before {
    content: '';
    position: absolute;
    top: -4px;
    left: -3px;
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 4px solid #ff6b6b;
}
```

**Timing:** Call `addExpectedProgressMarkers()` after:
1. Initial render (in `renderGantt` post-render block)
2. View mode changes (in `on_view_change` callback)

### 2.5 Visual Design

```
Progress States:

Ahead of schedule (actual > expected):
[██████████████░░░░░░]  ← Fill beyond marker = good
              |

On track (actual ≈ expected):
[██████████░░░░░░░░░░]  ← Fill near marker = ok
          |

Behind schedule (actual < expected):
[████░░░░░░░░░░░░░░░░]  ← Fill before marker = attention
          |
```

**Marker color:** Red (`#ff6b6b`) - stands out but doesn't imply good/bad

---

## Files to Modify

| File | Action | Issues |
|------|--------|--------|
| `webapps/gantt-chart/webapp.json` | Modify | #45, #42, #43, #33 |
| `webapps/gantt-chart/app.js` | Modify | #43, #33 |
| `python-lib/ganttchart/task_transformer.py` | Modify | #38, #33 |
| `python-lib/ganttchart/date_parser.py` | Modify | #37 |
| `resource/webapp/style.css` | Modify | #33 |
| `plugin.json` | Modify | Version bump |

---

## Testing Checklist

### Quick Wins
- [ ] #45: New charts default to corner radius 10
- [ ] #42: New charts default to weekend highlighting OFF
- [ ] #43: No "Read-only" / "Disable all editing" option visible
- [ ] #38: Dependencies `'1.0, 2.0'` normalize correctly with numeric IDs
- [ ] #37: No pandas deprecation warnings in logs

### Expected Progress (#33)
- [ ] Toggle appears in View Settings
- [ ] Disabled by default (no markers visible)
- [ ] When enabled, markers appear on in-progress tasks
- [ ] No markers on tasks not yet started
- [ ] No markers on completed tasks (past end date)
- [ ] Marker position updates correctly for different dates
- [ ] Works across all view modes (Day, Week, Month, Year)
- [ ] Markers reappear after view mode change

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. Implement all changes
2. Run unit tests: `PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v`
3. Commit with message:
   ```
   feat(v0.7.0): add expected progress indicator and polish (#33, #45, #43, #42, #38, #37)

   Features:
   - Add expected progress marker showing where tasks should be based on date
   - New showExpectedProgress toggle (default: off)

   Config changes:
   - barCornerRadius default: 3 → 10
   - highlightWeekends default: true → false
   - Removed readonly option (no write-back in Dataiku)

   Bug fixes:
   - Float dependency strings now normalize correctly
   - Removed deprecated infer_datetime_format parameter

   Fixes #33, Fixes #45, Fixes #43, Fixes #42, Fixes #38, Fixes #37

   [claude signature]
   ```
4. Verify: `git log --oneline -1`

**User QA Steps:**
```
1. Reload plugin in Dataiku

2. Test quick wins (new chart):
   - Create new Gantt chart
   - Verify corner radius defaults to 10 (bars more rounded)
   - Verify weekend highlighting is OFF by default
   - Verify no "Read-only" option in Behavior section

3. Test expected progress:
   - Enable "Show expected progress" toggle
   - Create/use dataset with tasks spanning today's date
   - Verify red marker appears on in-progress tasks
   - Verify NO marker on future tasks (start > today)
   - Verify NO marker on past tasks (end < today)
   - Switch view modes - markers should persist

4. Test Python fixes:
   - Use dataset with float-like IDs in dependencies
   - Check console for pandas deprecation warnings (should be none)
```

---

## Rollback Plan
```bash
git revert HEAD
```

---

## Watch Out For

1. **Bar position context** — `.bar` elements may not have `position: relative`. Check and add if needed for marker positioning.

2. **Task/bar index alignment** — Frappe Gantt may reorder tasks internally. May need to match by task ID, not array index.

3. **Date timezone issues** — `today` in Python vs browser may differ. Use consistent date handling.

4. **View mode re-render** — Frappe recreates DOM on view change. Must re-add markers in `on_view_change`.

5. **Readonly removal** — Verify Gantt still works without readonly option. May need to hardcode `readonly: true` in Gantt config.
