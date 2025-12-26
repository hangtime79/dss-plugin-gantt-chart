# Bugfix v0.7.1 Specification

## Branch
`bugfix/v0.7.1-sticky-header-narrow-content`

## Linked Issues
- Fixes #21 - Sticky header janky when chart content narrower than viewport

## Overview
Fix sticky header jankiness that occurs when Gantt chart SVG content is narrower than the container viewport.

---

## Bug: Sticky Header Jank on Narrow Content

### Symptom
When the Gantt chart renders with a date range too short to fill the viewport width (e.g., Year view with only 2-3 years of data), the sticky header becomes choppy/janky during vertical scroll.

### Root Cause
The sticky header uses `transform: translate3d()` on scroll events. When SVG content doesn't fill the container width, browser paint/composite behavior differs, causing visual jank. This is a browser rendering quirk - the GPU layer optimization works correctly only when content fills the viewport.

### Prior Attempted Fixes (v0.4.2)
1. **Removed `lastStickyHeader` optimization** - Did not fix the jank
2. **Force header minWidth to container width** - Did not fix the jank

Both approaches failed because the issue is in the SVG body, not the header element.

---

## Fix Plan

### Solution Strategy
~~Guarantee edge-to-edge content by calculating minimum date range for each view mode, then expanding the chart's date boundaries if the data's range would produce content narrower than the viewport.~~

**REVISED APPROACH (v2):** Instead of expanding dates, zoom in (increase column width) to fill the viewport. After render, check if SVG is narrower than container. If so, calculate the zoom factor needed and apply it via `change_view_mode()`.

### Step 1 (v2): Add ensureEdgeToEdgeContent() Function
**File:** `webapps/gantt-chart/app.js`

```javascript
function ensureEdgeToEdgeContent() {
    if (!ganttInstance) return;
    if (zoomAdjustmentInProgress) return;  // Guard against infinite loops

    const container = document.getElementById('gantt-container');
    const svg = document.getElementById('gantt-svg');
    if (!container || !svg) return;

    const containerWidth = container.offsetWidth;
    const svgWidth = parseFloat(svg.getAttribute('width')) || 0;

    // If SVG already fills container, no adjustment needed
    if (svgWidth >= containerWidth) return;

    // Calculate zoom factor and apply
    const zoomFactor = (containerWidth / svgWidth) * 1.02;
    const newColumnWidth = Math.min(
        Math.ceil(existingColumnWidth * zoomFactor),
        MAX_ZOOM
    );

    zoomAdjustmentInProgress = true;
    currentColumnWidth = newColumnWidth;
    ganttInstance.options.column_width = newColumnWidth;
    ganttInstance.change_view_mode(ganttInstance.options.view_mode);

    requestAnimationFrame(() => { zoomAdjustmentInProgress = false; });
}
```

### Step 2 (v2): Call After Render and View Mode Change
- Call `ensureEdgeToEdgeContent()` in post-render `requestAnimationFrame` block
- Call `ensureEdgeToEdgeContent()` in `on_view_change` callback

---

### ~~Step 1: Add Date Range Expansion Utility~~ (SUPERSEDED)
**File:** `webapps/gantt-chart/app.js`

Create a function to calculate and enforce minimum date range:

```javascript
/**
 * Calculate minimum date range to fill viewport width.
 * Prevents sticky header jank from narrow content.
 *
 * @param {string} viewMode - Current view mode (Hour, Day, Week, Month, Year)
 * @param {number} containerWidth - Container width in pixels
 * @param {Date} dataStart - Earliest task start date
 * @param {Date} dataEnd - Latest task end date
 * @returns {Object} - { start: Date, end: Date } expanded if needed
 */
function getExpandedDateRange(viewMode, containerWidth, dataStart, dataEnd) {
    // Column widths from frappe-gantt defaults
    const columnWidths = {
        'Hour': 38,
        'Day': 38,
        'Week': 140,
        'Month': 120,
        'Year': 120
    };

    // Time units per column for each view mode
    const timePerColumn = {
        'Hour': 60 * 60 * 1000,           // 1 hour in ms
        'Day': 24 * 60 * 60 * 1000,       // 1 day in ms
        'Week': 7 * 24 * 60 * 60 * 1000,  // 1 week in ms
        'Month': 30 * 24 * 60 * 60 * 1000, // ~1 month in ms
        'Year': 365 * 24 * 60 * 60 * 1000  // ~1 year in ms
    };

    const columnWidth = columnWidths[viewMode] || 120;
    const minColumns = Math.ceil(containerWidth / columnWidth);
    const timeNeeded = minColumns * timePerColumn[viewMode];

    const dataRange = dataEnd.getTime() - dataStart.getTime();

    if (dataRange >= timeNeeded) {
        // Data fills viewport, no expansion needed
        return { start: dataStart, end: dataEnd };
    }

    // Expand symmetrically around data center
    const deficit = timeNeeded - dataRange;
    const padding = deficit / 2;

    return {
        start: new Date(dataStart.getTime() - padding),
        end: new Date(dataEnd.getTime() + padding)
    };
}
```

### Step 2: Apply Date Range Expansion in renderGantt
**File:** `webapps/gantt-chart/app.js`

In `renderGantt()`, after determining tasks but before creating the Gantt instance:

1. Calculate the data's actual date range from tasks
2. Get container width from `#gantt-container`
3. Call `getExpandedDateRange()` with default view mode
4. Pass expanded dates to frappe-gantt options

```javascript
// In renderGantt(), before new Gantt():
const container = document.getElementById('gantt-container');
const containerWidth = container.offsetWidth;

// Find data date range
const dataStart = new Date(Math.min(...tasks.map(t => new Date(t.start))));
const dataEnd = new Date(Math.max(...tasks.map(t => new Date(t.end))));

// Expand if needed for edge-to-edge content
const viewMode = config.view_mode || 'Day';
const expandedRange = getExpandedDateRange(viewMode, containerWidth, dataStart, dataEnd);

// Use expanded range for chart boundaries
const ganttOptions = {
    // ... existing options ...
    start: expandedRange.start,
    end: expandedRange.end,
};
```

### Step 3: Re-expand on View Mode Change
**File:** `webapps/gantt-chart/app.js`

In the `on_view_change` callback, recalculate and apply date expansion for the new view mode:

```javascript
on_view_change: function(mode) {
    requestAnimationFrame(() => {
        // ... existing code ...

        // Recalculate date expansion for new view mode
        const viewModeName = mode.name || mode;
        const container = document.getElementById('gantt-container');
        if (container && ganttInstance) {
            const expandedRange = getExpandedDateRange(
                viewModeName,
                container.offsetWidth,
                dataStart,  // Stored from initial render
                dataEnd
            );
            // Note: frappe-gantt doesn't expose API to change date boundaries
            // after init. May need to store expanded range and check if
            // re-render is needed when switching to narrower view modes.
        }

        setupStickyHeader();
    });
}
```

**Important:** frappe-gantt doesn't have an API to change date boundaries after initialization. The SDE should investigate whether `update_options()` can modify this, or if a full re-render is needed when switching to a view mode that would produce narrower content.

### Step 4: Version Bump
**File:** `plugin.json`

Change version from `0.7.0` to `0.7.1`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/app.js` | Modify | Add `getExpandedDateRange()`, apply in `renderGantt()` and `on_view_change` |
| `plugin.json` | Modify | Version 0.7.0 → 0.7.1 |

---

## Testing Checklist

### Primary Fix Verification
- [ ] Load chart with short date range (e.g., 3 months of data)
- [ ] Switch to Year view (should be expanded to fill viewport)
- [ ] Scroll vertically - header should be smooth, NOT janky
- [ ] Switch between view modes - header should stay smooth

### Edge Cases
- [ ] Very wide viewport (e.g., 2560px) - should expand date range accordingly
- [ ] Very narrow viewport (e.g., 800px) - should require less expansion
- [ ] Single task spanning 1 day - should expand significantly
- [ ] Tasks spanning 10 years - should NOT expand (already fills viewport)

### Regression
- [ ] Normal data sets still render correctly
- [ ] View mode transitions work
- [ ] Today button works
- [ ] Scroll position preserved on config changes
- [ ] Horizontal scrolling works correctly

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing the fix, commit with:
   ```
   fix(v0.7.1): Expand date range for edge-to-edge content (#21)

   Prevent sticky header jank when SVG content narrower than viewport.
   Calculate minimum date range needed to fill container width, then
   expand chart boundaries symmetrically if data range is insufficient.

   Changes:
   - app.js: Add getExpandedDateRange() utility
   - app.js: Apply date expansion in renderGantt()
   - app.js: Recalculate on view mode change
   - plugin.json: Version 0.7.0 → 0.7.1

   Fixes #21

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude <model>-4 <noreply@anthropic.com>
   ```
2. Verify: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Create/edit a Gantt chart with a SHORT date range:
   - Use a dataset with tasks spanning only 2-3 months
   - Or configure date boundaries to a narrow window
3. Open the chart - it should render with expanded date range
4. Switch to Year view
5. Scroll vertically through the task list
6. VERIFY: Header scroll is SMOOTH (not choppy/janky)
7. Switch back to Day/Week view and scroll again
8. VERIFY: Header remains smooth in all views
9. Report: PASS or describe any jankiness observed
```

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan

If the fix causes issues:
1. `git revert HEAD` to undo the commit
2. The chart will render with original date boundaries
3. Sticky jank will return but functionality is preserved

---

## Watch Out For

1. **frappe-gantt date API** - Library may not support changing `start`/`end` after init. SDE should verify and adapt approach.

2. **Performance with extreme expansion** - If data is 1 day but viewport requires 2 years of columns, this could create a very wide SVG. Consider capping maximum expansion.

3. **Month/Year approximations** - Using 30/365 days is approximate. Edge cases near month/year boundaries may need adjustment.

4. **Stored data range** - Need to preserve original `dataStart`/`dataEnd` for re-expansion on view mode change. Don't use expanded range for this calculation.

5. **View mode column widths** - Values are from frappe-gantt defaults. If user overrides `column_width` config, expansion calculation will be wrong. Consider reading actual column width from options.

---

## Alternative Approaches Considered

### A: Force SVG minWidth (Rejected)
Set `svg { min-width: 100%; }` to stretch content. Rejected because it would distort bar widths and break proportional time display.

### B: CSS containment (Not Investigated)
Use `contain: layout` or similar to isolate paint. Worth investigating if date expansion approach proves insufficient.

### C: Virtual sticky (Complex)
Create a separate fixed header element and sync content. More complex, introduces z-index/positioning challenges.

---

## Spec Complete

**Ready for SDE implementation.**

The spec provides:
- Clear root cause analysis
- Step-by-step implementation plan
- Complete testing checklist
- User QA gate with test script
