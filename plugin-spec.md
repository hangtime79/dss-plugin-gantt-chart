# Dataiku Gantt Chart Plugin
## Technical Specification v1.0

"id": "gantt-chart"
---

## 1. Overview

### 1.1 Purpose
Build a native Gantt chart visualization for Dataiku DSS that appears alongside built-in chart types, enabling project managers and analysts to visualize task timelines directly from any dataset.

### 1.2 Goals
- **Native Integration**: Appear in Charts tab → "Other" section (not as a separate webapp)
- **Offline Operation**: Zero external network dependencies for air-gapped environments
- **Full-Featured**: Expose all Frappe Gantt capabilities through Dataiku's UI patterns
- **Production Quality**: Handle edge cases, large datasets, and provide clear error feedback

### 1.3 Non-Goals
- Write-back to dataset (this is read-only visualization)
- Real-time collaboration features
- Export to MS Project or other formats
- Custom task creation UI

### 1.4 Success Criteria
- Users can create a Gantt chart in under 60 seconds via drag-drop column selection
- Chart renders 1,000 tasks in under 3 seconds
- Works identically in online and air-gapped Dataiku instances

---

## 2. User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US1 | Data Analyst | Select task/start/end columns from any dataset | I can quickly visualize project timelines |
| US2 | Project Manager | See task dependencies as connecting arrows | I understand the critical path |
| US3 | Team Lead | Color tasks by assignee or category | I can identify workload distribution |
| US4 | Executive | Switch between day/week/month views | I can see both details and big picture |
| US5 | User in secure environment | Use the chart without internet | My air-gapped instance works fully |

---

## 3. Architecture

### 3.1 Plugin Type
**Webapp-based Custom Chart** — Uses the special `chart` field in `webapp.json` to register in the Charts tab rather than the Webapps menu.

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
│                      ┌─────────────┐    ┌──────────────────┐   │
│                      │  Dataiku    │    │  Frappe Gantt    │   │
│                      │  Dataset    │    │  (bundled)       │   │
│                      └─────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Data Flow

```
User configures columns in left sidebar
            │
            ▼
┌───────────────────────┐
│  Dataiku stores       │
│  config in webapp     │
│  context              │
└───────────┬───────────┘
            │
            ▼
┌───────────────────────┐     ┌───────────────────────┐
│  app.js requests      │────▶│  backend.py           │
│  GET /get-tasks       │     │  - Reads dataset      │
│  GET /get-config      │     │  - Transforms rows    │
└───────────────────────┘     │  - Returns JSON       │
            │                 └───────────────────────┘
            │
            ▼
┌───────────────────────┐
│  Frappe Gantt         │
│  renders SVG          │
└───────────────────────┘
```

---

## 4. Data Contracts

### 4.1 Task Object Schema

The backend transforms dataset rows into this JSON structure:

```typescript
interface Task {
  id: string;           // Required: Unique identifier
  name: string;         // Required: Display label
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

**Response (Success):**
```json
{
  "tasks": [Task, ...],
  "metadata": {
    "totalRows": 1500,
    "displayedRows": 1000,
    "skippedRows": 500,
    "skipReason": "maxTasks limit"
  }
}
```

**Response (Error):**
```json
{
  "error": {
    "code": "INVALID_DATE_FORMAT",
    "message": "Column 'start_date' contains invalid dates",
    "details": {
      "invalidRows": [5, 12, 89],
      "sampleValue": "not-a-date"
    }
  }
}
```

#### GET /get-config
Returns frontend configuration derived from webapp config.

**Response:**
```json
{
  "viewMode": "Week",
  "readonly": true,
  "darkMode": false,
  ...
}
```

### 4.3 Error Codes

| Code | Meaning | User Action |
|------|---------|-------------|
| `DATASET_NOT_FOUND` | Dataset doesn't exist or no access | Check permissions |
| `COLUMN_NOT_FOUND` | Configured column missing | Re-select columns |
| `INVALID_DATE_FORMAT` | Dates couldn't be parsed | Check date format |
| `NO_VALID_TASKS` | Zero rows with valid start+end dates | Verify data quality |
| `CIRCULAR_DEPENDENCY` | Task depends on itself (directly or indirectly) | Fix dependency data |

---

## 5. Configuration Parameters

### 5.1 Required Parameters

| Parameter | Type | Purpose |
|-----------|------|---------|
| `idColumn` | COLUMN | Unique task identifier (for dependencies) |
| `nameColumn` | COLUMN | Task display name |
| `startColumn` | COLUMN | Task start date |
| `endColumn` | COLUMN | Task end date |

### 5.2 Optional Data Parameters

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `progressColumn` | COLUMN | — | Completion percentage (0-100) |
| `dependenciesColumn` | COLUMN | — | Comma-separated predecessor IDs |
| `colorColumn` | COLUMN | — | Categorical column for color coding |

### 5.3 View Parameters

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| `viewMode` | SELECT | Week | Hour, Quarter Day, Half Day, Day, Week, Month, Year |
| `viewModeSelect` | BOOLEAN | true | Show dropdown to change view |
| `scrollTo` | SELECT | today | today, start, end |

### 5.4 Appearance Parameters

| Parameter | Type | Default | Range |
|-----------|------|---------|-------|
| `barHeight` | INT | 30 | 15-60 |
| `barCornerRadius` | INT | 3 | 0-15 |
| `columnWidth` | INT | 45 | 20-100 |
| `padding` | INT | 18 | 5-40 |
| `darkMode` | BOOLEAN | false | — |
| `gridLines` | SELECT | both | none, vertical, horizontal, both |

### 5.5 Behavior Parameters

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `readonly` | BOOLEAN | true | Disable all editing |
| `popupOn` | SELECT | click | click, hover |
| `todayButton` | BOOLEAN | true | Show "Today" navigation |
| `highlightWeekends` | BOOLEAN | true | Visual weekend distinction |
| `language` | SELECT | en | Localization (11 languages) |

### 5.6 Performance Parameters

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `maxTasks` | INT | 1000 | Limit rows for performance (0 = unlimited) |

---

## 6. Edge Cases & Error Handling

### 6.1 Data Quality Issues

| Scenario | Behavior |
|----------|----------|
| **Empty dataset** | Show message: "No data available" |
| **No valid date rows** | Show message with count of skipped rows |
| **Start > End date** | Skip row, log warning, include in skipped count |
| **Null/empty task name** | Use "Task {row_number}" as fallback |
| **Null task ID** | Generate ID from row index |
| **Duplicate task IDs** | Append suffix: "id_1", "id_2" |
| **Invalid dependency reference** | Ignore that dependency, render task without arrow |
| **Circular dependencies** | Detect and break cycle, log warning |

### 6.2 Performance Scenarios

| Scenario | Behavior |
|----------|----------|
| **> 1000 tasks** | Apply maxTasks limit, show "Displaying X of Y tasks" |
| **> 10,000 tasks** | Recommend sampling, show warning |
| **Very long date range (10+ years)** | Default to Year view, warn user |
| **All tasks on same day** | Default to Hour view |

### 6.3 Date Parsing

Support these input formats (auto-detected):
- ISO 8601: `2024-01-15`, `2024-01-15T00:00:00`
- Pandas Timestamp objects
- Python datetime objects
- Unix timestamps (seconds)

Output always: `YYYY-MM-DD`

---

## 7. Library Bundling

### 7.1 Required Files

From Frappe Gantt `dist/` folder after build:

| File | Size | Purpose |
|------|------|---------|
| `frappe-gantt.umd.js` | ~50KB | Main library (UMD for browser) |
| `frappe-gantt.css` | ~8KB | Default styles |

### 7.2 Build Command

```bash
cd frappe-gantt
pnpm install
pnpm run build
# Output in dist/
```

### 7.3 Resource Loading

In `body.html`, reference bundled files via plugin resource path:
```html
<link rel="stylesheet" href="/plugins/gantt-chart/resource/frappe-gantt.css">
<script src="/plugins/gantt-chart/resource/frappe-gantt.umd.js"></script>
```

### 7.4 License Compliance

Frappe Gantt is MIT licensed. Include `LICENSE.txt` in resource folder with attribution.

---

## 8. File Structure

```
dss-plugin-gantt-chart/
├── plugin.json                 # Plugin metadata
├── LICENSE                     # Apache 2.0
├── README.md                   # User documentation
│
├── resource/
│   ├── frappe-gantt.umd.js    # Bundled library
│   ├── frappe-gantt.css       # Bundled styles
│   ├── frappe-gantt-LICENSE   # MIT license text
│   └── gantt-theme.css        # Dataiku style overrides
│
└── webapps/
    └── gantt-chart/
        ├── webapp.json        # Chart configuration (with "chart" field!)
        ├── backend.py         # Data transformation endpoints
        ├── app.js             # Frontend initialization
        ├── body.html          # HTML container
        └── style.css          # Component styles
```

---

## 9. Implementation Notes

### 9.1 Critical: The "chart" Field

The presence of the `chart` field in `webapp.json` is what makes this appear in the Charts tab. Without it, this would be a regular webapp. Structure:

```json
{
  "chart": {
    "datasetParamName": "dataset",
    "leftBarParams": [...],
    "topBar": "NONE"
  }
}
```

### 9.2 Column Picker Integration

Use `"type": "COLUMN"` parameters—Dataiku automatically provides the column picker UI that users expect from native charts.

### 9.3 Color Mapping Strategy

When `colorColumn` is specified:
1. Extract unique values from column
2. Assign CSS classes from a 12-color palette
3. Pass mapping to frontend
4. Apply `custom_class` to each task

### 9.4 Date Handling Priority

1. Try parsing as ISO string
2. Try pandas Timestamp conversion
3. Try Unix timestamp
4. Skip row and increment error counter

### 9.5 Dependency Validation

Before rendering:
1. Build adjacency list from dependency strings
2. Run cycle detection (DFS)
3. If cycle found: break at first back-edge, log warning
4. Render with valid dependencies only

---

## 10. Testing Requirements

### 10.1 Unit Tests (backend.py)

| Test | Input | Expected |
|------|-------|----------|
| Date parsing - ISO | "2024-01-15" | "2024-01-15" |
| Date parsing - Timestamp | pd.Timestamp(...) | "2024-01-15" |
| Date parsing - Invalid | "not-a-date" | None (skip row) |
| Color mapping | 5 unique values | 5 different CSS classes |
| Dependency parsing | "1,2,3" | ["1", "2", "3"] |
| Circular dependency | A→B→A | Cycle broken, warning logged |

### 10.2 Integration Tests

| Test | Steps | Expected |
|------|-------|----------|
| Basic render | Select 4 required columns | Chart displays tasks |
| Empty dataset | Use dataset with 0 rows | "No data" message |
| Large dataset | 5000 row dataset | Renders with limit warning |
| Dependencies | Tasks with valid deps | Arrows render between bars |
| View switching | Change from Week to Month | Chart re-renders correctly |

### 10.3 Visual Tests

- [ ] Task bars align with correct dates
- [ ] Progress fills proportionally
- [ ] Dependency arrows point correctly
- [ ] Weekend highlighting visible
- [ ] Dark mode colors apply
- [ ] Popup displays on interaction
- [ ] Today line visible and correct

---

## 11. Reference Implementation

### 11.1 Plugins to Study

| Plugin | What to Learn |
|--------|---------------|
| `dss-plugin-graph-analytics` | Custom chart with backend, bundled JS |
| `dss-plugin-hierarchical-charts` | Chart field configuration |
| `dss-plugin-waterfall-chart` | Simple chart structure |

### 11.2 Key Documentation

- Dataiku Community: "Documentation for webapp.json" (internal chart field docs)
- Frappe Gantt GitHub: Full API reference
- Dataiku Reference: Plugin webapps component guide

---

## 12. Acceptance Criteria

### 12.1 Must Have (MVP)

- [ ] Appears in Charts tab → Other
- [ ] Four required column pickers work
- [ ] Tasks render with correct positions
- [ ] View mode switching works
- [ ] Works offline (no external requests)
- [ ] Handles empty/invalid data gracefully

### 12.2 Should Have

- [ ] Dependencies render as arrows
- [ ] Progress bars display
- [ ] Color by category works
- [ ] All view modes functional
- [ ] Task popup on click
- [ ] Today button works

### 12.3 Nice to Have

- [ ] Dark mode
- [ ] All 11 languages
- [ ] Expected progress indicator
- [ ] Custom date format
- [ ] Infinite scroll padding

---

## Appendix A: Frappe Gantt Options Reference

Full mapping of Frappe Gantt constructor options to plugin parameters:

| Frappe Option | Plugin Parameter | Notes |
|---------------|------------------|-------|
| `view_mode` | `viewMode` | Direct mapping |
| `view_mode_select` | `viewModeSelect` | Direct mapping |
| `bar_height` | `barHeight` | Direct mapping |
| `bar_corner_radius` | `barCornerRadius` | Direct mapping |
| `column_width` | `columnWidth` | Direct mapping |
| `padding` | `padding` | Direct mapping |
| `container_height` | `containerHeight` | Parse "auto" or int |
| `lines` | `gridLines` | Direct mapping |
| `readonly` | `readonly` | Direct mapping |
| `readonly_dates` | `readonlyDates` | Direct mapping |
| `readonly_progress` | `readonlyProgress` | Direct mapping |
| `move_dependencies` | `moveDependencies` | Direct mapping |
| `popup_on` | `popupOn` | Direct mapping |
| `today_button` | `todayButton` | Direct mapping |
| `scroll_to` | `scrollTo` | Direct mapping |
| `auto_move_label` | `autoMoveLabel` | Direct mapping |
| `show_expected_progress` | `showExpectedProgress` | Direct mapping |
| `infinite_padding` | `infinitePadding` | Direct mapping |
| `snap_at` | `snapAt` | Direct mapping |
| `date_format` | `dateFormat` | Direct mapping |
| `language` | `language` | Direct mapping |
| `arrow_curve` | `arrowCurve` | Direct mapping |
| `holidays` | Derived from `highlightWeekends` | Conditional |
| `ignore` | Derived from `ignoreWeekends` | Conditional |
| `popup` | Custom implementation | Build custom HTML |

---

## Appendix B: Color Palette

Default CSS classes for categorical coloring:

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
.bar-gray    { fill: #607d8b; }
```

Cycle repeats for >12 categories.