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
