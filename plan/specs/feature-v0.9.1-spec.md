# Feature v0.9.1 Specification: Dark Mode Completion

## Branch
`feature/v0.9.1-dark-mode`

## Linked Issues
- Fixes #31

## Overview
Complete dark mode implementation with comprehensive fixes for all remaining dark mode issues including header text, button states, bar colors, and progression visibility.

---

## Gap 1: Zoom Limit Banner Not Themed

### Symptom
When user hits zoom limits in dark mode, the banner shows yellow warning on light background - hard to read.

### Root Cause
`resource/webapp/style.css` lines 675-689 have hardcoded light-mode colors (#fff3cd, #ffc107, #856404) with no dark mode override.

---

## Gap 2: Task Bar Colors Not Adapted for Dark Mode

### Symptom
Classic/pastel palette colors look washed out or clash on dark backgrounds.

### Root Cause
Palette colors are applied server-side in Python. Theme switching is CSS-only client-side. No mechanism exists to adjust colors based on theme.

### Solution
**CSS-only approach**: Override bar fill colors in dark theme without requiring backend changes. This follows the existing pattern where all dark mode styling is CSS-based.

---

## Gap 3: Sticky Header Uses Hardcoded Colors

### Symptom
Sticky header background uses hardcoded `#16213e` and `#ffffff` in JavaScript.

### Root Cause
`webapps/gantt-chart/app.js` lines 1040-1041 set inline styles with hardcoded values instead of using CSS variables.

---

## Gap 4: Floating Year Text Not Themed

### Symptom
The year displayed on the left side of the header stays light-colored in dark mode.

### Root Cause
- `ensureYearInUpperHeaders()` in app.js modifies `.upper-text` elements
- When view changes, frappe-gantt recreates SVG DOM
- The recreated elements don't inherit dark mode colors because theme styling isn't reapplied

---

## Gap 5: Button Hover/Active States Hardcoded

### Symptom
Buttons in top right control bar have light-colored hover/active states in dark mode.

### Root Cause
`style.css` lines 177 and 181 have hardcoded colors:
- `.btn:hover` uses `border-color: #b2bec3` (hardcoded light gray)
- `.btn:active` uses `background-color: #dfe6e9` (hardcoded light gray)
- No `.dark-theme .btn:hover` or `.dark-theme .btn:active` overrides exist

---

## Gap 6: Header Text Sporadic Updates on View Change

### Symptom
Upper/lower header text sometimes stays wrong color after theme change or view change.

### Root Cause
- `on_view_change` callback recreates DOM but doesn't re-apply theme to header
- `adjustHeaderLabels()` runs but doesn't update styling
- CSS selectors `.dark-theme .gantt .upper-text` should work, but inline styles or timing issues interfere

---

## Gap 7: Default Tier Progression Invisible in Dark Mode

### Symptom
When no color column is used, progress bars are invisible in dark mode.

### Root Cause
- Default tier bars use light gray (`#f0f3f6`)
- Progress overlay is only slightly darker (`#d4d9de`)
- No `.dark-theme .bar-default-tier-*` CSS overrides exist
- The existing dark mode progress rule `rgba(255, 255, 255, 0.25)` is too faint

---

## Gap 8: Pastel Palette Poor Visibility

### Symptom
Text and progression difficult to see on pastel colors in dark mode.

### Root Cause
- Pastel colors are inherently light (e.g., `#a8d8ea`)
- Against dark background, they appear washed out
- Dark text (`#2d3436`) on light pastels is still hard to read in dark context
- No dark mode overrides for pastel palette

---

## Gap 9: Progress Bars Need Better Dark Mode Contrast

### Symptom
Progress bars don't show clearly on colored bars in dark mode.

### Root Cause
- Current dark mode progress uses `rgba(255, 255, 255, 0.25)` (line 1084)
- This is too faint on bright/vibrant colors
- Need stronger contrast or darker progress bar colors

---

## Fix Plan

### Step 1: Add Dark Theme Zoom Banner Styles
**File:** `resource/webapp/style.css`

Add after the existing `.zoom-limit-banner` rules (~line 700):

```css
/* Dark theme zoom limit banner */
.dark-theme .zoom-limit-banner {
    background-color: #3d3d2e;
    border-color: #c9a227;
    color: #f4d03f;
}

.dark-theme .zoom-limit-banner .dismiss-btn {
    color: #f4d03f;
}
```

### Step 2: Add Auto-Palette Dark Mode Overrides
**File:** `resource/webapp/style.css`

Add new section after dark mode progress bar (~line 1086):

Override these palettes for dark theme visibility:
- **Classic palette** (12 colors): Desaturate bright colors, ensure white labels
- **Pastel palette** (12 colors): Brighten for dark backgrounds
- **Default tier** (6 tiers): Use dark slate blue with white labels

CSS classes to override:
- `.bar-blue`, `.bar-green`, `.bar-orange`, `.bar-purple`, `.bar-red`, `.bar-teal`, `.bar-pink`, `.bar-indigo`, `.bar-cyan`, `.bar-amber`, `.bar-lime`, `.bar-gray`
- `.bar-pastel-*` variants
- `.bar-default-tier-0` through `.bar-default-tier-100`

### Step 3: Fix Sticky Header Dynamic Colors
**File:** `webapps/gantt-chart/app.js`

**Line ~1041**: Replace hardcoded color:
```javascript
// Before:
header.style.backgroundColor = isDark ? '#16213e' : '#ffffff';

// After:
header.style.backgroundColor = 'var(--color-surface)';
```

**Lines ~1297-1302**: Update `updateStickyHeaderTheme()`:
```javascript
function updateStickyHeaderTheme() {
    const header = document.querySelector('.gantt .grid-header');
    if (header) {
        header.style.backgroundColor = 'var(--color-surface)';
    }
}
```

### Step 4: Add Button Hover/Active Dark Mode Styles
**File:** `resource/webapp/style.css`

Add after existing `.dark-theme .btn` rules (~line 995):

```css
.dark-theme .btn:hover {
    background-color: rgba(255, 255, 255, 0.15);
    border-color: var(--color-border);
}

.dark-theme .btn:active {
    background-color: rgba(255, 255, 255, 0.25);
}
```

### Step 5: Fix Header Text Reapplication on View Change
**File:** `webapps/gantt-chart/app.js`

In `on_view_change` callback (~line 890), after `adjustHeaderLabels()`:
```javascript
// Ensure header theme is reapplied after view change recreates DOM
updateStickyHeaderTheme();
```

### Step 6: Add Default Tier Dark Mode Overrides
**File:** `resource/webapp/style.css`

Add dark mode styles for default (no color column) bars:

```css
/* Default tier bars in dark mode - use dark slate blue */
.dark-theme .bar-default-tier-0 .bar,
.dark-theme .bar-default-tier-1 .bar,
.dark-theme .bar-default-tier-25 .bar,
.dark-theme .bar-default-tier-50 .bar,
.dark-theme .bar-default-tier-75 .bar,
.dark-theme .bar-default-tier-100 .bar {
    fill: #3d566e !important;
}

/* Default tier labels - white for dark bars */
.dark-theme .bar-default-tier-0 .bar-label,
.dark-theme .bar-default-tier-1 .bar-label,
.dark-theme .bar-default-tier-25 .bar-label,
.dark-theme .bar-default-tier-50 .bar-label,
.dark-theme .bar-default-tier-75 .bar-label,
.dark-theme .bar-default-tier-100 .bar-label {
    fill: #ffffff !important;
}

/* Default tier progress - progressive intensity */
.dark-theme .bar-default-tier-0 .bar-progress { fill: #3d566e !important; }
.dark-theme .bar-default-tier-1 .bar-progress { fill: #4a6785 !important; }
.dark-theme .bar-default-tier-25 .bar-progress { fill: #57789c !important; }
.dark-theme .bar-default-tier-50 .bar-progress { fill: #6489b3 !important; }
.dark-theme .bar-default-tier-75 .bar-progress { fill: #719aca !important; }
.dark-theme .bar-default-tier-100 .bar-progress { fill: #5dade2 !important; }
```

### Step 7: Add Pastel Palette Dark Mode Overrides
**File:** `resource/webapp/style.css`

Darken pastel colors for dark mode (more saturated versions):

```css
/* Pastel palette - use darker/more saturated versions in dark mode */
.dark-theme .bar-pastel-blue .bar { fill: #5dade2 !important; }
.dark-theme .bar-pastel-green .bar { fill: #58d68d !important; }
.dark-theme .bar-pastel-orange .bar { fill: #eb984e !important; }
.dark-theme .bar-pastel-purple .bar { fill: #af7ac5 !important; }
.dark-theme .bar-pastel-red .bar { fill: #ec7063 !important; }
.dark-theme .bar-pastel-teal .bar { fill: #48c9b0 !important; }
.dark-theme .bar-pastel-pink .bar { fill: #f1948a !important; }
.dark-theme .bar-pastel-indigo .bar { fill: #7d8cff !important; }
.dark-theme .bar-pastel-cyan .bar { fill: #52c4e0 !important; }
.dark-theme .bar-pastel-amber .bar { fill: #f5b041 !important; }
.dark-theme .bar-pastel-lime .bar { fill: #a0d468 !important; }
.dark-theme .bar-pastel-gray .bar { fill: #95a5a6 !important; }

/* Pastel palette labels - white text for visibility */
.dark-theme .bar-pastel-blue .bar-label,
.dark-theme .bar-pastel-green .bar-label,
.dark-theme .bar-pastel-orange .bar-label,
.dark-theme .bar-pastel-purple .bar-label,
.dark-theme .bar-pastel-red .bar-label,
.dark-theme .bar-pastel-teal .bar-label,
.dark-theme .bar-pastel-pink .bar-label,
.dark-theme .bar-pastel-indigo .bar-label,
.dark-theme .bar-pastel-cyan .bar-label,
.dark-theme .bar-pastel-amber .bar-label,
.dark-theme .bar-pastel-lime .bar-label,
.dark-theme .bar-pastel-gray .bar-label {
    fill: #ffffff !important;
}
```

### Step 8: Improve Progress Bar Contrast in Dark Mode
**File:** `resource/webapp/style.css`

Update the general progress bar rule (~line 1084):
```css
/* Progress bar visibility in dark mode - stronger contrast */
.dark-theme .gantt .bar-progress {
    fill: rgba(0, 0, 0, 0.35) !important;
}
```

### Step 9: Version Bump
**File:** `plugin.json`

Change: `"version": "0.9.0"` → `"version": "0.9.1"`

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `resource/webapp/style.css` | Edit | Zoom banner, button states, default tiers, pastel palette, progress bars |
| `webapps/gantt-chart/app.js` | Edit | CSS variables for header, reapply theme on view change |
| `plugin.json` | Edit | Version 0.9.0 → 0.9.1 |

---

## Testing Checklist

### Zoom Limit Banner
- [ ] Switch to dark theme
- [ ] Zoom out to minimum on Day view
- [ ] Banner shows gold/amber colors (not yellow)
- [ ] Dismiss button visible and clickable

### Buttons (Control Bar)
- [ ] In dark mode, hover over buttons
- [ ] Hover state should show subtle light highlight (not bright flash)
- [ ] Click/active state should be visible but not jarring

### Header Text
- [ ] Switch between view modes (Day/Week/Month)
- [ ] Upper text (years) and lower text (dates) should update color correctly
- [ ] Floating year on left should respect dark mode
- [ ] Text color should persist after view mode change

### Default Tier (No Color Column)
- [ ] Remove color column (use default gray bars)
- [ ] Switch to dark theme
- [ ] Bars should be dark slate blue (not light gray)
- [ ] Labels should be white and readable
- [ ] Progress bars should be visible (progressive blue intensity)

### Pastel Palette
- [ ] Select Pastel palette with color column
- [ ] Switch to dark theme
- [ ] Colors should be more saturated (not washed out)
- [ ] All labels should be white and readable
- [ ] Progress bars visible on all pastel colors

### Classic Palette
- [ ] Select Classic palette with color column
- [ ] Switch to dark theme
- [ ] Vibrant colors should still look good
- [ ] Labels readable on all colors
- [ ] Progress bars visible

### Progress Bar Contrast
- [ ] With any color palette in dark mode
- [ ] Progress bars should be clearly visible (darker overlay)
- [ ] Progress should be distinguishable from unfilled portion

### Sticky Header
- [ ] Light mode: scroll down, header white
- [ ] Dark mode: scroll down, header dark
- [ ] Switch themes while scrolled - header updates immediately
- [ ] Change view mode while scrolled - header stays themed

### Persistence
- [ ] Set dark theme, refresh - persists
- [ ] Set Auto, change system preference - responds

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit:**
```
feat(v0.9.1): Complete dark mode implementation (#31)

- Add dark theme zoom limit banner styling
- Add button hover/active dark mode states
- Add default tier (no color) dark mode bar colors
- Add pastel palette dark mode overrides (saturated colors)
- Improve progress bar contrast with darker overlay
- Fix sticky header to use CSS variables
- Fix header theme reapplication on view change
- Version bump 0.9.0 → 0.9.1

Fixes #31
```

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions → Reload)
2. Open Gantt chart, switch to Dark theme via dropdown

BUTTONS:
3. Hover over zoom +/- buttons - should show subtle highlight
4. Click buttons - should show visible active state

HEADER:
5. Switch view modes (Day/Week/Month) - header text stays themed
6. Scroll down - sticky header should be dark

DEFAULT BARS (no color column):
7. Remove color column
8. Bars should be dark slate blue, labels white
9. Progress should show as lighter blue intensity

PASTEL PALETTE:
10. Select color column + Pastel palette
11. Colors should be saturated (not washed out)
12. Labels all white, progress visible

ZOOM BANNER:
13. Zoom out to minimum - banner gold/amber (not yellow)

PERSISTENCE:
14. Refresh page - dark theme persists
15. Test Auto mode with system preference
```

---

## Rollback Plan
```bash
git checkout main -- resource/webapp/style.css webapps/gantt-chart/app.js plugin.json
```

---

## Watch Out For
- CSS specificity: Use `.dark-theme .bar-X .bar` pattern consistently
- Don't forget label colors - dark bars need white labels
- Test external labels (`.big` class) - they render outside bars
- Dataiku iframe context - debug logging must be in app.js
- View mode changes recreate DOM - theme must be reapplied
- Button pseudo-classes (`:hover`, `:active`) need separate dark mode overrides
- Progress bar uses `rgba()` - test contrast on all bar colors
- `.bar-wrapper` vs `.bar-group` selectors - check which contains the bar class
