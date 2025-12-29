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

### Context
Adding year context to upper header text post-render (e.g., changing "December" to "December 2024").

### The Problem
Searching `ganttInstance.dates` by month name finds the **first** matching month in the array, regardless of where that date appears in the timeline. When a project spans multiple years (e.g., Dec 2023 → Dec 2024), searching for "December" finds Dec 2023 first, causing the header to display the wrong year.

```javascript
// BAD - Finds first December in entire dates array
const matchingDate = ganttInstance.dates.find(d => d.getMonth() === 11);
// If timeline starts Dec 2023, this returns Dec 2023 even for Dec 2024 header
```

### The Solution
Use the element's position to calculate its index in the dates array, then look up the date directly. Each column has a fixed width (`columnWidth`), so position ÷ width = index.

### Implementation

```javascript
// GOOD - Direct index lookup from position
const columnWidth = ganttInstance.config.column_width;

upperTexts.forEach(text => {
    const elementX = parseFloat(text.style.left) || 0;
    const dateIndex = Math.round(elementX / columnWidth);

    // Bounds check
    if (dateIndex >= 0 && dateIndex < ganttInstance.dates.length) {
        const elementDate = ganttInstance.dates[dateIndex];
        const year = elementDate.getFullYear();
        text.textContent = `${text.textContent} ${year}`;
    }
});
```

### Why This Works
1. **Position encodes index** — Element at X=450 with columnWidth=45 is index 10
2. **dates[] is ordered** — `dates[0]` = gantt_start, `dates[N]` = gantt_end
3. **Direct lookup, not search** — `array[i]` is O(1) and deterministic vs `.find()` which stops at first match

### Verification
1. Create a timeline spanning multiple years with the same month (e.g., Dec 2023 → Dec 2024)
2. Scroll to view the later occurrence of the month
3. Verify the year displayed matches the timeline position, not the first occurrence in the dataset

### Related
- To be integrated into: `cli-docs/reference/frappe-gantt.md` → "Header Manipulation" section

---

### Context
Using PRESET parameter type in a Dataiku webapp to reference admin-defined parameter sets (like custom color palettes).

### The Problem
In recipes and connectors, Dataiku automatically resolves PRESET parameters to their dict values. However, in webapps, you receive a **raw reference** like `{"mode": "PRESET", "name": "PRESET_3"}` instead of the resolved values. Attempting to access the preset's properties directly fails.

```python
# What you expect (works in recipes)
preset_config = config.get('customPalettePreset')
colors = preset_config.get('colors')  # Works!

# What you actually get in webapps
preset_config = config.get('customPalettePreset')
# preset_config = {"mode": "PRESET", "name": "PRESET_3"}
colors = preset_config.get('colors')  # Returns None! No 'colors' key
```

### The Solution
Manually resolve the PRESET reference using the Dataiku API. Check the `mode` key: if `"INLINE"`, values are embedded; if `"PRESET"`, you must fetch via API.

### Implementation

```python
def resolve_preset(preset_ref, parameter_set_id):
    """Resolve a webapp PRESET parameter to its actual values."""
    if not preset_ref:
        return None

    mode = preset_ref.get('mode')

    if mode == 'INLINE':
        # Values embedded directly
        return {k: v for k, v in preset_ref.items() if k != 'mode'}

    elif mode == 'PRESET':
        # Must resolve via API
        preset_name = preset_ref.get('name')
        if not preset_name:
            return None

        import dataiku
        client = dataiku.api_client()
        plugin = client.get_plugin("your-plugin-id")
        settings = plugin.get_settings()
        parameter_set = settings.get_parameter_set(parameter_set_id)
        preset = parameter_set.get_preset(preset_name)

        if preset:
            # IMPORTANT: config is a PROPERTY, not a method!
            return preset.config  # NOT preset.get_config()
        return None

    else:
        # Direct values (no mode key)
        return preset_ref
```

### Verification
1. Create a parameter set with a preset in Dataiku plugin settings
2. In your webapp, select the preset via the PRESET param type
3. Add logging to see the raw config: `{"mode": "PRESET", "name": "..."}`
4. Verify resolve_preset() returns the actual preset values

### Related
- To be integrated into: `cli-docs/reference/parameters.md` → "PRESET Type" section
- Related gotcha: DSSPluginPreset.config is a property, not a method

---

### Context
Accessing preset configuration values after resolving a PRESET parameter via the Dataiku API.

### The Problem
After calling `parameter_set.get_preset(name)`, you get a `DSSPluginPreset` object. Attempting to call `preset.get_config()` fails with `AttributeError: 'DSSPluginPreset' object has no attribute 'get_config'`.

```python
preset = parameter_set.get_preset("PRESET_3")
values = preset.get_config()  # AttributeError!
```

### The Solution
`config` is a **property**, not a method. Access it directly without parentheses.

### Implementation

```python
# BAD - get_config() doesn't exist
preset = parameter_set.get_preset("PRESET_3")
values = preset.get_config()  # AttributeError

# GOOD - config is a property
preset = parameter_set.get_preset("PRESET_3")
values = preset.config  # Returns dict of preset values
```

### Verification
1. In Python console: `type(preset.config)` should return `<class 'dict'>`
2. `preset.config.keys()` should show your preset's parameter names
3. No AttributeError when accessing `.config`

### Related
- To be integrated into: `cli-docs/reference/parameters.md` → "Accessing Preset Values" section
- Dataiku API docs sparse on this detail

---
