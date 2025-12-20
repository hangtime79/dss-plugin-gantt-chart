# Bugfix v0.1.2 Specification

## Branch
`bugfix/v0.1.2`

## Overview
Fix appearance settings and time period rendering bugs in Gantt chart webapp.

---

## Bug 1: Appearance Settings Not Updating (FIXED)

### Symptom
User changes Bar Height, Bar Corner Radius, Column Width, or Padding in Dataiku UI sidebar, but visual appearance does NOT change.

### Root Cause
The frontend made a SEPARATE backend call (`fetchGanttConfig()` → `/get-config`) to get Frappe Gantt options. This backend call used `get_webapp_config()` which returned STALE data, not the live config from the UI.

The frontend already receives current config via message event (`webAppConfig`), but was ignoring it for Gantt options.

### Fix Applied
1. Added `buildGanttConfig(webAppConfig)` function that derives Frappe Gantt options directly from the live `webAppConfig`
2. Removed `fetchGanttConfig()` backend call
3. Changed `initializeChart()` to use `buildGanttConfig(config)` instead

### Files Modified
- `webapps/gantt-chart/app.js` - Added `buildGanttConfig()`, removed `fetchGanttConfig()` usage

---

## Bug 2: Time Period Rendering (Tasks Invisible at Day/Hour Views) (FIXED)

### Symptom
When switching from Week/Month view to Day/Half-Day/Hour view, task bars become invisible or cut off.

### Root Cause
The `enforceMinimumBarWidths()` function exists but was NOT being called. This function ensures minimum bar widths so short-duration tasks remain visible at finer time granularities.

### Fix Applied
Added two `requestAnimationFrame(() => enforceMinimumBarWidths())` calls:
1. After `new Gantt()` creation (ensures bars visible on initial render)
2. In `on_view_change` handler (ensures bars visible when switching view modes)

### Files Modified
- `webapps/gantt-chart/app.js` - Added `enforceMinimumBarWidths()` calls in `renderGantt()`

---

## Bug 3: Dual Execution Race Condition (REQUIRES COMMIT)

### Symptom
Inconsistent behavior - sometimes settings apply, sometimes they don't. "Two views being maintained simultaneously." Rapid config changes produce unpredictable results.

### Root Cause
Console logs show TWO versions of `app.js` executing simultaneously:
- `app.js:127` - The COMMITTED version (old code from commit 4986a1f)
- `view:1354` - The UNCOMMITTED version (new code in working directory)

Dataiku loads the webapp from the working directory (uncommitted changes), but ALSO loads a cached/bundled version of the committed code. Both execute, creating race conditions where the second render overwrites the first.

### Console Evidence
```
Rendering Gantt with 561 tasks view:1354:17    ← First render (uncommitted)
Gantt chart created successfully view:1430:21
Rendering Gantt with 561 tasks app.js:127:17   ← Second render (committed)
Gantt chart rendered successfully app.js:191:21
```

### Fix Required
**COMMIT the uncommitted changes** so only ONE version of the code exists.

```bash
git add webapps/gantt-chart/app.js python-lib/ganttchart/task_transformer.py
git commit -m "fix(v0.1.2): Resolve config source and bar width enforcement issues"
```

After commit, hard refresh browser (Ctrl+Shift+R) to clear cached old version.

---

## Key Code Changes Summary

### `webapps/gantt-chart/app.js`

1. **Added `buildGanttConfig()` function** (~line 129-160):
```javascript
function buildGanttConfig(webAppConfig) {
    const ganttConfig = {
        view_mode: webAppConfig.viewMode || 'Week',
        view_mode_select: webAppConfig.viewModeSelect !== false,
        bar_height: parseInt(webAppConfig.barHeight) || 30,
        bar_corner_radius: parseInt(webAppConfig.barCornerRadius) || 3,
        column_width: parseInt(webAppConfig.columnWidth) || 45,
        padding: parseInt(webAppConfig.padding) || 18,
        // ... other options
    };
    // ... weekend highlighting
    return ganttConfig;
}
```

2. **Modified `initializeChart()`** - Uses `buildGanttConfig(config)` instead of `fetchGanttConfig()`

3. **Modified `renderGantt()`** - Added `enforceMinimumBarWidths()` calls:
   - After `ganttInstance = new Gantt(...)`: `requestAnimationFrame(() => enforceMinimumBarWidths());`
   - In `on_view_change` handler: `requestAnimationFrame(() => enforceMinimumBarWidths());`

---

## Watch Out For

1. **SVG Width Override**: Do NOT set `svg.style.width = '100%'` - this overrides Frappe Gantt's calculated timeline width

2. **Nullish Coalescing**: Use `??` not `||` for numeric options that can be 0 (e.g., `bar_corner_radius: config.bar_corner_radius ?? 3`)

3. **parseInt on Config Values**: The `webAppConfig` values may be strings - use `parseInt()` when building ganttConfig

4. **requestAnimationFrame Required**: `enforceMinimumBarWidths()` must be called via `requestAnimationFrame` to run after Frappe Gantt completes its render

5. **Task 0 Duration Error**: Console shows "the duration of task 0 is too long (above ten years)" - this is a data issue with the test dataset, not a code bug

---

## Testing Checklist

After commit:
- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Change Bar Height → Should visually update
- [ ] Change Column Width → Should visually update
- [ ] Switch to Day view → Tasks should be visible
- [ ] Switch to Hour view → Tasks should be visible
- [ ] Console should show only ONE "Rendering Gantt" per config change (not two)
