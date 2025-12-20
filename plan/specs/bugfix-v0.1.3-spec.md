# Bugfix v0.1.3 Specification

## Branch
`bugfix/v0.1.3`

## Overview
Remediate race condition caused by dual execution of app.js files. Standardize on `webapps/gantt-chart/app.js` and remove deprecated `resource/webapp/app.js`.

---

## Bug: Dual app.js Execution Race Condition

### Symptom
Two instances of the Gantt chart initialization code execute simultaneously, causing:
- Unpredictable behavior when settings change
- Potential double renders
- Console showing two sets of "Gantt Chart webapp initializing..." logs

### Root Cause
Two JavaScript files with identical code are both loading:

1. **`webapps/gantt-chart/app.js`** - Auto-loaded by Dataiku (standard webapp behavior)
2. **`resource/webapp/app.js`** - Explicitly loaded via `body.html` line 13

Both scripts register separate `message` event listeners and attempt to initialize the Gantt chart independently.

### Evidence
In `webapps/gantt-chart/body.html`:
```html
<script src="/plugins/gantt-chart/resource/webapp/dku-helpers.js"></script>
<script src="/plugins/gantt-chart/resource/webapp/app.js"></script>  <!-- PROBLEM -->
```

### Historical Context
Originally, `resource/webapp/app.js` was the primary location (v0.0.x). The codebase has since evolved to treat `webapps/gantt-chart/app.js` as the canonical version. During v0.1.2, both files were synced with identical code, but the `body.html` reference was never removed, causing both to execute.

---

## Fix Plan

### Step 1: Remove Duplicate Script Reference
**File:** `webapps/gantt-chart/body.html`

**Current (line 13):**
```html
<script src="/plugins/gantt-chart/resource/webapp/app.js"></script>
```

**Action:** Delete this line.

**Resulting body.html:**
```html
<link rel="stylesheet" href="/plugins/gantt-chart/resource/frappe-gantt.css">
<link rel="stylesheet" href="/plugins/gantt-chart/resource/webapp/style.css">

<div id="gantt-container"></div>

<div id="loading" class="loading-overlay">
    <div class="spinner"></div>
    <p>Loading Gantt chart...</p>
</div>

<script src="/plugins/gantt-chart/resource/frappe-gantt.umd.js"></script>
<script src="/plugins/gantt-chart/resource/webapp/dku-helpers.js"></script>
```

**Rationale:** Dataiku auto-loads `webapps/gantt-chart/app.js`. The explicit script tag is redundant and causes the race condition.

### Step 2: Verify Load Order
Confirm that after the change, scripts load in correct order:
1. `frappe-gantt.umd.js` - Frappe Gantt library
2. `dku-helpers.js` - Defines `dataiku.webappBackend`
3. `app.js` (auto-loaded by Dataiku) - Main webapp logic

The `dku-helpers.js` must load before `app.js` because `app.js` uses `dataiku.webappBackend.get()`.

### Step 3: Manual Testing
1. Hard refresh browser (Ctrl+Shift+R)
2. Open developer console
3. Verify only ONE "Gantt Chart webapp initializing..." message
4. Verify only ONE "Rendering Gantt with X tasks" message per config change
5. Test all appearance settings update correctly

### Step 4: Delete Deprecated File
**File:** `resource/webapp/app.js`

**Action:** Delete this file.

**Rationale:** After confirming the webapp works correctly with only `webapps/gantt-chart/app.js`, the duplicate file should be removed to prevent future confusion.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/body.html` | Edit | Remove line 13 (script reference to resource/webapp/app.js) |
| `resource/webapp/app.js` | Delete | Remove deprecated duplicate file |
| `plugin.json` | Edit | Version bump to 0.1.3 |

## Files to Keep (No Changes)

| File | Reason |
|------|--------|
| `webapps/gantt-chart/app.js` | Canonical app code, auto-loaded by Dataiku |
| `resource/webapp/dku-helpers.js` | Still needed for `dataiku.webappBackend` helper |
| `resource/webapp/style.css` | Webapp styles, still referenced in body.html |
| `resource/frappe-gantt.umd.js` | Frappe Gantt library |
| `resource/frappe-gantt.css` | Frappe Gantt styles |

---

## Testing Checklist

After implementation:
- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Console shows only ONE "Gantt Chart webapp initializing..." on load
- [ ] Console shows only ONE "Rendering Gantt with X tasks" per config change
- [ ] Bar Height changes update visually
- [ ] Column Width changes update visually
- [ ] View mode switching works (Week, Day, Hour)
- [ ] Tasks remain visible in all view modes
- [ ] No JavaScript errors in console
- [ ] Unit tests pass (90/90)

---

## Rollback Plan

If issues occur:
1. Restore `resource/webapp/app.js` from git: `git checkout HEAD~1 -- resource/webapp/app.js`
2. Restore body.html script tag
3. Investigate root cause before re-attempting

---

## Watch Out For

1. **Script Load Order**: `dku-helpers.js` MUST load before `app.js`. The body.html still references it, ensuring correct order.

2. **Browser Cache**: After changes, hard refresh (Ctrl+Shift+R) is required to clear cached scripts.

3. **Dataiku Reload**: May need to reload the plugin from Dataiku's Actions menu.

4. **Do Not Delete dku-helpers.js**: This file is still required. Only `resource/webapp/app.js` should be deleted.
