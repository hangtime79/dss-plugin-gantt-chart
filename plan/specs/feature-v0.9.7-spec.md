# Feature v0.9.7 Specification - Reset Zoom

## Branch
`feature/v0.9.7-reset-zoom`

## Linked Issues
- Fixes #60

## Overview
Add a "Reset Zoom" button to the control bar that resets the zoom level to 100% (or viewport floor if larger).

---

## Feature: Reset Zoom Button

### User Story
As a user, I want to quickly reset the zoom to a standard view after zooming in/out, so I don't have to click multiple times to return to baseline.

### Current Behavior
- Zoom In/Out buttons adjust by ZOOM_STEP (5px) per click
- No way to quickly return to baseline without multiple clicks
- Each view mode maintains its own zoom level in `columnWidthByViewMode`

### New Behavior
- New "Reset" button appears left of "Zoom Out"
- Clicking resets to `max(COLUMN_WIDTH_BASELINE, minColumnWidthByViewMode[currentViewMode])`
- Zoom indicator updates immediately

---

## Fix Plan

### Step 1: Add Reset Button HTML
**File:** `webapps/gantt-chart/body.html`

Add reset button before zoom-out button inside `.btn-group`:

```html
<button id="btn-zoom-reset" class="btn btn-icon" title="Reset Zoom to 100%" aria-label="Reset Zoom">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
    </svg>
</button>
```

### Step 2: Add Reset Button Event Handler
**File:** `webapps/gantt-chart/app.js`

In `setupControls()` function (around line 2290), add:

```javascript
const zoomResetBtn = document.getElementById('btn-zoom-reset');
if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', resetZoom);
}
```

### Step 3: Create resetZoom() Function
**File:** `webapps/gantt-chart/app.js`

Add new function after `adjustZoom()`:

```javascript
/**
 * Reset zoom to 100% or viewport floor (whichever is larger).
 * Uses the greater of COLUMN_WIDTH_BASELINE (75px) or the
 * calculated minimum for the current view mode.
 */
function resetZoom() {
    const viewFloor = minColumnWidthByViewMode[currentViewMode] || ABSOLUTE_FLOOR;
    const targetWidth = Math.max(COLUMN_WIDTH_BASELINE, viewFloor);
    const currentWidth = columnWidthByViewMode[currentViewMode] || COLUMN_WIDTH_BASELINE;

    if (targetWidth === currentWidth) {
        console.log('Zoom already at reset level:', targetWidth);
        return;
    }

    columnWidthByViewMode[currentViewMode] = targetWidth;
    ganttInstance.options.column_width = targetWidth;
    ganttInstance.change_view_mode(currentViewMode);
    updateZoomIndicator();
    console.log('Zoom reset to:', targetWidth, '(' + Math.round((targetWidth / COLUMN_WIDTH_BASELINE) * 100) + '%) for', currentViewMode);
}
```

### Step 4: Version Bump
**File:** `plugin.json`

Change version from `"0.9.5"` to `"0.9.7"`

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/body.html` | Modify | Add reset button before zoom-out |
| `webapps/gantt-chart/app.js` | Modify | Add resetZoom() function and event listener |
| `plugin.json` | Modify | Version bump to 0.9.7 |

---

## Testing Checklist
- [ ] Reset button appears left of Zoom Out button
- [ ] Reset button has correct icon (circular arrow)
- [ ] Reset button has tooltip "Reset Zoom to 100%"
- [ ] Clicking reset at 150% zoom returns to 100%
- [ ] Clicking reset at 50% zoom returns to 100%
- [ ] If viewport floor > 100%, reset goes to floor instead
- [ ] Zoom indicator shows correct percentage after reset
- [ ] Reset works independently per view mode (Week, Month, etc.)
- [ ] Dark mode styling works correctly
- [ ] Button hover states work

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. After implementing the fix, commit with message:
   ```
   feat(v0.9.7): Add Reset Zoom button (#60)

   Adds a Reset button to the zoom controls that returns zoom to 100%
   (or viewport floor if larger). Button placed left of Zoom Out.

   Changes:
   - body.html: Add reset button with circular arrow icon
   - app.js: Add resetZoom() function and event listener
   - plugin.json: Version bump to 0.9.7

   Fixes #60
   ```

2. Verify commit: `git log --oneline -1`
3. Notify user that code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open a Gantt chart with tasks
3. Verify Reset button appears left of "−" (Zoom Out) button
4. Hover over Reset button - confirm tooltip shows "Reset Zoom to 100%"
5. Click Zoom In several times to reach 150%+
6. Click Reset - confirm zoom returns to 100%
7. Click Zoom Out several times to reach 50%
8. Click Reset - confirm zoom returns to 100%
9. Switch to Month view, zoom to 200%
10. Switch back to Week view - confirm Week's zoom was independent
11. In Week view, click Reset - confirm it resets Week view
12. Switch to Month view - confirm it still shows 200%
13. (If dark mode) Toggle dark mode and verify button styling
```

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan
Revert the commit: `git revert HEAD`

---

## Watch Out For
- Button order: Reset must be BEFORE Zoom Out in HTML for correct visual order
- SVG icon: Use inline SVG (FontAwesome classes don't work in Dataiku webapp context)
- Per-view zoom: Each view mode has independent zoom - reset only affects current view
