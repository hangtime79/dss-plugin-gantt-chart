# Changelog

All notable changes to the Gantt Chart plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] - 2025-12-21

### Fixed
- **Dependency Arrows Not Rendering**: Fixed type mismatch where Frappe Gantt expected arrays but received comma-separated strings
  - Root cause 1: Backend sent dependencies as strings (`"task1,task2"`) instead of arrays (`["task1", "task2"]`)
  - Root cause 2: Pandas type coercion caused ID mismatch - ID columns (no NaN) read as int64, dependency columns (with NaN) read as float64
  - Solution: Added `_normalize_id()` helper that converts whole-number floats to int representation while preserving decimals
  - Updated `task_transformer.py`, `dependency_validator.py`, and `sort_utils.py` to handle arrays
  - Added 10 comprehensive unit tests for ID normalization edge cases

---

## [0.2.2] - 2025-12-20

### Fixed
- **Filters Ignored on Load**: Fixed race condition where chart rendered before receiving filter state (removed premature synchronous init).

---

## [0.2.1] - 2025-12-20

### Fixed
- **Scrolling**: Restored horizontal and vertical scrolling functionality
  - Root cause: CSS was overriding Frappe Gantt's dynamic container height
  - Fix: Let Frappe control `.gantt-container` height, put `overflow: auto` on outer wrapper

---

## [0.2.0] - 2025-12-20

### Added
- **Custom Tooltips**: Users can now select specific columns to display in the task details popup via the `Tooltip Fields` configuration.

### Fixed
- **Popup Date Display**: Fixed issue where dates appeared as "N/A to N/A" by correctly handling Frappe Gantt's task object wrapper.
- **Cyclic Object Error**: Resolved crash when logging task objects in the browser console.

---

---

## [0.1.3] - 2025-12-20

### Fixed
- **Dual Execution Race Condition**: Resolved an issue where the application logic would run twice, causing unpredictable behavior and rendering glitches.
- **Cleanup**: Removed deprecated code files to ensure a single source of truth for the application logic.

---

## [0.1.2] - 2025-12-20

### Fixed
- **Appearance Settings Not Updating**: Switched to using live `webAppConfig` messages for real-time UI updates, bypassing stale backend configuration calls.
- **Invisible Tasks at High Zoom**: Enforced minimum bar widths during render and view changes to ensure task visibility in Day/Hour views.
- **Dual Execution Race Condition**: Consolidated code into the primary resource file to prevent browser from running multiple versions of the application script.

---

## [0.1.1] - 2025-12-19

### Added
- Task sorting with 10 options (start/end date, name, duration, dependencies)
- Topological sort using Kahn's algorithm for dependency-based ordering
- `sortBy` parameter in View Settings section

### Changed
- Moved mandatory columns (Task ID, Start Date, End Date) to top bar
- Optional columns (Name, Progress, Dependencies, Color) remain in sidebar
- Renamed "Data Columns" separator to "Optional Columns"

### Testing
- All 90 unit tests passing
- Manual testing completed and accepted
- No regressions in existing functionality

---

## [0.0.2] - 2025-12-18

### Fixed
- Backend crash: Removed invalid `dataiku.get_datadir()` API call
- Infinite loading spinner: Fixed asset paths and initialization flow
- `dataiku.webappBackend` undefined: Added `dku-helpers.js` following standard plugin patterns
- Spinner now hides properly on error conditions

### Changed
- Made `nameColumn` optional (uses Task ID as fallback display name)
- Moved `app.js` and `style.css` to `resource/webapp/` for proper asset loading
- Simplified `body.html` to fragment format (required for STANDARD webapps)

### Added
- `resource/webapp/dku-helpers.js` for robust backend communication
- Explicit `hideLoading()` call in error handler

---

## [0.0.1] - 2025-12-18

### Added
- Initial implementation of Gantt Chart plugin
- Core business logic modules:
  - `date_parser.py` - Robust date parsing with multiple fallback strategies
  - `color_mapper.py` - Categorical value to CSS color class mapping
  - `dependency_validator.py` - Circular dependency detection using DFS
  - `task_transformer.py` - DataFrame to Frappe Gantt task transformation
- Webapp with Flask backend (`/get-tasks`, `/get-config` endpoints)
- Frontend with Frappe Gantt library integration
- 19 configurable parameters across 5 sections
- 77 unit tests (100% passing)
- Bundled Frappe Gantt library for offline operation
- Support for:
  - Task dependencies with arrow visualization
  - Progress tracking (0-100%)
  - Color coding by category (12-color palette)
  - 7 view modes (Hour to Year)
  - Weekend highlighting
  - Today button navigation
  - Click/hover popups

### Technical
- Works in air-gapped environments (no external dependencies)
- Graceful handling of edge cases (null IDs, duplicate IDs, invalid dates, circular dependencies)
- maxTasks limit for performance (default: 1000)
