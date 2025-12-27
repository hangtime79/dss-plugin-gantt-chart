# Feature v0.9.2 Specification: Visual Polish

## Branch
`feature/v0.9.2-visual-polish`

## Linked Issues
- Fixes #62 (Standardize Task Label Positioning)
- Fixes #63 (Style and Center Completion Checkmark)
- Fixes #64 (Bar Corner Radius Progress Distortion)

## Overview
Visual polish release addressing label positioning, checkmark centering, and progress bar accuracy.

---

## Implementation Order

```
#62 (Labels) → #63 (Checkmark) → #64 (Progress)
     ↓              ↓
  Required      Depends on #62
```

**#62 must be done first** - moving labels right frees bar space for centered checkmark.

---

## Issue #62: Standardize Task Label Positioning

### Symptom
Labels sometimes appear inside bars (centered), sometimes outside (right). User wants consistent right-aligned labels.

### Root Cause
`update_label_position()` in frappe-gantt.es.js (lines 631-642) uses adaptive logic:
```javascript
o > h ?  // if label_width > bar_width
  (add .big, position right of bar) :
  (remove .big, center inside bar)
```

### Fix
**Option chosen: Post-render override in app.js** (avoids modifying library file)

Add new function `forceRightAlignedLabels()`:
```javascript
function forceRightAlignedLabels() {
    const LABEL_OFFSET = 45; // 45px right of bar end

    document.querySelectorAll('.gantt .bar-wrapper').forEach(wrapper => {
        const bar = wrapper.querySelector('.bar');
        const label = wrapper.querySelector('.bar-label');
        if (!bar || !label) return;

        const barEndX = parseFloat(bar.getAttribute('x')) + parseFloat(bar.getAttribute('width'));

        // Force right-aligned positioning
        label.setAttribute('x', barEndX + LABEL_OFFSET);
        label.classList.add('big');  // Ensures correct text color
    });
}
```

**Call sites:**
- After `ganttInstance = new Gantt(...)` initial render
- In `on_view_change` callback (DOM recreated)

### Files to Modify
| File | Change |
|------|--------|
| `webapps/gantt-chart/app.js` | Add `forceRightAlignedLabels()`, call after render and view change |

---

## Issue #63: Style and Center Completion Checkmark

### Symptom
Checkmark is positioned at left side of bar, not centered.

### Root Cause
`addCompletionIndicators()` (app.js lines 1606-1666) calculates:
```javascript
const centerX = x + (scaledSize / 2);  // LEFT side, not center
```

### Fix
Update checkmark positioning to true center:
```javascript
// Change from:
const centerX = x + (scaledSize / 2);

// Change to:
const centerX = x + (width / 2) - (scaledSize / 2);  // True horizontal center
```

**Also update theme colors:**
- Light theme: Black checkmark (#000000) - already correct via `isLightColor()` check
- Dark theme: White checkmark (#ffffff) - already correct
- Verify contrast against all palette colors

**Remove label shift logic** (no longer needed since #62 moves all labels right):
```javascript
// DELETE these lines (1656-1660):
if (label) {
    const labelX = parseFloat(label.getAttribute('x')) || 0;
    label.setAttribute('x', labelX + scaledSize + 4);
}
```

### Files to Modify
| File | Change |
|------|--------|
| `webapps/gantt-chart/app.js` | Update `addCompletionIndicators()` centering math, remove label shift |

---

## Issue #64: Bar Corner Radius Progress Distortion

### Symptom
With large corner radius, 50% progress visually appears as 60-70%.

### Root Cause
`fixProgressBarRadius()` (app.js lines 1719-1787) extends progress bar width:
```javascript
if (cornerRadius > 0 && originalWidth > 0) {
    progressBar.setAttribute('x', originalX - cornerRadius);
    progressBar.setAttribute('width', originalWidth + cornerRadius * 2);  // BUG!
}
```

This **overstates** progress because the extension happens AFTER percentage calculation.

### Fix
**Remove width extension** - clipPath alone handles corner containment:
```javascript
// DELETE lines 1778-1783 (the width extension block)
// Keep only:
// 1. clipPath creation (lines 1748-1763)
// 2. clipPath application (line 1766)
// 3. rx/ry reset to 0 (lines 1769-1770)
```

The clipPath already constrains the progress bar to task bar bounds. Width extension causes visual overstating.

### Files to Modify
| File | Change |
|------|--------|
| `webapps/gantt-chart/app.js` | Remove width extension in `fixProgressBarRadius()` |

---

## Version Bump

**File:** `plugin.json`
```json
"version": "0.9.1" → "0.9.2"
```

---

## Files Summary

| File | Action | Changes |
|------|--------|---------|
| `webapps/gantt-chart/app.js` | Edit | Add `forceRightAlignedLabels()`, fix checkmark centering, remove progress width extension |
| `plugin.json` | Edit | Version 0.9.1 → 0.9.2 |

---

## Testing Checklist

### #62 - Label Positioning
- [ ] All labels appear right of bars (none inside)
- [ ] Consistent 45px offset from bar end
- [ ] Labels have correct color (`.big` class applied)
- [ ] Works after view mode change (Day/Week/Month)
- [ ] Works with short task names and long task names

### #63 - Checkmark
- [ ] Checkmark centered horizontally in bar
- [ ] Checkmark centered vertically in bar
- [ ] Black checkmark on light bars (light theme)
- [ ] White checkmark on dark bars (dark theme)
- [ ] No label shift (labels already right-aligned from #62)
- [ ] Works with all color palettes

### #64 - Progress Bar
- [ ] 0% progress: invisible/empty
- [ ] 50% progress: visually bisects bar
- [ ] 100% progress: fills entire bar
- [ ] Works with corner radius 0, 3, 5, 10
- [ ] Progress bar stays within task bar bounds (no bleeding)

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit:**
```
feat(v0.9.2): Visual polish - labels, checkmarks, progress (#62, #63, #64)

- Force all task labels to right-aligned position (45px offset)
- Center completion checkmark in task bars
- Fix progress bar overstating by removing width extension
- Version bump 0.9.1 → 0.9.2

Fixes #62, #63, #64
```

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions → Reload)

LABELS (#62):
2. Verify ALL labels appear to the right of bars
3. No labels should be centered inside bars
4. Switch view modes - labels stay right-aligned

CHECKMARK (#63):
5. Create/view task with 100% progress
6. Checkmark should be CENTERED in bar (not left-aligned)
7. Toggle light/dark theme - checkmark color adapts

PROGRESS BAR (#64):
8. View task with 50% progress
9. Progress should visually fill ~50% of bar (not 60-70%)
10. Test with different corner radius settings
11. 100% progress should exactly fill the bar
```

---

## Rollback Plan
```bash
git checkout main -- webapps/gantt-chart/app.js plugin.json
```

---

## Watch Out For

1. **Call order matters**: `forceRightAlignedLabels()` must run AFTER frappe-gantt's `update_label_position()` completes
2. **DOM timing**: Use `requestAnimationFrame` wrapper if labels aren't positioned yet
3. **View change**: DOM is recreated - must reapply label positioning
4. **Checkmark depends on #62**: Test checkmark AFTER label fix is working
5. **Progress bar scaleY(0.6)**: The 60% height scaling is CSS-based, don't interfere with it
