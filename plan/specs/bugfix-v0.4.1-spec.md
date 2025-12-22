# Bugfix v0.4.1 Specification

## Branch
`bugfix/v0.4.1-fix-view-transitions`

## Overview
Fix critical bugs related to view mode transitions where data fails to populate and the timeline jumps to incorrect dates.

---

## Bug 1: Data Fails to Populate on View Transition

### Symptom
When switching between specific views (e.g., Hour → Quarter Day, Half Day → Day), the chart often renders blank or with missing bars.

### Root Cause Analysis
The `view_mode_select` dropdown listener in `frappe-gantt.js` calls:
```javascript
this.change_view_mode(t.value, !0); // !0 = true
```

The second argument (`true`) is `maintain_scroll`. When set to `true`:
1. It saves the current pixel scroll position (`scrollLeft`).
2. **Crucially, it passes `true` to `setup_dates(true)`.**
3. Inside `setup_gantt_dates(true)`, the logic to recalculate `gantt_start` and `gantt_end` is **skipped**.

```javascript
// frappe-gantt.es.js
setup_gantt_dates(t) {
  // ...
  if (!t) { // Only recalculate if t is false
     // Recalculate gantt_start/end based on new unit/padding
  }
}
```

By skipping this recalculation, the chart attempts to render the new view mode (e.g., "Day") using the time boundaries calculated for the previous mode (e.g., "Hour"). This mismatches the grid generation and bar placement logic, causing rendering failures.

### Fix
Change the event listener to call `change_view_mode(t.value)` (omitting the second argument, which defaults to `false`). This forces `gantt_start` and `gantt_end` to be correctly recalculated for the new view scale.

---

## Bug 2: Cursor/Scroll Position on Mode Switch

### Symptom
Switching view modes leaves the chart at a random date instead of snapping to Today or the previous center date.

### Root Cause
The same `maintain_scroll=true` logic restores the **pixel** scroll position (`scrollLeft`).
*   Example: User is at pixel 1000 in "Day" view (representing ~1 month in).
*   User switches to "Year" view.
*   The code restores scroll to pixel 1000. In "Year" view, pixel 1000 might be 10 years in the future.
*   Result: User loses their place.

### Fix
By removing the `true` argument (as proposed above), the `maintain_scroll` logic is disabled. The chart will fall back to `options.scroll_to` behavior (defaulting to 'today'), which is the desired UX.

---

## Fix Plan

### Step 1: Update ES Module
**File:** `resource/frappe-gantt.es.js`
Remove `!0` from `change_view_mode` call in the event listener.

### Step 2: Update UMD Module
**File:** `resource/frappe-gantt.umd.js`
Remove `!0` from `change_view_mode` call in the event listener.

### Step 3: Version Bump
**File:** `plugin.json`
Bump version from `0.4.0` to `0.4.1`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `resource/frappe-gantt.es.js` | Edit | Remove `!0` from `change_view_mode` call in event listener |
| `resource/frappe-gantt.umd.js` | Edit | Remove `!0` from `change_view_mode` call in event listener |
| `plugin.json` | Edit | Version bump to 0.4.1 |

---

## Testing Checklist

- [ ] Load chart with tasks
- [ ] Switch from Week -> Month
    - [ ] Verify bars appear
    - [ ] Verify chart scrolls to Today (not random date)
- [ ] Switch from Month -> Year
    - [ ] Verify bars appear
    - [ ] Verify chart scrolls to Today
- [ ] Switch from Week -> Day -> Hour
    - [ ] Verify bars appear at each step
- [ ] Verify "Today" button works in all views

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files. If changes aren't committed, the user will test against old code.

**Pre-QA Commit Process:**
1. After implementing the fix, **commit the changes** with appropriate message format:
   ```
   bugfix(v0.4.1): Fix view transitions and scroll position

   Removes the `maintain_scroll` flag when switching views to force 
   date recalculation and proper scroll snapping.

   Changes:
   - resource/frappe-gantt.es.js: Remove !0 argument
   - resource/frappe-gantt.umd.js: Remove !0 argument
   - plugin.json: Bump version to 0.4.1

   Fixes issues where data failed to populate on view switch and 
   timeline jumped to incorrect dates.

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
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
1. Reload the plugin in Dataiku
2. Open the Gantt Chart webapp
3. Switch from "Week" view to "Month" view
   - VERIFY: Bars are visible
   - VERIFY: Chart centers on Today (or near tasks)
4. Switch from "Month" to "Year" view
   - VERIFY: Bars are visible
   - VERIFY: Chart centers on Today
5. Switch from "Week" to "Day" -> "Half Day" -> "Quarter Day" -> "Hour"
   - VERIFY: Data remains visible at every step
   - VERIFY: No blank chart errors
```

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan

If issues occur:
```bash
git checkout main -- resource/frappe-gantt.es.js
git checkout main -- resource/frappe-gantt.umd.js
git checkout main -- plugin.json
```

---

## Watch Out For

1. **Minified Code:** Be careful when editing `frappe-gantt.umd.js`. Use strict string matching.
2. **Cache:** User must hard refresh (Ctrl+Shift+R) after plugin reload to pick up new JS resources.