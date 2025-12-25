# Bugfix v0.5.1 Specification

## Branch
`bugfix/v0.5.1-visual-polish`

## Linked Issues
- Fixes #27 (Remove 1px outline from task bars)
- Fixes #28 (Strictly Aligned Progress Bar Positioning)

## Overview
Visual polish patch addressing two CSS issues: removing the dated 1px outline around task bars, and refining progress bar positioning for strict alignment with task boundaries.

---

## Bug #1: Task Bar Outline (#27)

### Symptom
Task bars have a visible 1px gray outline that looks dated and clutters the modern UI.

### Root Cause
Frappe Gantt's CSS applies an `outline` (not `stroke`) to bars:

```css
/* frappe-gantt.css */
.gantt .bar-wrapper .bar {
    outline: 1px solid var(--g-row-border-color);  /* #c7c7c7 */
}
```

Our existing `stroke: none` rule doesn't affect this because `outline` is a different CSS property.

### Fix
Add outline removal to style.css.

---

## Bug #2: Progress Bar Alignment (#28)

### Symptom
Progress bar positioning may not strictly align with task boundaries, particularly:
- Border radius not matching task bar on edges
- Potential sub-pixel gaps at edges

### Root Cause
Current implementation uses CSS transform scaling:
```css
.gantt .bar-progress {
    transform-box: fill-box;
    transform-origin: center center;
    transform: scaleY(0.6);
}
```

This approach:
- Correctly centers the 60% height progress bar
- But `scaleY` also scales the border-radius, making it visually different from the task bar
- SVG rect needs explicit rx/ry override to match parent bar radius

### Requirements (from #28)
| Requirement | Current Status |
|-------------|----------------|
| Height: 60% of task | ✓ Done (scaleY 0.6) |
| Vertically centered | ✓ Done (transform-origin center) |
| Left edge flush with task start | ✓ Default behavior |
| Right edge flush at 100% | ✓ Default behavior |
| Border radius matches task edges | ❌ Needs fix - radius is scaled |

### Fix
Override the progress bar's border-radius to use unscaled values that visually match the task bar.

---

## Fix Plan

### Step 1: Remove Bar Outline
**File:** `resource/webapp/style.css`

Add after the existing `.gantt .bar` rule (around line 590):

```css
/* Remove dated outline from task bars */
.gantt .bar-wrapper .bar {
    outline: none !important;
}
```

### Step 2: Fix Progress Bar Border Radius
**File:** `resource/webapp/style.css`

The task bar has `rx="3"` and `ry="3"` (from frappe-gantt). When we `scaleY(0.6)`, the ry becomes visually 1.8px.

Update the `.gantt .bar-progress` rule to compensate:

```css
/* Progress bar height: 60% of task bar height, centered within task */
.gantt .bar-progress {
    transform-box: fill-box;
    transform-origin: center center;
    transform: scaleY(0.6);
    /* Compensate for scaleY on border radius: 3 / 0.6 = 5 */
    rx: 3px;
    ry: 5px;
}
```

**Note:** `rx` stays 3px (horizontal, unaffected by scaleY). `ry` is set to 5px so after 0.6 scaling it appears as 3px (5 * 0.6 = 3).

### Step 3: Version Bump
**File:** `plugin.json`

Change version from `"0.5.0"` to `"0.5.1"`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `resource/webapp/style.css` | Modify | Add outline:none, fix progress bar rx/ry |
| `plugin.json` | Modify | Version bump to 0.5.1 |

---

## Testing Checklist

- [ ] Task bars have no visible outline/border
- [ ] Progress bars are 60% height, vertically centered
- [ ] Progress bar left edge is flush with task start
- [ ] Progress bar at 100% has right edge flush with task end
- [ ] Progress bar border radius visually matches task bar radius
- [ ] No visual regressions in colored bars (color column selected)
- [ ] No visual regressions in default gray bars (no color column)

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing the fix, commit with message:
   ```
   fix(v0.5.1): remove bar outline and fix progress bar radius (#27, #28)
   ```
2. Verify commit: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open a Gantt chart with tasks that have progress values
3. Verify:
   - Task bars have NO gray outline/border around them
   - Progress bars are visually centered within tasks
   - Progress bar corners match the task bar corners (same roundness)
   - At 100% progress, the progress bar fills the task completely
4. Test with both:
   - Color column selected (colored bars)
   - No color column (gray default bars)
5. Confirm visual polish improvements
```

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan

If issues arise:
1. Revert the CSS changes to style.css
2. Reset plugin.json version to 0.5.0
3. Commit revert

The changes are CSS-only with no backend impact.

---

## Watch Out For

1. **SVG rx/ry units** - SVG uses unitless values or explicit px; test both syntaxes
2. **Browser differences** - Test in Chrome and Firefox for SVG rendering
3. **Frappe Gantt overrides** - May need `!important` if library applies inline styles
4. **Scale math** - Verify 5 * 0.6 = 3 produces correct visual match
