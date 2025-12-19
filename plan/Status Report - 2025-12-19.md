# Project Status Report - 2025-12-19

## Executive Summary
Significant progress has been made on the v0.1.0 feature set, specifically regarding the Top Bar configuration, UX layout improvements, and the foundational logic for "Auto-Fit" resizing. However, critical issues remain with the interactivity of the new UI elements (Date Picker, Tooltips) and the rendering of the horizontal scrollbar.

## Completed Features
*   **Top Bar Configuration:** Successfully moved mandatory data columns (ID, Start, End) to the Top Bar and optional columns to the Sidebar to declutter the UI.
*   **Task Sorting:** Implemented and verified sorting logic (Start/End Date, Name, Duration, Dependencies) in the backend.
*   **Auto-Fit / Zoom Logic:** Implemented a robust "Measure-and-Scale" rendering pass that successfully ensures the chart fills the available screen width (fixing the "1/3 width" issue).
*   **Backend Tooltip Sorting:** Added logic to sort tooltip columns alphabetically before processing.
*   **OOM Mitigation:** Implemented row limits to prevent memory issues with large datasets.

## Working (Awaiting Confirmation)
*   **Custom Tooltips Data Flow:** The backend logic to extract custom fields and pass them to the frontend is in place. Logs indicate requests are being made with columns like `["Combo_Cost"]`, but the visual rendering in the popup is still problematic (showing "Untitled Task" or missing fields).
    *   *Status:* Needs debugging of the frontend `task` object inspection.
*   **Date Navigation ("Go" Button):** The UI toolbar is implemented, but the functional logic to scroll the chart to a specific date is failing silently or not calculating the correct offset.
    *   *Status:* Needs debugging of `scrollToDate` function and Frappe Gantt instance properties.

## Known Issues / TODOs

### Critical (Must Fix)
1.  **Horizontal Scrollbar Missing:**
    *   *Issue:* Despite CSS changes (`overflow: auto`), the scrollbar is not appearing when the chart content exceeds the viewport (e.g., in Day view).
    *   *Hypothesis:* Parent container styling or `flex` layout issues might be clipping the overflow.
    *   *Action:* Investigate parent iframe constraints and force scrollbar visibility.

2.  **Tooltip Data & Sorting:**
    *   *Issue:* Custom fields are not appearing in the popup, and the popup header sometimes shows "Untitled Task" or "to" (missing dates).
    *   *Log Analysis:* `tooltipColumns` param is sometimes passed as `[""]` (empty string in list) or the column name `Combo_Cost` might not match the dataframe columns exactly (case sensitivity?).
    *   *Action:* verify column name matching in `task_transformer.py` and inspect the `task` object in `app.js` console logs.

3.  **Date Picker Functionality:**
    *   *Issue:* Clicking "Go" does not scroll the chart.
    *   *Action:* Fix the `scrollToDate` function to correctly identify the Gantt start date and calculate the pixel offset.

### Enhancements (Post-Fix)
*   **"Ghost Tasks" for Calendar Extension:** The chart currently only renders the time range covered by tasks. Users cannot scroll into the empty future.
    *   *Proposal:* Add an option to "Extend Timeline" which adds invisible tasks at start/end ± N months.

---
## Next Steps
1.  Debug `app.js` using the newly added console logs (check browser console).
2.  Verify the `scrollToDate` offset calculation.
3.  Force `overflow-x: scroll` on `#gantt-container` to isolate the scrollbar issue.
