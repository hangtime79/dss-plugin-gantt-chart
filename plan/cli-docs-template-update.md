# CLI Docs Template Update

This file captures new learnings during development. Once validated, integrate into the appropriate `cli-docs/` file and remove from here.

**Workflow:**
1. Add new learnings below using the exemplary format
2. After integration into `cli-docs/`, delete the learning from this file
3. Keep this file as a staging area for future discoveries

---

## Exemplary Example (Do Not Delete)

This section demonstrates the ideal format for new learnings. It stays here permanently as a reference.

### Context
Initializing a Dataiku webapp that uses dashboard filters.

### The Problem
`dataiku.getWebAppConfig()` is a synchronous call that returns the webapp's configuration object. However, this object **does not** contain the current state of Dataiku filters. Using it to initialize your chart will result in a "flash of unfiltered content" where the chart renders all data before filters are applied.

### The Solution
Do **not** use `dataiku.getWebAppConfig()` for the initial render if your webapp depends on filters. Instead, use the `postMessage` flow to request the full configuration from the parent frame, which includes both the config object and the filter state.

### Implementation

```javascript
// BAD - Renders immediately with empty filters
const config = dataiku.getWebAppConfig()['webAppConfig'];
initializeChart(config, []); // Filters are missing!

// GOOD - Waits for parent to provide config AND filters
showLoading();
window.parent.postMessage("sendConfig", "*");

window.addEventListener('message', function(event) {
    if (event.data) {
        const data = JSON.parse(event.data);
        const config = data['webAppConfig'];
        const filters = data['filters']; // Correct filter state available here
        initializeChart(config, filters);
    }
});
```

### Verification
1. Load the webapp with active filters
2. Verify the chart renders filtered data immediately (no flash of all data)
3. Verify the loading spinner is shown while waiting for the `message` event

### Related
- Integrated into: `cli-docs/guides/webapps.md` → "Filter State Initialization"

---

## New Learnings (To Be Integrated)

<!--
Add new learnings below following the exemplary format above.
Each learning should have:
- Context: When would a developer encounter this?
- The Problem: What goes wrong? Error messages, symptoms
- The Solution: Clear explanation of correct approach
- Implementation: Code example if applicable
- Verification: How to confirm the solution works
- Related: Links to relevant docs (added after integration)
-->

### Context
Handling view mode changes in frappe-gantt's `on_view_change` callback.

### The Problem
The `mode` parameter passed to `on_view_change` is an **object** `{name: "Week", padding: "2m", step: "1m", ...}`, not a string. Saving this directly to localStorage results in `[object Object]` which fails validation on reload, causing errors like `TypeError: can't access property "name", t is undefined` when frappe-gantt tries to use the invalid view mode.

### The Solution
Extract the `name` property from the mode object before using it as a string value.

### Implementation

```javascript
// BAD - mode is an object, not a string
on_view_change: function(mode) {
    localStorage.setItem('viewMode', mode); // Stores "[object Object]"
}

// GOOD - Extract mode.name for the string value
on_view_change: function(mode) {
    const viewModeName = typeof mode === 'string' ? mode : mode.name;
    localStorage.setItem('viewMode', viewModeName); // Stores "Week"
}
```

### Verification
1. Change view mode in the Gantt chart
2. Check browser console - should log the string "Week" not an object
3. Check localStorage in DevTools - value should be "Week" not "[object Object]"
4. Refresh page - view mode should persist correctly

### Related
- To be integrated into: `cli-docs/reference/frappe-gantt.md` → "Callbacks" section

---
