# CLI Docs Template Update - Plugin Webapp Standards

This document outlines architectural requirements and best practices for Dataiku plugin webapps that should be incorporated into the standard plugin template.

## 1. Backend Communication Helper (`dataiku.webappBackend`)

### Context
Standard Dataiku JS libraries (`standardWebAppLibraries: ["dataiku"]`) provide the core `dataiku` object, but they do **not** automatically provide the `dataiku.webappBackend` helper object for convenient AJAX/Fetch communication with the Python backend.

### Requirement
Every plugin webapp must include a helper file (conventionally named `dku-helpers.js`) to define this object before the main application script runs.

### Implementation (`resource/webapp/dku-helpers.js`)

```javascript
/*
 * Dataiku Webapp Helpers
 * Provides robust backend communication wrappers using Fetch API.
 */
(function() {
    'use strict';

    if (typeof dataiku === 'undefined') {
        console.error("Dataiku standard library not loaded. dku-helpers.js will fail.");
        return;
    }

    if (!dataiku.webappBackend) {
        dataiku.webappBackend = {
            getUrl: function(path) {
                return dataiku.getWebAppBackendUrl(path);
            },

            get: function(path, params) {
                let url = this.getUrl(path);
                
                // Append query parameters
                if (params && Object.keys(params).length > 0) {
                    const queryString = Object.keys(params).map(key => {
                        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
                    }).join('&');
                    url += (url.indexOf('?') === -1 ? '?' : '&') + queryString;
                }

                return fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => {
                    if (response.status == 502) {
                        throw new Error("Webapp backend is not running or not reachable (502).");
                    }
                    if (!response.ok) {
                        return response.text().then(text => {
                            let errorMsg = response.statusText;
                            try {
                                const json = JSON.parse(text);
                                if (json.error) errorMsg = json.error;
                            } catch(e) {}
                            throw new Error(`Backend Error (${response.status}): ${errorMsg}`);
                        });
                    }
                    return response.json();
                });
            }
        };
    }
})();
```

### Usage in `body.html`

The helper must be loaded **after** the frappe-gantt (or other libraries) but **before** your main `app.js`.

```html
<script src="/plugins/PLUGIN_ID/resource/webapp/dku-helpers.js"></script>
<script src="/plugins/PLUGIN_ID/resource/webapp/app.js"></script>
```

## 2. Robust Initialization Pattern

Webapps should attempt immediate initialization while also listening for the `message` event from the parent frame to ensure they receive configuration even if the initial synchronous call fails or the platform delays the message.

```javascript
// Inside app.js
try {
    const config = dataiku.getWebAppConfig()['webAppConfig'] || {};
    if (Object.keys(config).length > 0) {
        initialize(config);
    }
} catch (e) {
    console.warn("Sync config failed, waiting for message...");
}

window.addEventListener('message', function(event) {
    // ... parse and initialize ...
});
```

## 3. Release Documentation Structure

### Context
During development, we found that a single monolithic specification document becomes unwieldy. It mixes "what we planned" with "what exists" and makes it hard to track version history. AI assistants also benefit from smaller, focused documents.

### Recommended Structure

```
your-plugin/
├── CHANGELOG.md              # Version history (Keep a Changelog format)
├── plugin-spec.md            # Living document: current state only
└── plan/
    └── releases/
        ├── v0.0.1-notes.md   # What was built in v0.0.1
        ├── v0.0.2-notes.md   # Bug fixes in v0.0.2
        └── v0.1.0-notes.md   # Feature plan for next release
```

### CHANGELOG.md

Use [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format:

```markdown
# Changelog

All notable changes to this plugin will be documented in this file.

## [Unreleased]

### Planned
- Feature X
- Feature Y

---

## [0.0.2] - 2025-12-18

### Fixed
- Bug A description
- Bug B description

### Changed
- Change C description

---

## [0.0.1] - 2025-12-18

### Added
- Initial implementation
- Feature list...
```

### plugin-spec.md

This should be a **living document** reflecting **current state only**:
- Remove future plans (those go in release notes)
- Mark user stories as Done/Not Implemented
- List known issues
- Update after each release

### plan/releases/vX.Y.Z-notes.md

Version-specific planning documents:
- **For past versions:** Summary of what was built, files modified, lessons learned
- **For future versions:** Feature specs, implementation plans, success criteria

Benefits:
1. **Clear separation:** Spec = what exists, Release notes = what changed/will change
2. **AI-friendly:** Smaller files, focused context
3. **Audit trail:** Each release has its own planning document
4. **Progressive disclosure:** Read CHANGELOG for overview, dive into release notes for details

### Template Addition

Add to plugin template's `README.md` or `CONTRIBUTING.md`:

```markdown
## Documentation

- `CHANGELOG.md` - Version history (update with each release)
- `plugin-spec.md` - Current plugin state (living document)
- `plan/releases/` - Version-specific planning and release notes
```

## 4. Git Branch Naming Convention

### Format

```
<type>/<version>-<short-description>
```

### Branch Types

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feature/` | New functionality | `feature/v0.1.0-ux-improvements` |
| `bugfix/` | Bug fixes | `bugfix/v0.0.3-spinner-fix` |
| `release/` | Release prep, final polish | `release/v0.1.0` |
| `hotfix/` | Urgent production fixes | `hotfix/v0.0.2-backend-crash` |

### Guidelines

1. **Always use a type prefix** - Communicates intent at a glance
2. **Include target version** - Ties work to release planning
3. **Short description** - 2-4 words, summarizes scope
4. **Lowercase + hyphens** - Universal compatibility, no spaces or special chars

### Examples

```bash
# Feature work for next minor release
git checkout -b feature/v0.1.0-custom-tooltips

# Bug fix for patch release
git checkout -b bugfix/v0.0.3-date-parsing

# Preparing a release (version bump, changelog finalization)
git checkout -b release/v0.1.0

# Urgent fix for production issue
git checkout -b hotfix/v0.0.2-crash-on-empty-data
```

### Template Addition

Add to plugin template's `CONTRIBUTING.md`:

```markdown
## Branch Naming

Use this format: `<type>/<version>-<short-description>`

| Type | Purpose |
|------|---------|
| `feature/` | New functionality |
| `bugfix/` | Bug fixes |
| `release/` | Release preparation |
| `hotfix/` | Urgent production fixes |

Example: `feature/v0.1.0-ux-improvements`
```

## 5. The "Two app.js" Problem (Dual Execution/Stale Code)

### Context
Dataiku plugins often have a `webapps/WEBAPP_ID/` directory and a `resource/webapp/` directory. If your `body.html` references a script in `resource/` but you are editing a file with the same name in `webapps/`, you may encounter "stale code" symptoms or, worse, "dual execution" where the browser loads both (one from cache, one from working directory).

### The Problem
- Changes to the script don't seem to apply.
- Console logs show the same message appearing twice but from different line numbers or files.
- Unpredictable race conditions where UI elements are rendered then immediately overwritten.

### The Solution
1. **Source of Truth**: Decide where your primary logic lives and ensure `body.html` points there.
2. **Remove Duplicates**: If a file exists in both `webapps/` and `resource/` but you only use one, remove or sync the other to avoid confusion.
3. **Check Network Tab**: Use browser dev tools to confirm which file is actually being loaded.

## 6. `requestAnimationFrame` for External Renderers

### Context
Libraries like Frappe Gantt perform their own DOM manipulation and rendering lifecycle. If you need to apply custom styling or DOM adjustments (like enforcing minimum widths or custom colors) after the library renders, standard synchronous code may run too early.

### The Problem
- Styles applied in code don't appear in the browser.
- Adjustments are overwritten by the library's internal render cycle.

### The Solution
Use `requestAnimationFrame()` to defer your custom adjustments until after the browser has completed the current layout pass and before the next repaint.

```javascript
ganttInstance = new Gantt("#gantt", tasks, options);

// Defer custom DOM enforcement
requestAnimationFrame(() => {
    enforceCustomStyles();
});
```

## 7. Standard Webapp Auto-loading

### Context
Dataiku "Standard" webapps (defined in `webapp.json` with `"baseType": "STANDARD"`) have built-in behavior for loading assets.

### The Problem
Developers often manually add `<script src="app.js">` to their `body.html`, thinking it is required.

### The Reality
Dataiku **automatically** injects:
1. `webapps/<id>/app.js` (if it exists)
2. `webapps/<id>/style.css` (if it exists)
3. jQuery (if requested in `standardWebAppLibraries`)
4. Dataiku JS API (if requested)

### The Solution
**Do not** manually reference your main `app.js` or `style.css` in `body.html` for Standard webapps. Doing so will cause the script to execute twice: once by the auto-loader, and once by your tag.
# CLI Docs Updates

## 1. Frappe Gantt Popup Callback Wrapper

### Context
When implementing a custom `popup` function in the Frappe Gantt configuration.

### The Problem
The library sometimes passes a wrapper object instead of the direct Task object to the callback. Accessing properties like `task.name` or `task.start` directly yields `undefined`.

### The Solution
Check if the passed object has a `task` property and unwrap it.

### Implementation

```javascript
popup: function(task) {
    // Unwrap if necessary
    if (task && task.task) {
        task = task.task;
    }
    // Now safe to use task.name, task.start, etc.
    return buildHtml(task);
}
```

## 2. Debugging Frappe Gantt Objects

### Context
Logging task objects to the console for debugging.

### The Problem
Frappe Gantt task objects contain circular references (e.g., links to DOM elements or parent SVG containers). Using `JSON.stringify(task)` causes a `TypeError: cyclic object value`.

### The Solution
Log the object directly to the console, allowing the browser's native inspector to handle it.

### Implementation

```javascript
// BAD
console.log('Task:', JSON.stringify(task)); // Crashes

// GOOD
console.log('Task:', task); // Works
```

## 3. Frappe Gantt Scrolling Container

### Context
Embedding Frappe Gantt in a constrained container (like a webapp iframe).

### The Problem
Frappe Gantt's internal `.gantt-container` uses a CSS variable `--gv-grid-height` to dynamically set its height based on the number of task rows. If you override this with `height: 100%`, you force the container to viewport size and eliminate any overflow - no scrollbars appear.

### The Solution
**Do NOT override `.gantt-container` height.** Let Frappe control its own container sizing.

Put `overflow: auto` on YOUR outer wrapper container:

```css
/* Your outer container - this one scrolls */
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: auto;      /* Scrollbars appear here */
    position: relative;
}

/* Do NOT set height on Frappe's container!
   Frappe uses: height: var(--gv-grid-height);
   which it calculates dynamically based on row count.

   .gantt-container {
       height: 100%;    <-- WRONG - breaks scrolling
   }
*/
```

### Why This Works
1. Your `#gantt-container` fills the viewport with `overflow: auto`
2. Frappe's `.gantt-container` inside it can grow larger than the viewport (via `--gv-grid-height`)
3. When Frappe's container exceeds your container, scrollbars appear on your container

### Common Mistake
```css
/* WRONG - This breaks scrolling */
#gantt-container { overflow: hidden; }
.gantt-container { height: 100%; overflow: auto; }
```

This forces both containers to viewport height, so there's nothing to scroll.

## 4. Dataiku Webapp CSS Loading

### Context
Understanding where to place CSS files in a Dataiku plugin webapp.

### The Problem
You have a `style.css` file in `webapps/gantt-chart/` but your styles aren't being applied. Or you have CSS in both `webapps/{name}/` and `resource/webapp/` and you're not sure which one is loaded.

### The Reality
Dataiku's auto-loading behavior for Standard webapps (`"baseType": "STANDARD"`) is:
- `app.js` from `webapps/{name}/` - **AUTO-LOADED**
- `style.css` from `webapps/{name}/` - **NOT reliably auto-loaded** (depends on DSS version)

### The Solution
For guaranteed CSS loading, use the `resource/` folder and explicitly link in `body.html`:

```html
<!-- body.html -->
<link rel="stylesheet" href="/plugins/PLUGIN_ID/resource/webapp/style.css">
```

### File Structure
```
your-plugin/
├── webapps/
│   └── your-webapp/
│       ├── app.js          # Auto-loaded by Dataiku
│       ├── body.html       # Contains explicit CSS link
│       ├── backend.py
│       └── webapp.json
└── resource/
    └── webapp/
        └── style.css       # Loaded via explicit <link> in body.html
```

### Verification
Use browser DevTools → Network tab to confirm which CSS files are actually loaded. If your styles aren't applying, check that the CSS file appears in the network requests.

## 5. Webapp Filters Initialization

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
1. Load the webapp with active filters.
2. Verify the chart renders filtered data immediately (no flash of all data).
3. Verify the loading spinner is shown while waiting for the `message` event.

### Related
- [Dataiku JS API Documentation](https://doc.dataiku.com/dss/latest/python-api/webapps.html)