# Bugfix v0.9.3 Specification

## Branch
`bugfix/v0.9.3-header-contrast`

## Linked Issues
- Fixes #71 - Fix header styling contrast issues in Light and Dark modes

## Overview
Fix two CSS contrast issues in Gantt chart header highlights that make text unreadable in certain theme/state combinations.

---

## Bug #1: Light Mode Current Date Highlight Contrast

### Symptom
The lower header element for the current date has dark text on a dark background, making it unreadable.

### Root Cause
1. **Library CSS** defines `.current-date-highlight` with:
   ```css
   .current-date-highlight {
       background: var(--g-today-highlight);  /* #37352f (dark) */
       color: var(--g-text-light);            /* #fff (white) */
   }
   ```
   This is correct: white text on dark background.

2. **Our override** in `style.css` (lines 929-936):
   ```css
   .gantt-container .lower-text {
       fill: var(--text-main) !important;
       color: var(--text-main) !important;
   }
   ```
   `--text-main` in light mode = `#2d3436` (dark text)

3. **Result**: Our rule with `!important` overrides the library's white text, causing dark text on dark background.

### Evidence
Screenshot: `cli-docs/investigation/light-header-task-hover-text-color.png`

---

## Bug #2: Dark Mode Task Hover Date Range Highlight

### Symptom
When hovering over a task in dark mode, the corresponding date range in the header is highlighted with a light background and light text, causing poor contrast.

### Root Cause
1. **Library CSS** defines `.date-range-highlight` with:
   ```css
   .date-range-highlight {
       background-color: var(--g-progress-color);  /* #dbdbdb (light gray) */
   }
   ```

2. **Our dark mode** sets `--text-main: #ecf0f1` (white text) via `.dark-theme` rules.

3. **Missing override**: We don't override `--g-progress-color` or `.date-range-highlight` background in dark mode.

4. **Result**: White text on light gray background = nearly invisible.

### Evidence
Screenshot: `cli-docs/investigation/dark-header-task-hover-text-color.png`

---

## Fix Plan

### Step 1: Fix Light Mode Current Date Text
**File:** `resource/webapp/style.css`

Add after `.gantt-container .lower-text` rules (~line 936):

```css
/* Fix: Current date highlight needs white text on dark background (#71) */
.gantt-container .lower-text.current-date-highlight {
    color: #ffffff !important;
    fill: #ffffff !important;
}
```

**Rationale:** Higher specificity rule overrides our general `.lower-text` rule while preserving the library's intended white-on-dark styling for the current date.

### Step 2: Fix Dark Mode Date Range Highlight
**File:** `resource/webapp/style.css`

Add in dark mode overrides section (~after line 1100, near other `.dark-theme` rules):

```css
/* Fix: Task hover date range highlight needs dark background in dark mode (#71) */
.dark-theme .gantt-container .date-range-highlight {
    background-color: rgba(255, 255, 255, 0.15);
}
```

**Rationale:** Semi-transparent white provides subtle highlight while maintaining contrast with white text in dark mode.

### Step 3: Version Bump
**File:** `plugin.json`

Change: `"version": "0.9.2"` → `"version": "0.9.3"`

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `resource/webapp/style.css` | Modify | Add 2 CSS rules for contrast fixes |
| `plugin.json` | Modify | Version 0.9.2 → 0.9.3 |

---

## Testing Checklist

- [ ] Light mode: Current date (today) shows white text on dark background
- [ ] Light mode: Non-current dates show dark text on light background (unchanged)
- [ ] Dark mode: Current date shows white text on dark background
- [ ] Dark mode: Non-current dates show white text on dark background (unchanged)
- [ ] Light mode: Hovering over task shows readable date range highlight in header
- [ ] Dark mode: Hovering over task shows readable date range highlight in header
- [ ] Theme toggle works correctly between light and dark modes
- [ ] No visual regressions in other header elements

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing fixes, commit with:
   ```
   fix(v0.9.3): Fix header contrast issues in light and dark modes (#71)

   - Add white text override for current date highlight in light mode
   - Add dark background for date range highlight in dark mode

   Fixes #71

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```
2. Verify: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open a Gantt chart

LIGHT MODE TEST:
3. Ensure you're in light mode (default)
4. VERIFY: Today's date in lower header has WHITE text on DARK background
5. VERIFY: Other dates have dark text on light background
6. Hover over a task bar
7. VERIFY: The highlighted date range in header is readable (good contrast)

DARK MODE TEST:
8. Toggle to dark mode
9. VERIFY: Today's date in lower header has WHITE text on DARK background
10. VERIFY: Other dates have light text on dark background
11. Hover over a task bar
12. VERIFY: The highlighted date range in header has DARK/MUTED background
13. VERIFY: Text is readable (white on darker background, not white on light gray)

TOGGLE TEST:
14. Switch between light and dark modes several times
15. VERIFY: No visual glitches or stuck states

Report: PASS or describe any issues observed.
```

**Do not proceed to PR/merge until user confirms fixes work.**

---

## Rollback Plan

If issues arise:
1. Remove the two new CSS rules added in Step 1 and Step 2
2. Revert version to 0.9.2
3. Header will return to previous (broken) contrast behavior

CSS-only change makes rollback trivial.

---

## Watch Out For

1. **Specificity wars:** Both fixes use `!important`. This is intentional to override existing `!important` rules. Don't remove `!important` or fixes won't apply.

2. **Other highlight states:** Verify no other elements use `.current-date-highlight` or `.date-range-highlight` classes that could be affected.

3. **CSS variable inheritance:** The dark mode fix uses `rgba()` directly rather than a CSS variable because `--g-progress-color` is used elsewhere and shouldn't be globally overridden.

4. **Browser compatibility:** `rgba()` has broad support. No concerns expected.

---

## Spec Complete

**Ready for SDE implementation.**

The SDE should:
1. Add the current date highlight fix (Step 1)
2. Add the dark mode date range fix (Step 2)
3. Bump version (Step 3)
4. Commit and request User QA
5. Do NOT proceed past QA gate without user approval
