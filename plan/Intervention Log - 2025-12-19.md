# Intervention Log - 2025-12-19

**Session Goal:** Implement v0.1.0 UX improvements (Top Bar, Custom Tooltips, Sorting, Auto-Fit) and resolve regressions.

## 1. Feature Implementation (v0.1.0)

### Configuration Changes
*   **File:** `webapps/gantt-chart/webapp.json`
*   **Change:** Moved optional data columns (`nameColumn`, `progressColumn`, `dependenciesColumn`, `colorColumn`) from `leftBarParams` to `topBarParams`.
*   **Reason:** UX requirement to declutter sidebar and align with Dataiku standard chart patterns.

### Frontend Logic Updates
*   **File:** `resource/webapp/app.js`
*   **Auto-Fit Logic:** Added calculation to dynamically scale `column_width` based on viewport width (`container.clientWidth`) and date range size. Ensures chart fills the screen instead of occupying just 1/3rd.
*   **Scrollbar Fix:** Implemented explicit pixel dimension setting on the SVG element (`svg.setAttribute('width', ...)`) after rendering. This forces the browser to recognize the overflow and render the horizontal scrollbar.
*   **Date Picker:** Rewrote `scrollToDate` to use the Frappe Gantt instance's internal `dates` array and `column_width` to calculate precise pixel offsets.
*   **Custom Tooltips:** Added logic to inspect `task.custom_fields` and render them in the popup HTML. Verified data flow from backend.

## 2. Duplicate File Resolution (Critical Fix)

### Issue
The application was behaving inconsistently (double loading, features disappearing). Investigation revealed a conflict between the Dataiku Standard Webapp conventions and the plugin's custom loading structure.

### Files Removed
*   **Deleted:** `webapps/gantt-chart/app.js`
*   **Deleted:** `webapps/gantt-chart/style.css`

### Reasoning
*   **Conflict:** Dataiku automatically loads `app.js` and `style.css` if they exist in the root `webapps/gantt-chart/` folder.
*   **Redundancy:** The plugin explicitly loads `resource/webapp/app.js` and `resource/webapp/style.css` via `body.html`.
*   **Result:** Two versions of the app were running simultaneously. The `webapps/` version was outdated (ghost file), overriding the newer code in `resource/`.
*   **Resolution:** Removing the `webapps/` files forces the platform to use *only* the explicitly loaded files from `resource/`, which contain the correct v0.1.0 code.

## 3. Verification Status
*   **Unit Tests:** 90/90 passed (including new Sort Utils).
*   **Version:** Bumped to `0.1.0` in `plugin.json`.
*   **Git State:** Clean.
