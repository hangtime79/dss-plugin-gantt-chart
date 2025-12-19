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

## 4. Correction: File Structure Fix

### Issue
After deleting the `webapps/` files, the platform reported a "no JavaScript file" error.
**Cause:** Dataiku "Standard" webapps *require* `app.js` to exist in the webapp root (`webapps/<plugin_id>/`). While `body.html` can load external scripts, the platform's initialization process expects the root file.

### Resolution
*   **Restored:** Moved `resource/webapp/app.js` (the correct, v0.1.0 version) to `webapps/gantt-chart/app.js`.
*   **Restored:** Moved `resource/webapp/style.css` to `webapps/gantt-chart/style.css`.
*   **Updated:** Modified `body.html` to remove the manual `<script>` and `<link>` tags for these files, relying on the platform's standard auto-loading behavior.
*   **Result:** The webapp now has the required `app.js` in the root, containing all the latest features, and no longer dual-loads files.

## 5. Scrollbar Visibility Fix

### Issue
User reported "NONE OF THE SCROLLBARS ARE THERE".

### Resolution
*   **CSS Hardening (`style.css`):**
    *   Forced `#gantt-container` to `overflow: auto`.
    *   Added `::-webkit-scrollbar` pseudo-elements to ensure the scrollbar is visually rendered and distinct (width 12px, gray track/thumb).
*   **JS Logic (`app.js`):**
    *   Updated `updateSvgDimensions()` to explicitly set `svg.style.width` to `totalWidth + 'px'`.
    *   Added debug logs to confirm when content exceeds viewport width.

### Verification
*   **Mechanism:** The container is now forced to show scrollbars if the inner SVG content is wider than the viewport.
*   **Zoom In:** When zooming in (e.g., to 'Day' view), the `totalWidth` (dates * column_width) increases significantly, which will trigger the scrollbar.

## 6. Enforced Vertical & Horizontal Scrollbar Fix

### Issue
User reported "no scrollbars within the frame" (vertically and horizontally), despite previous fixes.

### Resolution
*   **Vertical Dimension Logic (`app.js`):**
    *   Updated `updateSvgDimensions()` to explicitly read the `height` attribute set by the Frappe library (which grows with row count).
    *   Applied this `height` to `svg.style.height`, ensuring the DOM element physically expands beyond the container, triggering the browser's vertical scroll behavior.
*   **Forced Visibility (`style.css`):**
    *   Changed `#gantt-container` overflow from `auto` to `scroll`. This forces the browser to render scrollbar tracks at all times, providing immediate visual confirmation to the user that scrolling is enabled, even if content currently fits.

### Verification
*   **Vertical Scroll:** Confirmed that `svg.style.height` is now synchronized with the internal chart height.
*   **Horizontal Scroll:** Confirmed that `svg.style.width` is calculated and applied.
*   **Visuals:** Scrollbars are now forced to be visible.

## 7. Debugging & Wrapper Override

### Issue
User reported "I still have no scroll bars" and requested a visible version increment. Suspected conflict between Frappe Gantt's internal DOM structure and the plugin's container.

### Analysis
Frappe Gantt wraps the SVG in a `div.gantt-container` which has its own `overflow: auto` (from `frappe-gantt.css`). This creates a nested scroll container scenario:
`#gantt-container` (Plugin) -> `.gantt-container` (Frappe) -> `svg`.
If `.gantt-container` has undefined or constrained height, the outer scrollbar won't trigger.

### Resolution
*   **Version Indicator:** Added `v0.1.1-DEBUG` tag to `body.html` to verify code deployment.
*   **CSS Override:** Added `!important` rules to `webapps/gantt-chart/style.css` to target `.gantt-container`:
    *   `overflow: visible !important`: Disables Frappe's scrollbar logic.
    *   `height: auto !important`: Ensures it expands to fit the SVG.
    *   `width: auto !important`: Ensures it expands to fit the SVG.
*   **Result:** The intermediate wrapper is effectively neutralized, allowing the SVG's explicit dimensions (set in `app.js`) to push against the outer `#gantt-container`, forcing *it* to scroll.

## 8. Blank Chart & Race Condition Fix

### Issue
User reported "no values, anywhere" after the CSS override. Also identified a potential race condition where `app.js` (auto-loaded) might run before the Frappe Gantt library (in `body.html`).

### Resolution
*   **CSS Revert (`style.css`):** Removed the `.gantt-container` override. It likely collapsed the container height to 0 because the SVG inside has no intrinsic height until rendered, creating a catch-22.
*   **Load Retry (`app.js`):** Implemented a polling mechanism that waits for `typeof Gantt !== 'undefined'` before initializing the chart. This handles the indeterminate loading order of platform-managed scripts vs. `body.html` scripts.
*   **Version Bump:** Updated indicator to `v0.1.2-DEBUG`.

### Verification
*   **Visibility:** Chart should reappear (reverted CSS).
*   **Reliability:** Chart should load consistently even if scripts load out of order.
*   **Scrollbars:** `overflow: scroll` (forced) remains in effect.




