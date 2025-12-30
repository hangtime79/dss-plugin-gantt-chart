# dss-plugin-gantt-chart Specific Learnings

## Data Handling

### ID Normalization
- **Issue:** Pandas type coercion can cause ID mismatches (e.g., "100" vs "100.0") if a column contains NaNs.
- **Solution:** A centralized `_normalize_id` function in `task_transformer.py` converts all IDs to string, handling float-integers safely.
- **CSS Safety:** IDs are also hex-encoded (`_xHH_`) to ensure they are valid CSS selectors, as Frappe Gantt uses them in class names.

### Progress Clamping
- **Defensive Coding:** Input data often contains progress values outside 0-100. The transformer silently clamps these to valid ranges to prevent rendering errors, though future improvements will add user warnings.

### Date Parsing
- **Fallbacks:** The `parse_date_to_iso` function implements a multi-step fallback strategy (ISO string -> Pandas Timestamp -> Unix Timestamp) to handle the variety of date formats DSS datasets might provide.
- **Intl API:** For display, the frontend uses the browser's `Intl.DateTimeFormat` API, eliminating the need for translation dictionaries for month names.

## Visual Features

### Sticky Header
- **Implementation:** CSS `position: sticky` failed due to nested scroll containers.
- **Solution:** A JavaScript-based scroll sync (`setupStickyHeader`) listens to the container's scroll event and applies a `translate3d` transform to the header element.
- **Narrow Content:** Special logic ensures the header spans the full container width even if the SVG content is narrower, preventing visual jank.

### Progress Bar Radius
- **ClipPath:** Simply setting `border-radius` on the progress bar caused it to bleed outside the task bar at high radius values.
- **Solution:** `fixProgressBarRadius` dynamically generates SVG `clipPath` elements matching the task bar's geometry and applies them to the progress bars.

### Expected Progress
- **Feature:** Shows a vertical marker indicating where progress *should* be based on today's date.
- **Implementation:** Calculated in Python (`_expected_progress`), passed to frontend. JS renders a custom SVG line and triangle indicator.
- **Positioning:** Instead of calculating time-based pixel offsets (error-prone), the renderer simply reads the `.style.left` of the library's existing "Today" line.

## UI/UX

### Loading & Onboarding
- **Initialization:** The app uses a "skeleton loader" structure in HTML while waiting for the initial configuration signal from the parent frame.
- **Getting Started:** Instead of showing/hiding multiple DOM elements, the "Getting Started" guide is implemented as a full-page overlay (`#getting-started`) that sits on top of the chart. Toggling it is a simple matter of `display: none` on the overlay container.
- **Error Handling:** A custom error display replaces the chart area if validation fails (e.g., missing columns), providing clear feedback.

### Filtering
- **Re-render vs Hide:** "Filtering" in a Gantt chart implies layout changes (shrinking the chart height). Implementing this by simply hiding DOM elements (`display: none`) is insufficient. The robust solution is to re-render the chart with the filtered dataset.