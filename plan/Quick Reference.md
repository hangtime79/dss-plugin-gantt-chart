# Quick Reference Guide

## File Structure at a Glance

```
gantt-chart/
├── plugin.json                              # Plugin metadata
├── python-lib/ganttchart/                   # Business logic
│   ├── __init__.py
│   ├── date_parser.py                      # Date parsing strategies
│   ├── color_mapper.py                     # Category → color mapping
│   ├── dependency_validator.py             # Cycle detection (DFS)
│   └── task_transformer.py                 # Main orchestrator
├── webapps/gantt-chart/                     # Webapp files
│   ├── webapp.json                         # Chart config (19 params)
│   ├── backend.py                          # Flask endpoints
│   ├── app.js                              # Frontend logic
│   ├── body.html                           # HTML + library loading
│   └── style.css                           # Styling + colors
├── tests/python/unit/                       # Unit tests (77 total)
│   ├── conftest.py                         # Test fixtures
│   ├── test_date_parser.py                # 28 tests
│   ├── test_color_mapper.py               # 18 tests
│   ├── test_dependency_validator.py       # 16 tests
│   └── test_task_transformer.py           # 15 tests
├── resource/                                # Bundled library
│   ├── frappe-gantt.umd.js                # Main library
│   ├── frappe-gantt.css                   # Styles
│   └── license.txt                        # MIT license
└── plan/                                    # Documentation
    ├── Phase 1: Implementation Summary.md
    ├── Phase 2: QA Testing Guide.md
    ├── Phase 3: Bug Fixing Guide.md
    └── Quick Reference.md                 # This file
```

---

## Commands Cheat Sheet

### Run All Tests
```bash
cd /opt/dataiku/dss_design/plugins/dev/gantt-chart
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v
```

### Run Specific Test File
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/test_date_parser.py -v
```

### Run Single Test
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/test_date_parser.py::TestParseDateToISO::test_iso_string -v
```

### Test with Coverage
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ --cov=ganttchart --cov-report=html
# Open htmlcov/index.html
```

### Check Files Modified
```bash
git status
```

### View Backend Logs
```bash
tail -f DATA_DIR/jobs/*/log | grep -i gantt
```

---

## Module Quick Reference

### date_parser.py
```python
from ganttchart.date_parser import parse_date_to_iso, validate_date_range

# Parse any date format → ISO
date_str, error = parse_date_to_iso("2024-01-15")
# Returns: ("2024-01-15", None)

date_str, error = parse_date_to_iso("not-a-date")
# Returns: (None, "invalid_format: str")

# Validate date range
is_valid = validate_date_range("2024-01-01", "2024-01-10")
# Returns: True
```

### color_mapper.py
```python
from ganttchart.color_mapper import create_color_mapping, get_task_color_class

# Create mapping from DataFrame
mapping = create_color_mapping(df, 'category')
# Returns: {'Dev': 'bar-blue', 'QA': 'bar-green', ...}

# Get color class for value
color = get_task_color_class('Dev', mapping)
# Returns: 'bar-blue'

color = get_task_color_class(None, mapping)
# Returns: 'bar-gray'
```

### dependency_validator.py
```python
from ganttchart.dependency_validator import validate_all_dependencies

# Validate and break cycles
tasks = [
    {'id': 'A', 'dependencies': 'B'},
    {'id': 'B', 'dependencies': 'A'}  # Cycle!
]

validated_tasks, warnings = validate_all_dependencies(tasks)
# Returns: (modified_tasks, ["Circular dependency detected: ..."])
```

### task_transformer.py
```python
from ganttchart.task_transformer import TaskTransformer, TaskTransformerConfig

# Configure transformer
config = TaskTransformerConfig(
    id_column='task_id',
    name_column='task_name',
    start_column='start',
    end_column='end',
    progress_column='progress',       # Optional
    dependencies_column='deps',       # Optional
    color_column='category',          # Optional
    max_tasks=1000
)

# Transform DataFrame
transformer = TaskTransformer(config)
result = transformer.transform(df)

# Result structure:
{
    'tasks': [
        {
            'id': 'T1',
            'name': 'Task 1',
            'start': '2024-01-01',
            'end': '2024-01-05',
            'progress': 50,
            'dependencies': 'T0',
            'custom_class': 'bar-blue'
        }
    ],
    'metadata': {
        'totalRows': 100,
        'displayedRows': 95,
        'skippedRows': 5,
        'skipReasons': {'invalid_dates': 5},
        'warnings': [...]
    },
    'colorMapping': {'Dev': 'bar-blue', ...}
}
```

---

## API Quick Reference

### Backend Endpoints

#### GET /get-tasks
**Parameters:**
- `config` (JSON string): Webapp configuration
- `filters` (JSON string): Dataiku filters

**Success Response (200):**
```json
{
  "tasks": [Task, ...],
  "metadata": {...},
  "colorMapping": {...}
}
```

**Error Response (400/500):**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

#### GET /get-config
**Parameters:** None

**Response (200):**
```json
{
  "view_mode": "Week",
  "bar_height": 30,
  ...
}
```

---

## Frontend Quick Reference

### Dataiku APIs

```javascript
// Get webapp config
const config = dataiku.getWebAppConfig()['webAppConfig'];

// Call backend
dataiku.webappBackend.get('get-tasks', {
    config: JSON.stringify(config),
    filters: JSON.stringify(filters)
}).then(response => {
    // response is already parsed JSON
    console.log(response.tasks);
});

// Display error
dataiku.webappMessages.displayFatalError('Error message');

// Request config updates
window.parent.postMessage("sendConfig", "*");
```

### Frappe Gantt API

```javascript
// Initialize
const gantt = new Gantt('#gantt-svg', tasks, {
    view_mode: 'Week',
    bar_height: 30,
    readonly: true,
    popup: function(task) { return '<div>...</div>'; }
});

// Change view
gantt.change_view_mode('Month');

// Refresh
gantt.refresh(newTasks);
```

---

## Test Data Templates

### Minimum Valid Dataset
```csv
task_id,task_name,start_date,end_date
T1,Task 1,2024-01-01,2024-01-05
T2,Task 2,2024-01-05,2024-01-10
T3,Task 3,2024-01-10,2024-01-15
```

### Full Featured Dataset
```csv
task_id,task_name,start_date,end_date,progress,dependencies,category
T1,Planning,2024-01-01,2024-01-05,100,,Planning
T2,Design,2024-01-05,2024-01-10,75,T1,Design
T3,Dev,2024-01-10,2024-01-20,50,T2,Development
T4,Test,2024-01-20,2024-01-25,25,T3,QA
T5,Deploy,2024-01-25,2024-01-30,0,T4,Deployment
```

### Edge Cases Dataset
```csv
task_id,task_name,start_date,end_date,progress,dependencies,category
T1,,2024-01-01,2024-01-05,150,T1,Dev
T2,Task 2,not-a-date,2024-01-10,0,,Dev
T3,Task 3,2024-01-15,2024-01-10,-10,T9,
T4,Task 4,2024-01-10,2024-01-15,invalid,T2,T3,QA
```

---

## Error Codes Reference

| Code | Meaning | User Action |
|------|---------|-------------|
| `DATASET_NOT_SPECIFIED` | No dataset selected | Select a dataset |
| `DATASET_NOT_FOUND` | Dataset doesn't exist | Check permissions |
| `EMPTY_DATASET` | No rows after filtering | Adjust filters or add data |
| `COLUMN_NOT_FOUND` | Column missing | Re-select columns |
| `NO_VALID_TASKS` | All rows invalid | Check date formats |
| `INVALID_CONFIGURATION` | Bad config params | Check parameter values |
| `INTERNAL_ERROR` | Unexpected exception | Check logs, report bug |

---

## Configuration Parameters

### Required (4)
- `idColumn` - Unique task identifier
- `nameColumn` - Task display name
- `startColumn` - Task start date
- `endColumn` - Task end date

### Optional Data (3)
- `progressColumn` - Completion % (0-100)
- `dependenciesColumn` - Comma-separated IDs
- `colorColumn` - Categorical column

### View (3)
- `viewMode` - Hour/Day/Week/Month/Year (default: Week)
- `viewModeSelect` - Show dropdown (default: true)
- `scrollTo` - today/start/end (default: today)

### Appearance (4)
- `barHeight` - 15-60 (default: 30)
- `barCornerRadius` - 0-15 (default: 3)
- `columnWidth` - 20-100 (default: 45)
- `padding` - 5-40 (default: 18)

### Behavior (4)
- `readonly` - Disable editing (default: true)
- `popupOn` - click/hover (default: click)
- `todayButton` - Show today button (default: true)
- `highlightWeekends` - Highlight weekends (default: true)

### Performance (1)
- `maxTasks` - Max tasks to display (default: 1000, 0 = unlimited)

**Total: 19 parameters**

---

## Color Palette

```
bar-blue    → #3498db (Primary)
bar-green   → #2ecc71 (Success)
bar-orange  → #e67e22 (Warning)
bar-purple  → #9b59b6 (Info)
bar-red     → #e74c3c (Danger)
bar-teal    → #1abc9c
bar-pink    → #e91e63
bar-indigo  → #3f51b5
bar-cyan    → #00bcd4
bar-amber   → #ffc107
bar-lime    → #cddc39
bar-gray    → #607d8b (Default)
```

Cycles for >12 categories

---

## Common Issues Quick Fix

| Issue | Quick Fix |
|-------|-----------|
| Blank chart | Check browser console for errors |
| 500 error | Check DSS backend logs |
| Wrong dates | Verify date column format |
| No arrows | Check dependency format: "T1,T2" |
| Same colors | Check categories are different |
| Slow loading | Reduce maxTasks or filter data |
| Library not loaded | Check resource/ files exist |

---

## Browser Console Debug Commands

```javascript
// Check library loaded
typeof Gantt !== 'undefined'

// Get current config
dataiku.getWebAppConfig()

// Manually fetch tasks
dataiku.webappBackend.get('get-tasks', {
    config: JSON.stringify(dataiku.getWebAppConfig()['webAppConfig']),
    filters: '[]'
}).then(r => console.log(r))

// Check Gantt instance
ganttInstance

// Get container
document.getElementById('gantt-container')
```

---

## Test Status Summary

✅ **77/77 tests passing (100%)**

- ✅ date_parser: 28/28
- ✅ color_mapper: 18/18
- ✅ dependency_validator: 16/16
- ✅ task_transformer: 15/15

**Coverage:** >90% of business logic

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.0.1 | 2024-12-18 | Initial implementation |
|  |  | - All core features |
|  |  | - 77 unit tests |
|  |  | - Complete documentation |

---

## Next Steps

1. **QA Testing** → See "Phase 2: QA Testing Guide.md"
2. **Bug Fixes** → See "Phase 3: Bug Fixing Guide.md"
3. **Release** → Update version, create README
4. **Production** → Deploy to production DSS instance

---

## Documentation Index

📄 **Phase 1: Implementation Summary.md**
- What was built
- Module details
- File-by-file breakdown
- Implementation stats

📄 **Phase 2: QA Testing Guide.md**
- Test scenarios
- Edge cases
- Expected behaviors
- Bug report template

📄 **Phase 3: Bug Fixing Guide.md**
- Development workflow
- Common bug categories
- Debugging techniques
- Release process

📄 **Quick Reference.md** (this file)
- Commands cheat sheet
- API reference
- Quick fixes
