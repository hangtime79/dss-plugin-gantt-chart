# Changelog

All notable changes to the Gantt Chart plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Move data column parameters to top bar for better UX
- Address OOM risk with large datasets

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
