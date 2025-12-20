# Bugfix v0.2.2 Specification

## Branch
`bugfix/v0.2.2-fix-filter-init-race`

## Overview
Fix race condition where Dataiku filters are not applied on initial webapp load. Filters only take effect after user clicks on a filter.

---

## Bug: Filters Not Applied on Initial Load

### Symptom
When the webapp first loads:
- All configuration (columns, view mode, etc.) appears correctly applied
- Dataiku filters are **ignored** - chart shows unfiltered data
- Clicking any filter causes filters to suddenly apply correctly
- This only occurs on initial load, not on subsequent filter changes

### Root Cause
In `webapps/gantt-chart/app.js`, the initialization sequence renders the chart **before** receiving filter state from the parent frame.

**Current flow (lines 65-78):**
1. Webapp finds synchronous config via `dataiku.getWebAppConfig()`
2. Immediately calls `initializeChart(webAppConfig, [])` with **empty filters**
3. Chart renders with all data (unfiltered)
4. Then requests config from parent via `postMessage("sendConfig")`
5. Parent responds with config AND filters, but chart already rendered

The synchronous config from `dataiku.getWebAppConfig()` does **not** include filter state. Filter state only comes from the parent frame's message response.

### Evidence
```javascript
// Line 71 - renders with empty filters before parent responds
initializeChart(webAppConfig, []);

// Line 78 - requests config AFTER already rendering
window.parent.postMessage("sendConfig", "*");
```

---

## Fix Plan

### Step 1: Remove Premature Render
**File:** `webapps/gantt-chart/app.js`

Remove the synchronous initialization block that renders with empty filters. Instead, only request config from parent and wait for the message response (which includes filters).

**Current (lines 65-74):**
```javascript
try {
    // 1. Try to initialize immediately with synchronous config
    if (webAppConfig && Object.keys(webAppConfig).length > 0) {
        console.log('Found synchronous config, initializing...', webAppConfig);
        try {
            validateConfig(webAppConfig);
            initializeChart(webAppConfig, []);
        } catch (e) {
            console.warn('Initial config validation failed:', e);
        }
    }

    // 2. Request config from parent frame
    window.parent.postMessage("sendConfig", "*");
} catch (e) {
    console.error('Initialization error:', e);
}
```

**Change to:**
```javascript
try {
    // Request config from parent frame - this includes filter state
    // Do NOT render with synchronous config because it lacks filter state.
    // The parent frame response includes both webAppConfig AND filters.
    showLoading();
    window.parent.postMessage("sendConfig", "*");
} catch (e) {
    console.error('Initialization error:', e);
}
```

**Rationale:** The message event listener (lines 77-94) already handles the parent response and calls `initializeChart(webAppConfig, filters)` with proper filter state. We just need to stop the premature render.

### Step 2: Version Bump
**File:** `plugin.json`

Change version from `0.2.1` to `0.2.2`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/app.js` | Edit | Remove synchronous init block, keep only `postMessage` request |
| `plugin.json` | Edit | Version bump to 0.2.2 |

---

## Testing Checklist

After implementation:
- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Set a filter in Dataiku filter panel before refreshing
- [ ] Refresh page - filters should be applied on initial load
- [ ] Chart shows filtered data immediately (not all data)
- [ ] Changing filters still works correctly
- [ ] Loading spinner shows while waiting for parent response
- [ ] No JavaScript errors in console
- [ ] Unit tests pass

---

## User QA Gate

**STOP: Do not commit or merge until user has completed QA.**

After implementing the fix:
1. Notify the user that the fix is ready for QA
2. Provide clear steps for the user to test in their Dataiku environment
3. Wait for explicit user approval before proceeding
4. If user reports issues, address them before continuing

**QA Script for User:**
```
1. Reload the plugin in Dataiku (Actions menu > Reload)
2. Open the Gantt Chart webapp
3. Apply a filter (e.g., filter to specific status or date range)
4. Hard refresh the page (Ctrl+Shift+R)
5. Verify: Does the chart show filtered data immediately on load?
6. Verify: Do filter changes still work correctly?
```

**Do not proceed to commit until user confirms the fix works.**

---

## Rollback Plan

If issues occur:
1. Restore `app.js` from git: `git checkout HEAD~1 -- webapps/gantt-chart/app.js`
2. Investigate root cause before re-attempting

---

## Watch Out For

1. **Loading State**: The fix shows loading spinner until parent responds. If parent never responds, user sees infinite loading. This matches existing behavior for missing config.

2. **Browser Cache**: Hard refresh (Ctrl+Shift+R) required after changes.

3. **Function Hoisting**: `showLoading()` is defined later in the file but JavaScript hoists function declarations, so this is safe.
