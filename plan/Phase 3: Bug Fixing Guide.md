# Phase 3: Bug Fixing Guide

## Development Environment Setup

### Required Tools
- Python 3.6+ (tested with 3.10)
- pytest 6.2+
- pandas
- Dataiku DSS instance
- Browser with Developer Tools

### File Locations
```
/opt/dataiku/dss_design/plugins/dev/gantt-chart/
├── python-lib/ganttchart/          # Business logic
├── webapps/gantt-chart/            # Webapp files
├── tests/python/unit/              # Unit tests
├── resource/                       # Frappe Gantt library
├── plugin.json                     # Plugin metadata
└── plan/                          # This documentation
```

---

## Bug Fixing Workflow

### Step 1: Reproduce the Bug
1. Read bug report carefully
2. Recreate exact conditions (same data, same config)
3. Verify you can reproduce the issue
4. Document reproduction steps

### Step 2: Identify Root Cause
1. Check which component is failing:
   - **Frontend issue?** → Check browser console, app.js
   - **Backend issue?** → Check DSS logs, backend.py
   - **Data processing issue?** → Check python-lib modules
2. Add debug logging if needed
3. Isolate the failing function/module

### Step 3: Write Failing Test (TDD)
1. Add test case to appropriate test file
2. Run test to confirm it fails
3. This documents the bug and prevents regression

### Step 4: Fix the Bug
1. Make minimal changes to fix the issue
2. Don't refactor unrelated code
3. Follow existing code style

### Step 5: Run Tests
1. Run affected unit tests
2. Run full test suite
3. Ensure all tests pass

### Step 6: Manual Testing
1. Test fix in DSS UI
2. Verify original bug is resolved
3. Check for side effects

### Step 7: Document the Fix
1. Add comments if logic is complex
2. Update this guide if needed
3. Note the fix in bug tracker

---

## Common Bug Categories & Solutions

### Category 1: Date Parsing Issues

**Example Bug:** "Dates in DD/MM/YYYY format not recognized"

**Affected File:** `python-lib/ganttchart/date_parser.py`

**Debug Steps:**
1. Add test case with problematic date format
2. Run: `PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/test_date_parser.py -v -k "test_name"`
3. Check which parsing strategy is being used

**Common Fixes:**
- Add new regex pattern for date format
- Extend pd.to_datetime parsing options
- Add new parsing strategy to cascade

**Example Fix:**
```python
# In parse_date_to_iso() function
# Add after Strategy 7:

# Strategy 8: DD/MM/YYYY format
if isinstance(value, str):
    dd_mm_yyyy_pattern = re.compile(r'^\d{2}/\d{2}/\d{4}$')
    if dd_mm_yyyy_pattern.match(value):
        try:
            dt = datetime.datetime.strptime(value, '%d/%m/%Y')
            return (dt.strftime('%Y-%m-%d'), None)
        except ValueError:
            pass
```

---

### Category 2: Circular Dependency Detection Issues

**Example Bug:** "Cycle not detected when A→B→C→D→A"

**Affected File:** `python-lib/ganttchart/dependency_validator.py`

**Debug Steps:**
1. Create test case with specific cycle
2. Run: `PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/test_dependency_validator.py::TestDetectAndBreakCycles -v`
3. Add print statements in DFS function to trace execution

**Common Issues:**
- Missing node in adjacency list
- Wrong color initialization
- Edge not being marked as back-edge

**Debug Technique:**
```python
# Add to detect_and_break_cycles()
def dfs(node: str, path: List[str]):
    print(f"Visiting {node}, current path: {path}")  # DEBUG
    color[node] = GRAY
    path.append(node)

    for neighbor in adj_list.get(node, []):
        print(f"  Checking neighbor {neighbor}, color: {color.get(neighbor, 'NONE')}")  # DEBUG
        if neighbor not in color:
            continue
        if color[neighbor] == GRAY:
            print(f"  CYCLE DETECTED: {node} → {neighbor}")  # DEBUG
            cycle_edges.append((node, neighbor))
```

---

### Category 3: Frontend Rendering Issues

**Example Bug:** "Chart shows blank screen after loading"

**Affected Files:** `webapps/gantt-chart/app.js`, `webapps/gantt-chart/body.html`

**Debug Steps:**
1. Open browser Developer Tools (F12)
2. Check Console tab for JavaScript errors
3. Check Network tab for failed requests
4. Check Elements tab for `#gantt-container` content

**Common Causes:**
- Frappe Gantt library not loaded → Check for 404 on resource files
- Invalid task data format → Check `/get-tasks` response
- JavaScript syntax error → Check for red error in console
- CSS not loaded → Check for missing styles

**Fix Examples:**

**Issue: Library not loaded**
```javascript
// Add at start of app.js
console.log('Gantt library loaded:', typeof Gantt !== 'undefined');
if (typeof Gantt === 'undefined') {
    console.error('Frappe Gantt library not found!');
    displayError('Library Error', 'Failed to load Gantt library');
    return;
}
```

**Issue: Invalid task format**
```javascript
// Add validation before rendering
function validateTasks(tasks) {
    if (!Array.isArray(tasks)) {
        throw new Error('Tasks must be an array');
    }
    tasks.forEach((task, i) => {
        if (!task.id || !task.name || !task.start || !task.end) {
            console.error(`Invalid task at index ${i}:`, task);
            throw new Error(`Task ${i} missing required fields`);
        }
    });
}

// Before renderGantt()
validateTasks(tasksResponse.tasks);
```

---

### Category 4: Backend Endpoint Errors

**Example Bug:** "500 Internal Server Error when loading chart"

**Affected File:** `webapps/gantt-chart/backend.py`

**Debug Steps:**
1. Check DSS job logs: `tail -f DATA_DIR/jobs/*/log`
2. Look for Python traceback
3. Check which line is raising exception

**Common Causes:**
- Missing Python module → Check imports
- DataFrame operation error → Check pandas version
- KeyError on missing column → Add validation
- Type conversion error → Add try/except

**Fix Examples:**

**Issue: Missing column gracefully**
```python
# Before accessing column
if self.config.progress_column and self.config.progress_column in df.columns:
    progress = self._extract_progress(row[self.config.progress_column])
else:
    progress = None
```

**Issue: Better error messages**
```python
# In transform()
try:
    df = dataset.get_dataframe()
except Exception as e:
    logger.error(f"Failed to read dataset '{dataset_name}': {e}")
    return json.dumps({
        'error': {
            'code': 'DATASET_READ_ERROR',
            'message': f"Could not read dataset: {str(e)}",
            'details': {'dataset': dataset_name}
        }
    }), 500
```

---

### Category 5: Color Mapping Issues

**Example Bug:** "All tasks showing same color despite different categories"

**Affected File:** `python-lib/ganttchart/color_mapper.py`

**Debug Steps:**
1. Check `/get-tasks` response for colorMapping field
2. Verify unique values detected correctly
3. Check CSS classes applied to SVG elements

**Common Causes:**
- Column has only one unique value (excluding NaN)
- CSS classes not defined in style.css
- custom_class not being set on tasks
- Case sensitivity issues

**Fix Examples:**

**Issue: Case sensitivity**
```python
# In create_color_mapping()
# Before sorting
unique_values = df[column_name].dropna().unique()
# Make case-insensitive
unique_values = [str(v).lower() for v in unique_values]
unique_values = sorted(set(unique_values))
```

**Issue: CSS not applying**
```css
/* In style.css - make sure selectors are specific enough */
.gantt .bar.bar-blue {
    fill: #3498db !important;
}
/* Not just */
.bar-blue .bar {
    fill: #3498db !important;
}
```

---

### Category 6: Performance Issues

**Example Bug:** "Chart takes 30 seconds to load with 500 tasks"

**Affected Files:** `backend.py`, `task_transformer.py`, `app.js`

**Debug Steps:**
1. Add timing logs
2. Check browser Performance tab
3. Profile Python code if needed

**Common Causes:**
- Inefficient DataFrame operations
- Too many dependencies to validate
- Large data transfer (MB of JSON)
- Frappe Gantt rendering limit

**Fix Examples:**

**Issue: Slow DataFrame iteration**
```python
# SLOW:
for idx, row in df.iterrows():
    process_row(row)

# FAST:
for row in df.itertuples():
    process_row(row)

# FASTER:
df.apply(process_row, axis=1)  # if applicable
```

**Issue: Large JSON response**
```python
# In backend.py /get-tasks
# Add compression for large responses
import gzip
import io

response_json = json.dumps(result)
if len(response_json) > 100000:  # >100KB
    # Consider pagination or truncation
    logger.warning(f"Large response: {len(response_json)} bytes")
```

**Issue: Too many dependencies**
```python
# In dependency_validator.py
# Skip cycle detection if no dependencies
if all(not t.get('dependencies') for t in tasks):
    return (tasks, [])  # Fast path
```

---

## Running Tests During Development

### Run All Tests
```bash
cd /opt/dataiku/dss_design/plugins/dev/gantt-chart
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v
```

### Run Specific Test File
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/test_date_parser.py -v
```

### Run Specific Test
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/test_date_parser.py::TestParseDateToISO::test_iso_string -v
```

### Run with Coverage
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ --cov=ganttchart --cov-report=html
# Open htmlcov/index.html in browser
```

### Run Tests on File Change (Watch Mode)
```bash
pip install pytest-watch
PYTHONPATH=python-lib:$PYTHONPATH ptw tests/python/unit/
```

---

## Hot Reload During Development

### Backend Changes (backend.py or python-lib)
1. Make changes to Python files
2. In DSS: Charts → Actions → Reload
3. Refresh browser

**Note:** DSS caches Python modules. For guaranteed reload:
- Restart DSS backend: `bin/dss restart backend`
- Or change plugin version in plugin.json

### Frontend Changes (app.js, style.css, body.html)
1. Make changes to files
2. In DSS: Charts → Actions → Reload
3. Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

**Note:** Browser caches static files. For guaranteed reload:
- Open DevTools → Network → Disable cache
- Or append `?v=2` to resource URLs in body.html

---

## Debugging Techniques

### Python Debugging

**Add Debug Logs:**
```python
import logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# In function
logger.debug(f"Processing task {task_id}: {task}")
logger.debug(f"Dependencies before validation: {dependencies}")
```

**Interactive Debugging:**
```python
# Add breakpoint (Python 3.7+)
import pdb; pdb.set_trace()

# Or
breakpoint()
```

**Print DataFrame:**
```python
# See DataFrame structure
print(df.info())
print(df.head())
print(df.describe())

# See specific columns
print(df[['task_id', 'start', 'end']])
```

### JavaScript Debugging

**Console Logging:**
```javascript
console.log('Variable:', variable);
console.error('Error:', error);
console.table(tasks);  // Nice table format
console.group('Task Processing');
tasks.forEach(t => console.log(t.name));
console.groupEnd();
```

**Debugger:**
```javascript
// Add breakpoint
debugger;

// Conditional breakpoint
if (task.id === 'problematic-id') {
    debugger;
}
```

**Inspect Objects:**
```javascript
// In browser console
console.log(dataiku.getWebAppConfig());
console.log(ganttInstance);
```

### Network Debugging

**Check Backend Response:**
```bash
# Using curl
curl -X GET "http://localhost:PORT/get-tasks?config=%7B%22dataset%22%3A%22test%22%7D&filters=%5B%5D"

# Or in browser console
fetch('/get-tasks?config={"dataset":"test"}&filters=[]')
  .then(r => r.json())
  .then(d => console.log(d));
```

---

## Testing Changes in DSS

### Quick Test Cycle
1. Make code change
2. Run unit test: `pytest tests/python/unit/test_file.py -k test_name -v`
3. If test passes, reload plugin in DSS
4. Manually test in UI
5. If works, commit change

### Full Test Before Commit
1. Run all unit tests: `pytest tests/python/unit/ -v`
2. Check all 77 tests pass
3. Test in DSS with sample data
4. Test edge cases from Phase 2 guide
5. Check browser console for errors
6. Check DSS logs for warnings
7. If all pass, commit

---

## Git Workflow (if using version control)

### Creating Feature Branch
```bash
git checkout -b fix/issue-description
```

### Committing Fix
```bash
git add python-lib/ganttchart/date_parser.py
git add tests/python/unit/test_date_parser.py
git commit -m "Fix: Handle DD/MM/YYYY date format

- Add new parsing strategy for DD/MM/YYYY
- Add test case for European date format
- Resolves #123"
```

### Before Pushing
```bash
# Run tests
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v

# Check code style (if using linter)
flake8 python-lib/ganttchart/

# Create pull request or merge to main
```

---

## Known Limitations & Workarounds

### Limitation 1: Frappe Gantt Readonly Mode
**Issue:** Even with `readonly: false`, Frappe Gantt drag-to-edit doesn't write back to Dataiku
**Impact:** Users can't edit tasks by dragging
**Workaround:** Keep `readonly: true` (default)
**Future:** Implement `/update-task` endpoint if write-back needed

### Limitation 2: Large Dependency Graphs
**Issue:** 1000+ dependencies slow down cycle detection
**Impact:** >5 second load time
**Workaround:** Use maxTasks limit, filter data
**Future:** Optimize DFS algorithm with memoization

### Limitation 3: Date Format Detection
**Issue:** Some exotic date formats not recognized
**Impact:** Rows skipped if format unknown
**Workaround:** Users should standardize dates to ISO format
**Future:** Add more parsing strategies

### Limitation 4: Color Palette Size
**Issue:** Only 12 colors, cycles for >12 categories
**Impact:** Duplicate colors for large datasets
**Workaround:** Filter to fewer categories, or accept cycling
**Future:** Allow custom color palettes in config

---

## Code Style Guidelines

### Python
- Follow PEP 8
- Use type hints where helpful
- Document complex logic with comments
- Keep functions under 50 lines
- One class per file (except helpers)

**Example:**
```python
def parse_date_to_iso(value: any) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse a date value to ISO format string (YYYY-MM-DD).

    Args:
        value: Date value in any supported format

    Returns:
        Tuple of (iso_date_string, error_message)
    """
```

### JavaScript
- Use strict mode: `'use strict';`
- Use const/let, not var
- Use arrow functions for callbacks
- Add JSDoc comments for complex functions
- Use meaningful variable names

**Example:**
```javascript
/**
 * Fetch tasks from backend
 * @param {Object} config - Webapp configuration
 * @param {Array} filters - Dataiku filters
 * @returns {Promise<Object>} Tasks and metadata
 */
function fetchTasks(config, filters) {
    const params = {
        config: JSON.stringify(config),
        filters: JSON.stringify(filters)
    };
    return dataiku.webappBackend.get('get-tasks', params);
}
```

---

## When to Add Tests

### Always Add Tests For:
- New features
- Bug fixes (write failing test first)
- Edge cases discovered
- Refactored code

### Test Structure:
```python
class TestNewFeature:
    """Tests for new feature."""

    def test_basic_case(self):
        """Test basic functionality."""
        result = new_feature(basic_input)
        assert result == expected_output

    def test_edge_case(self):
        """Test edge case."""
        result = new_feature(edge_input)
        assert result == expected_edge_output

    def test_error_handling(self):
        """Test error is raised."""
        with pytest.raises(ValueError):
            new_feature(invalid_input)
```

---

## Releasing Updates

### Version Numbering (Semantic Versioning)
- **Patch (0.0.X):** Bug fixes, no new features
- **Minor (0.X.0):** New features, backward compatible
- **Major (X.0.0):** Breaking changes

### Release Checklist
- [ ] All tests pass (77/77)
- [ ] Manual testing complete
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped in plugin.json
- [ ] Git tag created
- [ ] Plugin reloaded in DSS
- [ ] User testing completed
- [ ] Known issues documented

### Update plugin.json
```json
{
    "id": "gantt-chart",
    "version": "0.1.0",  // Increment here
    "meta": { ... }
}
```

---

## Getting Help

### Internal Resources
- Phase 1: Implementation Summary.md (this folder)
- Phase 2: QA Testing Guide.md (this folder)
- Original plan: /home/dataiku/.claude/plans/zazzy-finding-falcon.md
- Plugin spec: plugin-spec.md (project root)
- Dataiku docs: cli-docs/ folder

### External Resources
- Frappe Gantt docs: https://github.com/frappe/gantt
- Dataiku plugin API: https://doc.dataiku.com/dss/latest/plugins/
- Python pandas docs: https://pandas.pydata.org/docs/
- Flask docs: https://flask.palletsprojects.com/

### Code Comments
Most complex logic has inline comments explaining:
- Why a particular approach was chosen
- Edge cases being handled
- Algorithm complexity
- References to external docs

---

## Emergency Rollback

If critical bug discovered in production:

### Quick Rollback
1. In DSS: Administration → Plugins → gantt-chart
2. Actions → Delete
3. Reinstall previous version from backup
4. Or: Git checkout previous tag

### Partial Rollback (Frontend Only)
1. Revert changes in webapps/gantt-chart/
2. Reload plugin
3. Hard refresh browser

### Partial Rollback (Backend Only)
1. Revert changes in backend.py or python-lib/
2. Reload plugin or restart DSS backend

---

## Contact & Escalation

For questions about this implementation:
- Review this documentation first
- Check original plan file
- Review git history/commits
- Test in isolation with unit tests
- Add detailed logs and debug

**Implementation Details Known:**
- Architecture decisions and rationale
- All edge cases considered
- Testing methodology
- Performance optimizations
- Library integration (Frappe Gantt)

**Ready to support:**
- Bug analysis
- Feature additions
- Performance tuning
- Test coverage expansion
- Code reviews
