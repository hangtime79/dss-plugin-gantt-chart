# Dataiku Gantt Chart Plugin
## Technical Specification

**Plugin ID:** `gantt-chart`
**Current Version:** 0.1.2
**Last Updated:** 2025-12-20

> This is a living document describing the current state of the plugin.
> For version history, see [CHANGELOG.md](CHANGELOG.md).
> For release-specific notes, see [plan/releases/](plan/releases/).

---

## 1. Overview

### 1.1 Purpose
A native Gantt chart visualization for Dataiku DSS that appears alongside built-in chart types, enabling project managers and analysts to visualize task timelines directly from any dataset.

### 1.2 Capabilities
- **Native Integration**: Appears in Charts tab → "Other" section
- **Offline Operation**: Zero external network dependencies (works in air-gapped environments)
- **Full-Featured**: Task dependencies, progress tracking, color coding, 7 view modes
- **Production Quality**: Handles edge cases gracefully with clear error feedback

### 1.3 Scope Boundaries
**Included:**
- Read-only visualization of task timelines
- Dependency arrows, progress bars, category colors
- Interactive view mode switching and navigation

**Not Included:**
- Write-back to dataset (read-only visualization)
- Real-time collaboration features
- Export to MS Project or other formats
- Custom task creation UI

### 1.4 Performance
- Renders 1,000 tasks in under 3 seconds
- Default maxTasks limit prevents browser overload
- Works identically in online and air-gapped instances

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Status |
|----|---------|--------------|------------|--------|
| US1 | Data Analyst | Select task/start/end columns from any dataset | I can quickly visualize project timelines | Done |
| US2 | Project Manager | See task dependencies as connecting arrows | I understand the critical path | Done |
| US3 | Team Lead | Color tasks by assignee or category | I can identify workload distribution | Done |
| US4 | Executive | Switch between day/week/month views | I can see both details and big picture | Done |
| US5 | User in secure environment | Use the chart without internet | My air-gapped instance works fully | Done |

---

## 3. Architecture

### 3.1 Plugin Type
**Webapp-based Custom Chart** — Uses the `chart` field in `webapp.json` to register in the Charts tab rather than the Webapps menu.

### 3.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dataiku DSS                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Charts Tab                              │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────┐  │  │
│  │  │ Bar     │ │ Line    │ │ Scatter │ │ Other           │  │  │
│  │  └─────────┘ └─────────┘ └─────────┘ │ ┌─────────────┐ │  │  │
│  │                                       │ │ Gantt Chart │◄┼──┼──┤ Plugin
│  │                                       │ └─────────────┘ │  │  │
│  │                                       └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Plugin Structure                              │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   webapp.json │    │  backend.py  │    │     app.js       │  │
│  │              │    │              │    │                  │  │
│  │  • chart     │    │  • /get-tasks│    │  • Fetch data    │  │
│  │    config    │───▶│  • /get-config│───▶│  • Init Gantt    │  │
│  │  • leftBar   │    │              │    │  • Handle events │  │
│  │    Params    │    │              │    │                  │  │
│  └──────────────┘    └──────┬───────┘    └────────┬─────────┘  │
│                             │                      │            │
│                             ▼                      ▼            │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────────┐   │
│  │  python-lib  │    │  Dataiku    │    │  Frappe Gantt    │   │
│  │  ganttchart/ │◄───│  Dataset    │    │  (bundled)       │   │
│  └──────────────┘    └─────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Business Logic Modules

| Module | Purpose |
|--------|---------|
| `date_parser.py` | Parse dates from multiple formats to ISO |
| `color_mapper.py` | Map categorical values to CSS color classes |
| `dependency_validator.py` | Detect and break circular dependencies (DFS) |
| `task_transformer.py` | Orchestrate DataFrame → Frappe Gantt task transformation |

---

## 4. Data Contracts

### 4.1 Task Object Schema

The backend transforms dataset rows into this JSON structure:

```typescript
interface Task {
  id: string;           // Required: Unique identifier
  name: string;         // Required: Display label (or ID if name not configured)
  start: string;        // Required: ISO date "YYYY-MM-DD"
  end: string;          // Required: ISO date "YYYY-MM-DD"
  progress?: number;    // Optional: 0-100
  dependencies?: string;// Optional: Comma-separated task IDs
  custom_class?: string;// Optional: CSS class for styling
}
```

### 4.2 API Endpoints

#### GET /get-tasks
Returns task data transformed from the dataset.

**Query Parameters:**
- `config` (JSON string): Webapp configuration
- `filters` (JSON string): Dataiku filters from UI

**Response (Success):**
```json
{
  "tasks": [Task, ...],
  "metadata": {
    "totalRows": 1500,
    "displayedRows": 1000,
    "skippedRows": 500,
    "skipReasons": {
      "invalid_dates": 400,
      "start_after_end": 100
    },
    "warnings": ["Circular dependency: A→B→A broken"]
  },
  "colorMapping": {
    "Dev": "bar-blue",
    "QA": "bar-green"
  }
}
```

**Response (Error):**
```json
{
  "error": {
    "code": "COLUMN_NOT_FOUND",
    "message": "Column 'start_date' not found in dataset",
    "details": {"column": "start_date"}
  }
}
```

#### GET /get-config
Returns Frappe Gantt configuration derived from webapp config.

**Response:**
```json
{
  "view_mode": "Week",
  "view_mode_select": true,
  "bar_height": 30,
  "bar_corner_radius": 3,
  "column_width": 45,
  "padding": 18,
  "readonly": true,
  "popup_on": "click",
  "today_button": true,
  "scroll_to": "today",
  "holidays": {"var(--g-weekend-highlight-color)": "weekend"}
}
```

### 4.3 Error Codes

| Code | Meaning | User Action |
|------|---------|-------------|
| `DATASET_NOT_SPECIFIED` | No dataset selected | Select a dataset |
| `DATASET_NOT_FOUND` | Dataset doesn't exist or no access | Check permissions |
| `EMPTY_DATASET` | Dataset is empty or all rows filtered | Add data or adjust filters |
| `COLUMN_NOT_FOUND` | Configured column missing | Re-select columns |
| `NO_VALID_TASKS` | All rows had invalid data | Verify data quality |
| `INVALID_CONFIGURATION` | Invalid config parameters | Check parameter values |
| `INTERNAL_ERROR` | Unexpected exception | Check logs, report bug |

---

## 5. Configuration Parameters

### 5.1 Data Column Parameters (7)

| Parameter | Type | Mandatory | Purpose |
|-----------|------|-----------|---------|
| `idColumn` | DATASET_COLUMN | Yes | Unique task identifier |
| `nameColumn` | DATASET_COLUMN | No | Task display name (falls back to ID) |
| `startColumn` | DATASET_COLUMN | Yes | Task start date |
| `endColumn` | DATASET_COLUMN | Yes | Task end date |
| `progressColumn` | DATASET_COLUMN | No | Completion percentage (0-100) |
| `dependenciesColumn` | DATASET_COLUMN | No | Comma-separated predecessor IDs |
| `colorColumn` | DATASET_COLUMN | No | Categorical column for color coding |

### 5.2 View Settings (3)

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| `viewMode` | SELECT | Week | Hour, Quarter Day, Half Day, Day, Week, Month, Year |
| `viewModeSelect` | BOOLEAN | true | Show dropdown to change view |
| `scrollTo` | SELECT | today | today, start, end |

### 5.3 Appearance (4)

| Parameter | Type | Default | Range |
|-----------|------|---------|-------|
| `barHeight` | INT | 30 | 15-60 |
| `barCornerRadius` | INT | 3 | 0-15 |
| `columnWidth` | INT | 45 | 20-100 |
| `padding` | INT | 18 | 5-40 |

### 5.4 Behavior (4)

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `readonly` | BOOLEAN | true | Disable all editing |
| `popupOn` | SELECT | click | click, hover |
| `todayButton` | BOOLEAN | true | Show "Today" navigation |
| `highlightWeekends` | BOOLEAN | true | Visual weekend distinction |

### 5.5 Performance (1)

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `maxTasks` | INT | 1000 | Limit rows for performance (0 = unlimited) |

**Total: 19 parameters** (currently all in left sidebar)

---

## 6. Edge Cases & Error Handling

### 6.1 Data Quality Issues

| Scenario | Behavior |
|----------|----------|
| **Empty dataset** | Error: "Dataset is empty or all rows filtered out" |
| **No valid date rows** | Error with count of skipped rows and reasons |
| **Start > End date** | Skip row, include in skipReasons |
| **Null/empty task name** | Use Task ID as fallback, or generate "Task {idx}" |
| **Null task ID** | Generate ID: "task_{row_idx}" |
| **Duplicate task IDs** | Append suffix: "id_1", "id_2" |
| **Invalid dependency reference** | Remove invalid reference, keep valid ones |
| **Circular dependencies** | Detect via DFS, break cycle, log warning |
| **Progress outside [0,100]** | Clamp to range (negative→0, >100→100) |
| **Invalid progress value** | Omit progress field for that task |

### 6.2 Date Parsing

Supported input formats (auto-detected):
1. ISO 8601: `2024-01-15`, `2024-01-15T00:00:00`
2. Pandas Timestamp objects
3. Python datetime objects
4. Unix timestamps (seconds, within 1970-2100 range)
5. Various string formats via `pd.to_datetime`

Output: Always `YYYY-MM-DD`

---

## 7. File Structure

```
gantt-chart/
├── plugin.json                    # Plugin metadata (v0.0.2)
├── CHANGELOG.md                   # Version history
├── plugin-spec.md                 # This document
├── README.md                      # User documentation
│
├── python-lib/ganttchart/         # Business logic (DSS-independent)
│   ├── __init__.py
│   ├── date_parser.py             # Date parsing strategies
│   ├── color_mapper.py            # Category → color mapping
│   ├── dependency_validator.py    # Cycle detection (DFS)
│   └── task_transformer.py        # Main transformation orchestrator
│
├── webapps/gantt-chart/
│   ├── webapp.json                # Chart configuration (19 params)
│   ├── backend.py                 # Flask endpoints
│   └── body.html                  # HTML container
│
├── resource/
│   ├── frappe-gantt.umd.js        # Bundled library (~47KB)
│   ├── frappe-gantt.css           # Bundled styles (~6KB)
│   ├── frappe-gantt.es.js         # ES module version
│   ├── license.txt                # MIT license (Frappe Gantt)
│   └── webapp/
│       ├── app.js                 # Frontend logic
│       ├── style.css              # Component styles + colors
│       └── dku-helpers.js         # Backend communication helper
│
├── tests/python/unit/             # 77 unit tests
│   ├── conftest.py                # Test fixtures
│   ├── test_date_parser.py        # 28 tests
│   ├── test_color_mapper.py       # 18 tests
│   ├── test_dependency_validator.py # 16 tests
│   └── test_task_transformer.py   # 15 tests
│
├── code-env/python/spec/
│   └── requirements.txt           # pandas, numpy
│
└── plan/                          # Development documentation
    ├── releases/                  # Release notes per version
    └── *.md                       # Phase guides
```

---

## 8. Testing

### 8.1 Unit Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| date_parser | 28 | Passing |
| color_mapper | 18 | Passing |
| dependency_validator | 16 | Passing |
| task_transformer | 15 | Passing |
| **Total** | **77** | **100%** |

### 8.2 Run Tests

```bash
cd /opt/dataiku/dss_design/plugins/dev/gantt-chart
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v
```

---

## 9. Implementation Status

### 9.1 Completed Features

- [x] Appears in Charts tab → Other
- [x] Column pickers for data mapping
- [x] Tasks render with correct date positions
- [x] View mode switching (all 7 modes)
- [x] Works offline (bundled Frappe Gantt)
- [x] Handles empty/invalid data gracefully
- [x] Dependencies render as arrows
- [x] Progress bars display
- [x] Color by category (12-color palette)
- [x] Task popup on click
- [x] Today button navigation
- [x] Weekend highlighting
- [x] Dataiku filter integration

### 9.2 Not Implemented

- [ ] Dark mode
- [ ] Language localization (11 languages)
- [ ] Grid lines configuration
- [ ] Expected progress indicator
- [ ] Custom date format
- [ ] Infinite scroll padding

### 9.3 Known Issues

| Priority | Issue | Status |
|----------|-------|--------|
| High | OOM risk with large datasets (full DataFrame load) | Open |
| Medium | In-memory filtering (should push to data engine) | Open |
| Low | pandas `infer_datetime_format` deprecation warning | Open |

---

## Appendix A: Color Palette

```css
.bar-blue    { fill: #3498db; }  /* Primary */
.bar-green   { fill: #2ecc71; }  /* Success */
.bar-orange  { fill: #e67e22; }  /* Warning */
.bar-purple  { fill: #9b59b6; }  /* Info */
.bar-red     { fill: #e74c3c; }  /* Danger */
.bar-teal    { fill: #1abc9c; }
.bar-pink    { fill: #e91e63; }
.bar-indigo  { fill: #3f51b5; }
.bar-cyan    { fill: #00bcd4; }
.bar-amber   { fill: #ffc107; }
.bar-lime    { fill: #cddc39; }
.bar-gray    { fill: #607d8b; }  /* Default for null/NaN */
```

Cycles for >12 categories.

---

## Appendix B: Frappe Gantt Options Mapping

| Frappe Option | Plugin Parameter | Implemented |
|---------------|------------------|-------------|
| `view_mode` | `viewMode` | Yes |
| `view_mode_select` | `viewModeSelect` | Yes |
| `bar_height` | `barHeight` | Yes |
| `bar_corner_radius` | `barCornerRadius` | Yes |
| `column_width` | `columnWidth` | Yes |
| `padding` | `padding` | Yes |
| `readonly` | `readonly` | Yes |
| `popup_on` | `popupOn` | Yes |
| `today_button` | `todayButton` | Yes |
| `scroll_to` | `scrollTo` | Yes |
| `holidays` | Derived from `highlightWeekends` | Yes |
| `language` | — | No |
| `lines` | — | No |
| `date_format` | — | No |
| `show_expected_progress` | — | No |
