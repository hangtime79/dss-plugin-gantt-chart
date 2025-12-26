# Bugfix v0.7.2 Specification

## Branch
`bugfix/v0.7.2-markers-and-zoom`

## Linked Issues
- Fixes #52 - Expected progress markers misaligned at lower granularities
- Fixes #53 - Feature: Zoom stops at 25%, 50%, 75%, 100%

## Overview
Fix expected progress marker alignment at Hour/Day views and add zoom preset buttons for quick access to common zoom levels.

---

## Bug #1: Expected Progress Markers Misaligned (#52)

### Symptom
Expected progress markers (the diamond/triangle indicators) are slightly askew at lower granularities (Hour, Day). Some markers appear to the left, some to the right of the expected position.

### Root Cause
The Python calculation uses **day-level precision**:
```python
elapsed = (today - start).days  # Integer days only
expected = (elapsed / total_duration) * 100
```

But frappe-gantt's bar positioning at Hour/Day granularity uses **finer precision** via its `diff()` function that accounts for:
- Time within the day
- View-specific column width calculations
- Padding/margins in the SVG layout

The mismatch: Our marker uses a linear percentage of bar width, but the bar's visual representation doesn't map linearly to calendar days at sub-day granularity.

### Investigation Notes
- The `diff()` function in frappe-gantt has known issues (see Bug #6 in `plan/frappe-gantt-upstream-bugs.md`)
- At Month view, we patched `diff()` to fix `o%30/30` → `(n.getDate()-1)/30`
- Similar precision issues may exist at Day/Hour levels

---

## Fix Plan for #52

### Option A: Calculate in JavaScript (Recommended)
Calculate expected progress position using the same date math that frappe-gantt uses for bar positioning.

**Pros:** Accurate alignment at all granularities
**Cons:** More complex, depends on library internals

### Option B: Accept Day-Level Precision
Keep current calculation, document that markers are day-precision. At Week/Month/Year views, day-level precision is acceptable. Only warn users about Hour/Day imprecision.

**Pros:** Simple, no code change
**Cons:** Doesn't fix the visual issue

### Recommended Approach: Option A - JavaScript Calculation

**File:** `webapps/gantt-chart/app.js`

#### Step 1: Modify `addExpectedProgressMarkers()`

Instead of:
```javascript
const markerX = barX + (task._expected_progress / 100) * barWidth;
```

Calculate using the actual date positions:
```javascript
// Get task dates
const taskStart = new Date(task.start);
const taskEnd = new Date(task.end);
const now = new Date();

// If now is outside task range, skip (Python already handles this, but double-check)
if (now < taskStart || now > taskEnd) return;

// Calculate position based on time, not percentage
const totalMs = taskEnd.getTime() - taskStart.getTime();
const elapsedMs = now.getTime() - taskStart.getTime();
const markerX = barX + (elapsedMs / totalMs) * barWidth;
```

#### Step 2: Remove Python `_expected_progress` Calculation (Optional)
If JavaScript handles all calculation, Python can stop sending `_expected_progress`. This simplifies the data contract.

**However**, keeping Python calculation allows:
- Backend validation
- Use in tooltips
- Consistency if JavaScript disabled

**Recommendation:** Keep Python calculation for data purposes, but use JavaScript for marker positioning.

---

## Feature #2: Zoom Stops at Percentages (#53)

### Current Behavior
- Zoom changes in 5px increments via +/- buttons
- Users must click multiple times to reach common levels
- Baseline: 75px = 100%

### Proposed Behavior
Add a dropdown or button group for preset zoom levels:

| Level | Column Width | Use Case |
|-------|--------------|----------|
| 25% | 19px | Maximum zoom out |
| 50% | 38px | Overview |
| 75% | 56px | Comfortable reading |
| 100% | 75px | Baseline/default |
| 150% | 113px | Detailed view |
| 200% | 150px | Maximum detail |

### UI Options

**Option A: Replace +/- with Dropdown**
Single dropdown showing current percentage, click to select preset.

**Option B: Add Preset Buttons**
Keep +/- buttons, add small preset buttons between them:
```
[−] [25] [50] [75] [100] [+]
```

**Option C: Percentage Display as Clickable**
Current percentage indicator becomes a dropdown on click.

### Recommended Approach: Option B

Keep existing zoom behavior (5px increments) for fine control, add preset buttons for quick access.

---

## Fix Plan for #53

**File:** `webapps/gantt-chart/app.js`

### Step 1: Define Zoom Presets
```javascript
const ZOOM_PRESETS = [
    { label: '25%', width: 19 },
    { label: '50%', width: 38 },
    { label: '75%', width: 56 },
    { label: '100%', width: 75 },
];
```

### Step 2: Add Preset Buttons to Control Bar
In the zoom control section, add buttons between − and + or below them:
```javascript
// Create preset container
const presetContainer = document.createElement('div');
presetContainer.className = 'zoom-presets';

ZOOM_PRESETS.forEach(preset => {
    const btn = document.createElement('button');
    btn.className = 'zoom-preset-btn';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => setZoomLevel(preset.width));
    presetContainer.appendChild(btn);
});
```

### Step 3: Update setZoomLevel Function
Ensure `setZoomLevel()` (or equivalent) respects the per-view floor from v0.7.1:
```javascript
function setZoomLevel(targetWidth) {
    const viewMode = ganttInstance.options.view_mode;
    const floor = minColumnWidthByViewMode[viewMode] || ABSOLUTE_FLOOR;
    const newWidth = Math.max(targetWidth, floor);

    columnWidthByViewMode[viewMode] = newWidth;
    ganttInstance.options.column_width = newWidth;
    ganttInstance.change_view_mode(viewMode);

    updateZoomIndicator();
}
```

### Step 4: Style Preset Buttons
**File:** `resource/webapp/style.css`
```css
.zoom-presets {
    display: flex;
    gap: 4px;
    margin-left: 8px;
}

.zoom-preset-btn {
    padding: 2px 6px;
    font-size: 11px;
    border: 1px solid var(--border-color);
    border-radius: 3px;
    background: var(--bg-secondary);
    cursor: pointer;
}

.zoom-preset-btn:hover {
    background: var(--bg-tertiary);
}

.zoom-preset-btn.active {
    background: var(--accent-color);
    color: white;
}
```

---

## Version Bump

**File:** `plugin.json`

Change version from `0.7.1` to `0.7.2`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/app.js` | Modify | Fix marker calculation, add zoom presets |
| `resource/webapp/style.css` | Modify | Style zoom preset buttons |
| `plugin.json` | Modify | Version 0.7.1 → 0.7.2 |

---

## Testing Checklist

### #52 - Marker Alignment
- [ ] Load chart with tasks spanning multiple days/weeks
- [ ] Switch to Hour view - markers should align with current time position
- [ ] Switch to Day view - markers should align with current day position
- [ ] Switch to Week view - markers should align correctly
- [ ] Switch to Month view - markers should align correctly
- [ ] Verify markers don't appear for tasks not yet started
- [ ] Verify markers don't appear for tasks already completed

### #53 - Zoom Presets
- [ ] Preset buttons visible in control bar
- [ ] Click 25% - zooms to minimum level
- [ ] Click 50% - zooms to 38px columns
- [ ] Click 75% - zooms to 56px columns
- [ ] Click 100% - zooms to 75px baseline
- [ ] Preset respects per-view floor (can't go below minimum for current view)
- [ ] Active preset highlighted
- [ ] +/- buttons still work for fine adjustment

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing fixes, commit with:
   ```
   fix(v0.7.2): Fix marker alignment and add zoom presets (#52, #53)

   - Calculate marker position using time-based math instead of day-based
   - Add preset buttons for 25%, 50%, 75%, 100% zoom levels
   - Respect per-view zoom floor from v0.7.1

   Fixes #52, Fixes #53

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```
2. Verify: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open a Gantt chart with tasks currently in progress

MARKER ALIGNMENT TEST:
3. Enable expected progress markers in config (if not already)
4. Switch to Hour view
5. VERIFY: Red marker aligns with current time (not offset)
6. Switch to Day view
7. VERIFY: Marker aligns with current position within today
8. Switch to Week/Month views
9. VERIFY: Marker positions look correct

ZOOM PRESETS TEST:
10. Look at control bar - should see 25%, 50%, 75%, 100% buttons
11. Click 25% button
12. VERIFY: Chart zooms to minimum level
13. Click 100% button
14. VERIFY: Chart returns to baseline zoom
15. Click 50% button
16. VERIFY: Chart zooms to medium level
17. Use +/- buttons
18. VERIFY: Fine zoom adjustment still works

Report: PASS or describe any issues observed.
```

**Do not proceed to PR/merge until user confirms both fixes work.**

---

## Rollback Plan

**If #52 breaks:**
```javascript
// Revert to percentage-based calculation:
const markerX = barX + (task._expected_progress / 100) * barWidth;
```

**If #53 breaks:**
- Remove preset buttons from control bar
- Keep +/- zoom functionality

Both features are additive; rollback is straightforward.

---

## Watch Out For

1. **Time zones:** JavaScript `new Date()` uses local time. If task dates are in a different timezone, marker position could be off.

2. **Performance:** Don't recalculate marker positions on every scroll. Only on render and view change.

3. **Per-view floor interaction:** When clicking a preset like 25%, it might be below the current view's floor. Must show the "zoom limit reached" message.

4. **Active state tracking:** Need to track which preset is currently active (closest match to current column width, with tolerance).

5. **Mobile/touch:** Ensure preset buttons are touch-friendly (adequate tap target size).

---

## Spec Complete

**Ready for SDE implementation.**

The SDE should:
1. Implement marker fix (#52) first
2. Implement zoom presets (#53) second
3. Commit and request User QA
4. Do NOT proceed past QA gate without user approval
