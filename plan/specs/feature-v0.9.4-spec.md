# Feature v0.9.4 Specification

## Branch
`feature/v0.9.4-tooltip-polish`

## Linked Issues
- Fixes #66 - Anchor Tooltip to Task Bar Bottom-Left instead of Mouse Cursor
- Fixes #67 - Shrink Tooltip Wrapper Padding (White Halo)

## Overview
Improve tooltip positioning and appearance by anchoring tooltips to task bars and reducing visual padding/halo.

---

## Feature #1: Tooltip Anchored to Task Bar (#66)

### Current Behavior
Tooltip appears at mouse cursor position (`event.offsetX/Y`), which:
- Varies based on where user clicks/hovers within the bar
- Often covers the task bar itself
- Jumps around if user moves mouse within the bar

### Desired Behavior
Tooltip anchors to the **bottom-left corner** of the task bar:
- Consistent positioning regardless of click/hover location
- Task bar remains fully visible
- Tooltip doesn't obscure chart data

### Root Cause
Library code in `frappe-gantt.es.js` (line 688):
```javascript
this.parent.style.left = t + 10 + "px"
this.parent.style.top = e - 10 + "px"
```
Where `t` and `e` are mouse `offsetX/offsetY`.

### Implementation
**File:** `webapps/gantt-chart/app.js`

Monkey-patch `ganttInstance.show_popup` after initialization:

```javascript
// Patch show_popup to anchor tooltip to task bar (#66)
const originalShowPopup = ganttInstance.show_popup.bind(ganttInstance);
ganttInstance.show_popup = function(opts) {
    if (opts.target) {
        const barRect = opts.target.getBoundingClientRect();
        const containerRect = ganttInstance.$container.getBoundingClientRect();
        opts.x = barRect.left - containerRect.left;
        opts.y = barRect.bottom - containerRect.top + 5; // 5px offset below bar
    }
    originalShowPopup(opts);
};
```

**Logic:**
1. Get bounding rect of task bar (`opts.target`)
2. Get bounding rect of gantt container
3. Calculate relative position: bar position minus container position
4. Add 5px vertical offset for breathing room

---

## Feature #2: Reduce Tooltip Padding (#67)

### Current Behavior
- `.popup-wrapper` has `padding: 10px` and `background: #fff`
- In dark mode, this creates a thick white "halo" around the tooltip

### Desired Behavior
- Reduce padding to 5px (half)
- In dark mode, match tooltip background to theme surface color

### Root Cause
Library CSS in `frappe-gantt.css`:
```css
.popup-wrapper { padding: 10px; background: #fff; }
```

### Implementation
**File:** `resource/webapp/style.css`

```css
/* Reduce tooltip padding from 10px to 5px (#67) */
.gantt-container .popup-wrapper {
    padding: 5px;
}

/* Dark mode: Match tooltip background to surface (#67) */
.dark-theme .gantt-container .popup-wrapper {
    background: var(--color-surface);
}
```

---

## Version Bump

**File:** `plugin.json`

Change version from `0.9.3` to `0.9.4`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/app.js` | Modify | Add show_popup monkey-patch for bar-anchored positioning |
| `resource/webapp/style.css` | Modify | Add popup padding and dark mode background overrides |
| `plugin.json` | Modify | Version 0.9.3 → 0.9.4 |

---

## Testing Checklist

### #66 - Tooltip Positioning
- [ ] Click task bar → tooltip appears below the bar, left-aligned
- [ ] Hover task bar → tooltip appears below the bar (if hover enabled)
- [ ] Moving mouse within bar → tooltip stays anchored to bar (doesn't jump)
- [ ] Tooltip doesn't overlap the clicked task bar
- [ ] Works for tasks at different vertical positions (top/middle/bottom of chart)
- [ ] Works for tasks at different horizontal positions (left/middle/right of view)

### #67 - Tooltip Appearance
- [ ] Light mode: Padding visibly reduced (5px vs 10px)
- [ ] Dark mode: No white "halo" around tooltip
- [ ] Dark mode: Tooltip background matches theme surface color
- [ ] Both modes: Content still readable, not cramped
- [ ] Theme toggle: Background switches correctly

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing fixes, commit with:
   ```
   feat(v0.9.4): Tooltip positioning and appearance polish (#66, #67)

   - Anchor tooltip to task bar bottom-left instead of mouse cursor
   - Reduce tooltip padding from 10px to 5px
   - Fix dark mode tooltip background (remove white halo)

   Changes:
   - webapps/gantt-chart/app.js: Monkey-patch show_popup
   - resource/webapp/style.css: Popup padding and dark mode fixes
   - plugin.json: Version 0.9.3 → 0.9.4

   Fixes #66, Fixes #67

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```
2. Verify: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open a Gantt chart with tasks

TOOLTIP POSITIONING TEST (#66):
3. Click on a task bar
4. VERIFY: Tooltip appears BELOW the bar, aligned to left edge
5. Click on a different part of the same bar
6. VERIFY: Tooltip stays in same position (doesn't jump)
7. Click on tasks at top, middle, and bottom of chart
8. VERIFY: Tooltip consistently appears below each bar

TOOLTIP APPEARANCE TEST (#67):
9. Look at the tooltip padding
10. VERIFY: Padding is visibly smaller/tighter than before
11. Toggle to dark mode
12. Click on a task bar
13. VERIFY: Tooltip has dark background, NO white border/halo
14. Toggle back to light mode
15. VERIFY: Tooltip displays correctly

Report: PASS or describe any issues observed.
```

**Do not proceed to PR/merge until user confirms both features work.**

---

## Rollback Plan

**If #66 breaks:**
Remove the show_popup monkey-patch from app.js. Tooltip will return to mouse-following behavior.

**If #67 breaks:**
Remove the two CSS rules added. Tooltip will return to 10px padding and white background in dark mode.

Both features are additive; rollback is straightforward.

---

## Watch Out For

1. **Container scroll position:** The bounding rect calculation assumes static positioning. If the container is scrolled, may need to account for `scrollLeft/scrollTop`.

2. **Tooltip clipping:** If task is near bottom of viewport, tooltip might be clipped. May need boundary detection in future iteration.

3. **CSS specificity:** Using `.gantt-container .popup-wrapper` should have sufficient specificity to override library defaults.

4. **SVG vs HTML elements:** `opts.target` is an SVG `rect` element. `getBoundingClientRect()` works on SVG elements but returns viewport-relative coordinates.

---

## Spec Complete

**Ready for SDE implementation.**

The SDE should:
1. Implement tooltip positioning fix (#66) first
2. Implement CSS appearance fixes (#67) second
3. Bump version
4. Commit and request User QA
5. Do NOT proceed past QA gate without user approval
