# Feature v0.4.3 Specification: Header Enhancements

## Branch
`feature/v0.4.3-header-enhancements`

## Linked Issues
- Fixes #14 - Upper elements decade format (Year view)
- Fixes #13 - Month letter visibility at narrow widths
- Fixes #12 - Year in upper headers across views
- Fixes #16 - Persist view mode state (localStorage with hashed key)

## Overview

Four enhancements for the Gantt chart:
1. **Decade Grouping** - Show decades (2020s, 2030s) in Year view upper headers
2. **Month Abbreviations** - Verify/improve single-letter month display at narrow widths
3. **Year Context** - Add year to upper headers in Day/Week/Month views
4. **View Mode Persistence** - Remember user's view mode per chart using localStorage

---

## Feature 1: Decade Format in Year View (#14)

### Symptom
In Year view, upper headers show individual years (2020, 2021, 2022...) which is visually cluttered.

### Root Cause
`formatYearLabels()` (lines 300-334) formats years but does not group them into decades.

### Solution
Modify `formatYearLabels()` to display decade labels in upper headers. Show "2020s" instead of individual years.

---

## Fix Plan: Decade Format

### Step 1: Update formatYearLabels Function
**File:** `webapps/gantt-chart/app.js`

Replace the `formatYearLabels()` function (~lines 300-334):

```javascript
/**
 * Format Year mode labels.
 * Upper text: Show decade (2020s, 2030s) instead of individual years
 * Lower text:
 *   >= 34: Full year "2024"
 *   < 34: 2-digit "24"
 */
function formatYearLabels(columnWidth) {
    // Upper text: Show decades
    const upperTexts = document.querySelectorAll('.upper-text');
    const seenDecades = new Set();

    upperTexts.forEach(text => {
        const original = text.textContent.trim();
        const yearMatch = original.match(/(\d{4})/);
        if (!yearMatch) return;

        const year = parseInt(yearMatch[1], 10);
        const decade = Math.floor(year / 10) * 10;
        const decadeLabel = `${decade}s`;

        // Only show decade label once per decade (first occurrence)
        if (!seenDecades.has(decade)) {
            seenDecades.add(decade);
            text.textContent = decadeLabel;
        } else {
            // Hide duplicate decade labels
            text.textContent = '';
        }
    });

    // Lower text: Individual years with responsive formatting
    const lowerTexts = document.querySelectorAll('.lower-text');
    lowerTexts.forEach(text => {
        const original = text.textContent.trim();
        const yearMatch = original.match(/(\d{4})/);
        if (!yearMatch) return;

        const fullYear = yearMatch[1];

        if (columnWidth >= 34) {
            text.textContent = fullYear;
        } else {
            // 2-digit year
            text.textContent = fullYear.slice(-2);
        }
    });
}
```

---

## Feature 2: Month Letter Visibility (#13)

### Current Implementation
`formatMonthLabels()` (lines 254-293) already implements responsive abbreviations:
- >= 75px: Full month name ("January")
- >= 39px: 3-letter ("Jan")
- < 39px: 1-letter ("J")

### Verification Required
Test at various column widths to confirm single-letter abbreviations appear correctly at narrow widths. If working, mark as verified. If not, adjust thresholds.

### Potential Enhancement
The single-letter abbreviation array `MONTH_NAMES_1` has duplicate letters:
- 'J' for January, June, July
- 'M' for March, May
- 'A' for April, August

If this causes confusion, consider unique identifiers or skip implementing unique letters (user is expected to use wider columns for clarity).

**Decision:** Keep current implementation unless user reports confusion. The context from surrounding labels provides disambiguation.

---

## Feature 3: Year in Upper Headers (#12)

### Symptom
In Day and Week views, the upper header may not show year context, making it hard to identify dates spanning year boundaries.

### Root Cause
`adjustHeaderLabels()` only calls format functions for Week, Month, and Year views. Day view has no formatting. Additionally, upper headers in Week view may show months without year context.

### Solution
Add year display to upper headers for Day and Week views. Modify `adjustHeaderLabels()` to ensure year is visible.

---

## Fix Plan: Year in Upper Headers

### Step 1: Add formatDayLabels Function
**File:** `webapps/gantt-chart/app.js`

Add new function after `formatWeekLabels()`:

```javascript
/**
 * Format Day mode labels.
 * Ensure upper headers show "Month Year" (e.g., "December 2024")
 */
function formatDayLabels(columnWidth) {
    const upperTexts = document.querySelectorAll('.upper-text');

    upperTexts.forEach(text => {
        const original = text.textContent.trim();

        // If already has year, skip
        if (/\d{4}/.test(original)) return;

        // Try to parse month and add current year context
        // Frappe Gantt Day view upper text typically shows month names
        for (let i = 0; i < MONTH_NAMES_FULL.length; i++) {
            if (original.toLowerCase().includes(MONTH_NAMES_FULL[i].toLowerCase()) ||
                original.toLowerCase().startsWith(MONTH_NAMES_3[i].toLowerCase())) {
                // Add year - need to derive from task data or current date
                // For now, append current year as fallback
                // TODO: Derive year from date context if available
                const year = new Date().getFullYear();
                if (columnWidth >= 80) {
                    text.textContent = `${MONTH_NAMES_FULL[i]} ${year}`;
                } else {
                    text.textContent = `${MONTH_NAMES_3[i]} ${year}`;
                }
                break;
            }
        }
    });
}
```

### Step 2: Enhance formatWeekLabels for Year Context
**File:** `webapps/gantt-chart/app.js`

Update `formatWeekLabels()` to add year to upper headers:

```javascript
/**
 * Format Week mode labels.
 * Lower text:
 *   >= 50: "03 - 10" (day range, no months)
 *   < 50: "03" (first day only)
 * Upper text: Ensure "Month Year" format
 */
function formatWeekLabels(columnWidth) {
    // Lower text: Day ranges
    const lowerTexts = document.querySelectorAll('.lower-text');

    lowerTexts.forEach((text) => {
        const original = text.textContent.trim();

        if (columnWidth < 50) {
            const match = original.match(/^(\d{1,2})/);
            if (match) {
                text.textContent = match[1].padStart(2, '0');
            }
        } else {
            const rangeMatch = original.match(/^(\d{1,2})\s*[A-Za-z]*\s*-\s*(\d{1,2})/);
            if (rangeMatch) {
                const startDay = rangeMatch[1].padStart(2, '0');
                const endDay = rangeMatch[2].padStart(2, '0');
                text.textContent = `${startDay} - ${endDay}`;
            }
        }
    });

    // Upper text: Ensure year is shown
    const upperTexts = document.querySelectorAll('.upper-text');
    upperTexts.forEach(text => {
        const original = text.textContent.trim();

        // If already has year (4 digits), skip
        if (/\d{4}/.test(original)) return;

        // Try to find month and add year
        for (let i = 0; i < MONTH_NAMES_FULL.length; i++) {
            if (original.toLowerCase().includes(MONTH_NAMES_FULL[i].toLowerCase()) ||
                original.toLowerCase().startsWith(MONTH_NAMES_3[i].toLowerCase())) {
                const year = new Date().getFullYear();
                text.textContent = `${MONTH_NAMES_3[i]} ${year}`;
                break;
            }
        }
    });
}
```

### Step 3: Update adjustHeaderLabels Switch
**File:** `webapps/gantt-chart/app.js`

Add Day view formatting in `adjustHeaderLabels()` (~line 188):

**Before:**
```javascript
switch (viewMode) {
    case 'Week':
        formatWeekLabels(columnWidth);
        break;
    case 'Month':
        formatMonthLabels(columnWidth);
        break;
    case 'Year':
        formatYearLabels(columnWidth);
        break;
    default:
        // Hour, Quarter Day, Half Day, Day - no special formatting needed
        break;
}
```

**After:**
```javascript
switch (viewMode) {
    case 'Day':
        formatDayLabels(columnWidth);
        break;
    case 'Week':
        formatWeekLabels(columnWidth);
        break;
    case 'Month':
        formatMonthLabels(columnWidth);
        break;
    case 'Year':
        formatYearLabels(columnWidth);
        break;
    default:
        // Hour, Quarter Day, Half Day - no special formatting needed
        break;
}
```

---

## Feature 4: View Mode Persistence (#16)

### Problem Statement
User changes view mode (e.g., Week → Month) and refreshes page. View mode resets to default. User wants per-chart persistence.

### Investigation Summary
- Dataiku's server-side persistence (`/dip/api/explores/save`) requires full 65KB explore state
- Webapp iframe cannot access this endpoint directly
- No write-back API available from webapp JS

### Chosen Solution: localStorage with Hashed Key
Browser-local persistence with security considerations:
- **Value stored**: Only view mode string ("Day", "Week", "Month", "Year")
- **Key format**: `gantt-vm-{hash}` where hash is derived from dataset name
- **Security**: Dataset name hashed to prevent information leakage in DevTools

### Implementation

#### Step 1: Add Hash Function
**File:** `webapps/gantt-chart/app.js`

Add near top of file (after constants):

```javascript
/**
 * Simple hash function for localStorage key generation.
 * Hashes dataset name to prevent information leakage in browser storage.
 * Uses djb2 algorithm - fast, deterministic, not reversible.
 */
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}

/**
 * Get localStorage key for view mode persistence.
 * Key is opaque (hashed) to protect dataset name privacy.
 */
function getViewModeStorageKey(datasetName) {
    return `gantt-vm-${hashString(datasetName || 'default')}`;
}
```

#### Step 2: Load Saved View Mode on Init
**File:** `webapps/gantt-chart/app.js`

In `initializeGantt()`, before creating the Gantt instance, check for saved view mode:

```javascript
// Load persisted view mode (localStorage, per-chart)
const storageKey = getViewModeStorageKey(webAppConfig.dataset);
const savedViewMode = localStorage.getItem(storageKey);
const initialViewMode = savedViewMode || webAppConfig.viewMode || 'Week';
```

Use `initialViewMode` when creating the Gantt instance instead of `webAppConfig.viewMode`.

#### Step 3: Save View Mode on Change
**File:** `webapps/gantt-chart/app.js`

In the `on_view_change` callback, save the new view mode:

```javascript
on_view_change: function(mode) {
    // Persist view mode to localStorage
    const storageKey = getViewModeStorageKey(webAppConfig.dataset);
    localStorage.setItem(storageKey, mode);

    // ... existing code ...
}
```

### Limitations
- Browser-local only (per-browser, per-machine)
- Clears if user clears browser data
- Not shared with other users
- Server-side persistence requires Dataiku sidebar config changes

---

## Step N: Version Bump
**File:** `plugin.json`

Change version from `0.4.2` to `0.4.3`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/app.js` | Edit | Add localStorage persistence, update label formatters |
| `plugin.json` | Edit | Version 0.4.2 → 0.4.3 |

---

## Testing Checklist

### Decade Format in Year View (#14)
- [ ] Switch to Year view
- [ ] EXPECTED: Upper headers show "2020s", "2030s" etc.
- [ ] EXPECTED: Lower headers show individual years "2024", "2025"
- [ ] At narrow column width: years show as "24", "25"

### Month Letter Visibility (#13)
- [ ] Set column width to < 39px in Month view
- [ ] EXPECTED: Month labels show single letters (J, F, M, A, M, J, J, A, S, O, N, D)
- [ ] Set column width to >= 39px
- [ ] EXPECTED: Month labels show 3-letter abbreviations
- [ ] Set column width to >= 75px
- [ ] EXPECTED: Month labels show full names

### Year in Upper Headers (#12)
- [ ] Switch to Day view
- [ ] EXPECTED: Upper headers show "Month Year" format (e.g., "Dec 2024")
- [ ] Switch to Week view
- [ ] EXPECTED: Upper headers show month with year
- [ ] Verify Month view (should already show years)
- [ ] EXPECTED: Upper headers in Month view show years

### View Mode Persistence (#16)
- [ ] Change view mode (e.g., Week → Month)
- [ ] Refresh the page (F5)
- [ ] EXPECTED: View mode remains at Month (not reset to default)
- [ ] Open a different Gantt chart (different dataset)
- [ ] EXPECTED: Different chart has its own saved view mode
- [ ] Open DevTools → Application → Local Storage
- [ ] EXPECTED: Key shows "gantt-vm-{hash}" (no dataset name visible)

### Regression Checks
- [ ] All view modes render correctly
- [ ] Sticky header still works
- [ ] Debouncing still works (rapid config changes)
- [ ] Today button works in all views
- [ ] Tooltips work correctly

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files. If changes aren't committed, the user will test against old code.

**Pre-QA Commit Process:**
1. After implementing the features, **commit the changes** with:
   ```
   feat(v0.4.3): Header enhancements and view mode persistence

   Implements four improvements:
   - Decade grouping: Year view upper headers show "2020s", "2030s" instead of individual years
   - Month abbreviations: Verified single-letter display at narrow column widths
   - Year context: Day and Week view upper headers now show year with month
   - View mode persistence: Remembers user's view mode per chart using localStorage

   Security: Dataset names are hashed in localStorage keys to prevent information leakage.
   Limitation: Persistence is browser-local only; server-side requires Dataiku sidebar config.

   Fixes #14
   Fixes #13
   Fixes #12
   Fixes #16

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```

2. Verify commit was successful: `git log --oneline -1`

3. Notify the user that code is committed and ready for QA

**User QA Steps:**
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Provide clear steps for the user to test
3. Wait for explicit user approval before proceeding
4. If user reports issues, address them and commit again before re-testing

**QA Script for User:**
```
1. DECADE FORMAT TEST (Year View)
   - Switch to Year view
   - EXPECTED: Upper headers show "2020s", "2030s" (decades)
   - EXPECTED: Lower headers show "2024", "2025" (individual years)

2. MONTH ABBREVIATION TEST
   - Switch to Month view
   - Adjust "Column Width" to 30px
   - EXPECTED: Month labels show single letters (J, F, M...)
   - Adjust "Column Width" to 50px
   - EXPECTED: Month labels show 3-letter abbreviations (Jan, Feb...)

3. YEAR CONTEXT TEST
   - Switch to Day view
   - EXPECTED: Upper headers show "Dec 2024" or similar (month + year)
   - Switch to Week view
   - EXPECTED: Upper headers include year with month

4. VIEW MODE PERSISTENCE TEST
   - Change view mode to Month
   - Refresh the page (F5 or browser refresh)
   - EXPECTED: View mode stays at Month (not reset to default)
   - Optional: Open DevTools → Application → Local Storage
   - EXPECTED: Key shows "gantt-vm-{hash}" (dataset name NOT visible)

5. REGRESSION CHECK
   - Verify sticky header works when scrolling
   - Verify Today button works
   - Switch between all view modes
   - EXPECTED: No errors, smooth transitions
```

**Do not proceed to PR/merge until user confirms all features work.**

---

## Rollback Plan

If issues occur:

```bash
# Revert specific files
git checkout main -- webapps/gantt-chart/app.js
git checkout main -- plugin.json
```

---

## Watch Out For

1. **Year Derivation**: The year added to Day/Week headers uses `new Date().getFullYear()` as fallback. This may be incorrect for tasks spanning multiple years. Frappe Gantt should ideally provide date context.

2. **Decade Label Positioning**: Hiding duplicate decade labels with empty string may cause visual gaps. Monitor for layout issues.

3. **Threshold Tuning**: The column width thresholds (34px, 39px, 50px, 75px) are estimates. May need adjustment based on actual font rendering.

4. **View Mode Case Sensitivity**: Frappe Gantt view modes are case-sensitive ("Week" not "week").

---

## Architecture Notes

### Header Label Flow
```
Frappe Gantt renders → requestAnimationFrame → adjustHeaderLabels() → format*Labels()
```

The label formatting runs after each:
1. Initial chart render
2. View mode change (`on_view_change` callback)

### Decade Grouping Logic
```javascript
const decade = Math.floor(year / 10) * 10;  // 2024 → 2020
const decadeLabel = `${decade}s`;            // "2020s"
```

Only the first occurrence of each decade shows the label; subsequent years in the same decade show empty text to avoid repetition.
