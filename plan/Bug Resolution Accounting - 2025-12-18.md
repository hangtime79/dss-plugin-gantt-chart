# Bug Resolution Accounting - 2025-12-18

This document provides a detailed summary of the bugs resolved and structural improvements made to the Gantt Chart plugin during the first round of debugging.

## 1. Resolved: AttributeError: 'dataiku' has no attribute 'get_datadir'
- **Issue**: The webapp backend crashed immediately on startup.
- **Root Cause**: `webapps/gantt-chart/backend.py` attempted to manually add `python-lib` to `sys.path` using `dataiku.get_datadir()`, which is not a valid Dataiku API call for plugins.
- **Resolution**: Removed the manual `sys.path` modification. In Dataiku plugins, the `python-lib` folder is automatically included in the `PYTHONPATH`.
- **Impact**: Backend now loads successfully.

## 2. Resolved: Infinite Loading Spinner
- **Issue**: The webapp displayed "Loading Gantt chart..." indefinitely.
- **Root Cause**: Multiple factors:
    1. `body.html` was missing `<script>` and `<link>` tags for `app.js` and `style.css`.
    2. The browser was unable to resolve relative paths for static assets served via Flask in the plugin context.
    3. `app.js` was waiting for a `message` event from the parent frame that wasn't being triggered or caught correctly during initial load.
- **Resolution**: 
    - Moved `app.js` and `style.css` to `resource/webapp/`.
    - Updated `body.html` to use absolute platform paths: `/plugins/gantt-chart/resource/webapp/...`.
    - Refactored `app.js` to attempt immediate initialization using the synchronous `dataiku.getWebAppConfig()` call.
    - Simplified `body.html` from a full HTML document to a fragment (required for `STANDARD` webapps).
- **Impact**: Webapp logic now executes immediately upon page load.

## 3. Resolved: Dataiku JS API Availability
- **Issue**: `dataiku.webappBackend` was reported as `undefined` in the frontend.
- **Root Cause**: The webapp configuration did not explicitly request the Dataiku JS libraries, and JS security settings were blocking certain interactions.
- **Resolution**:
    - Updated `webapp.json` to include `"standardWebAppLibraries": ["jquery", "dataiku"]`.
    - Set `"noJSSecurity": "true"` in `webapp.json`.
    - Implemented a robust polyfill in `body.html` that manually constructs `dataiku.webappBackend` using `fetch` and `dataiku.getWebAppBackendUrl()` if the standard library is slow to initialize.
- **Impact**: Frontend-Backend communication is now reliable and robust.

## 4. Improvement: Flexible Data Requirements
- **Issue**: Users wanted the chart to work with minimal configuration ("only need Task ID, Start Date and End Date").
- **Resolution**:
    - Changed `nameColumn` from mandatory to optional in `webapp.json`.
    - Updated `TaskTransformer` in `python-lib` to handle missing name columns.
    - Implemented fallback logic: if a Task Name is not provided, the **Task ID** is used as the display name.
    - Updated unit tests to verify the new naming fallback logic.
- **Impact**: Better user experience and fewer "Missing parameter" errors.

## 5. Maintenance: Code Environment & Scalability
- **Code Env**: Restored the accidentally deleted `requirements.txt` with essential dependencies (`pandas`, `numpy`).
- **Scalability**: Identified a potential OOM (Out Of Memory) risk where `get_dataframe()` loads the entire dataset. 
    - Added a `TODO` in `backend.py`.
    - Created `plan/Known Issues and Future Improvements.md` to track this for the next phase.
- **Version**: Bumped plugin version to `0.0.2`.

## Final State
The plugin is now functional, correctly loads data from the selected dataset, and renders an interactive Gantt chart.
