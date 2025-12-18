# Phase 2: QA Testing Guide

## Pre-Testing Setup

### 1. Reload Plugin in Dataiku
```bash
# From DSS UI:
# Administration → Plugins → gantt-chart → Actions → Reload
```

### 2. Create Test Dataset

**Minimum Test Dataset:**
```csv
task_id,task_name,start_date,end_date,progress,dependencies,category
T1,Planning,2024-01-01,2024-01-05,100,,Planning
T2,Design,2024-01-05,2024-01-10,75,T1,Design
T3,Development,2024-01-10,2024-01-20,50,T2,Development
T4,Testing,2024-01-20,2024-01-25,25,T3,QA
T5,Deployment,2024-01-25,2024-01-30,0,T4,Deployment
```

**Save as:** "test_gantt_data" dataset in your project

---

## Test Scenarios

### Scenario 1: Basic Chart Creation (Happy Path)

**Objective:** Verify chart renders with minimum configuration

**Steps:**
1. Navigate to dataset → Charts tab
2. Click "+" → Other → "Gantt Chart"
3. Configure:
   - Task ID: task_id
   - Task Name: task_name
   - Start Date: start_date
   - End Date: end_date
4. Click "Create"

**Expected Result:**
- ✅ Chart renders within 3 seconds
- ✅ 5 task bars visible
- ✅ Tasks positioned correctly by dates
- ✅ Task names displayed on bars
- ✅ Timeline shows correct date range
- ✅ No error messages

**If Failed:**
- Check browser console for JavaScript errors
- Check backend logs: `tail -f DATA_DIR/jobs/*/log`
- Verify Frappe Gantt library loaded: Check Network tab for `/plugins/gantt-chart/resource/frappe-gantt.umd.js`

---

### Scenario 2: Dependencies with Arrows

**Objective:** Verify dependency arrows render correctly

**Steps:**
1. Create chart as in Scenario 1
2. Add configuration:
   - Dependencies: dependencies
3. Observe chart

**Expected Result:**
- ✅ Arrows connect tasks (T1→T2, T2→T3, T3→T4, T4→T5)
- ✅ Arrows point from predecessor to successor
- ✅ No overlapping or misaligned arrows
- ✅ Arrow curves are smooth

**If Failed:**
- Check that dependency column has correct format: "T1,T2" (comma-separated)
- Verify task IDs in dependency column match actual task IDs
- Check for circular dependencies in logs

---

### Scenario 3: Progress Bars

**Objective:** Verify progress indicators display correctly

**Steps:**
1. Create chart as in Scenario 1
2. Add configuration:
   - Progress (%): progress
3. Observe chart

**Expected Result:**
- ✅ T1 shows 100% (fully filled bar)
- ✅ T2 shows 75% (3/4 filled)
- ✅ T3 shows 50% (half filled)
- ✅ T4 shows 25% (1/4 filled)
- ✅ T5 shows 0% (empty/outline)
- ✅ Progress bars darker shade of main bar color

**If Failed:**
- Check progress values are numeric 0-100
- Values outside range should be clamped (check logs for warnings)
- Check CSS: `.gantt .bar-progress` should have correct fill

---

### Scenario 4: Color by Category

**Objective:** Verify color coding works

**Steps:**
1. Create chart as in Scenario 1
2. Add configuration:
   - Color By: category
3. Observe chart

**Expected Result:**
- ✅ Each category has different color
- ✅ Planning = blue
- ✅ Design = green
- ✅ Development = orange
- ✅ QA = purple
- ✅ Deployment = red
- ✅ Colors are vibrant and distinguishable

**If Failed:**
- Check CSS classes applied: `.bar-blue`, `.bar-green`, etc.
- Verify color_mapper created mapping (check backend response)
- Check style.css loaded correctly

---

### Scenario 5: Task Popup on Click

**Objective:** Verify popup shows task details

**Steps:**
1. Create chart as in Scenario 1
2. Configure all optional fields (progress, dependencies, color)
3. Click on a task bar (e.g., T2)

**Expected Result:**
- ✅ Popup appears immediately
- ✅ Popup shows:
  - Task name: "Design"
  - Date range: "2024-01-05 to 2024-01-10"
  - Progress: "Progress: 75%"
  - Dependencies: "Depends on: T1"
- ✅ Popup positioned near task bar
- ✅ Popup has white background, readable text

**If Failed:**
- Check `buildPopupHTML()` function in app.js
- Verify popup_on setting is "click"
- Check browser console for JavaScript errors

---

### Scenario 6: View Mode Switching

**Objective:** Verify different time scales work

**Steps:**
1. Create chart as in Scenario 1
2. Ensure "Show view mode dropdown" is enabled
3. Click view mode dropdown (top of chart)
4. Select each mode: Day, Week, Month

**Expected Result:**
- ✅ Dropdown shows all 7 options
- ✅ Day view: Each column = 1 day
- ✅ Week view: Each column = 1 week (default)
- ✅ Month view: Each column = 1 month
- ✅ Chart re-renders smoothly
- ✅ Task bars adjust proportionally

**If Failed:**
- Check `view_mode_select` config is true
- Verify Frappe Gantt version supports all modes
- Check JavaScript console for errors during switch

---

### Scenario 7: Today Button

**Objective:** Verify "Today" button scrolls correctly

**Steps:**
1. Create chart as in Scenario 1
2. Ensure "Show 'Today' button" is enabled
3. Scroll chart to far right
4. Click "Today" button

**Expected Result:**
- ✅ "Today" button visible (usually top-right)
- ✅ Clicking button scrolls to current date
- ✅ Today marker (vertical line) is centered or visible
- ✅ Button remains functional after multiple clicks

**If Failed:**
- Check `today_button` config is true
- Verify current date is within chart date range
- Check Frappe Gantt initialization options

---

### Scenario 8: Filtering Integration

**Objective:** Verify Dataiku filtering works

**Steps:**
1. Create chart as in Scenario 1
2. Enable filtering (Charts → Filter)
3. Add filter: category = "Development"
4. Apply filter

**Expected Result:**
- ✅ Chart updates to show only T3 (Development)
- ✅ No errors during filter application
- ✅ Clearing filter restores all tasks

**If Failed:**
- Check `canFilter: true` in webapp.json
- Verify `apply_dataiku_filters()` in backend.py
- Check backend logs for filter parsing errors

---

## Edge Case Testing

### Edge Case 1: Empty Dataset

**Steps:**
1. Create empty dataset (0 rows)
2. Try to create Gantt chart

**Expected Result:**
- ✅ Error message: "Dataset is empty or all rows filtered out"
- ✅ Error code: EMPTY_DATASET
- ✅ No chart rendered
- ✅ Clear instructions for user

---

### Edge Case 2: Invalid Date Formats

**Test Data:**
```csv
task_id,task_name,start_date,end_date
T1,Task1,not-a-date,2024-01-10
T2,Task2,2024-01-05,invalid
T3,Task3,2024-01-10,2024-01-15
```

**Expected Result:**
- ✅ T1 and T2 skipped
- ✅ T3 renders correctly
- ✅ Metadata banner: "Showing 1 of 3 tasks (2 skipped)"
- ✅ Skip reasons: "2 invalid_dates"

---

### Edge Case 3: Start Date After End Date

**Test Data:**
```csv
task_id,task_name,start_date,end_date
T1,Task1,2024-01-10,2024-01-05
T2,Task2,2024-01-05,2024-01-15
```

**Expected Result:**
- ✅ T1 skipped
- ✅ T2 renders correctly
- ✅ Skip reasons: "1 start_after_end"
- ✅ Warning in logs

---

### Edge Case 4: Circular Dependencies

**Test Data:**
```csv
task_id,task_name,start_date,end_date,dependencies
T1,Task1,2024-01-01,2024-01-05,T3
T2,Task2,2024-01-05,2024-01-10,T1
T3,Task3,2024-01-10,2024-01-15,T2
```

**Expected Result:**
- ✅ All 3 tasks render
- ✅ At least one dependency arrow removed to break cycle
- ✅ Warning in metadata: "Circular dependency: T1→T2→T3→T1. Removing edge..."
- ✅ Remaining dependencies still render as arrows

---

### Edge Case 5: Duplicate Task IDs

**Test Data:**
```csv
task_id,task_name,start_date,end_date
T1,Task1,2024-01-01,2024-01-05
T1,Task2,2024-01-05,2024-01-10
T1,Task3,2024-01-10,2024-01-15
```

**Expected Result:**
- ✅ All 3 tasks render
- ✅ IDs renamed: T1, T1_1, T1_2
- ✅ Warning in metadata about duplicates
- ✅ Each task distinguishable

---

### Edge Case 6: Null/Empty Task Names

**Test Data:**
```csv
task_id,task_name,start_date,end_date
T1,,2024-01-01,2024-01-05
T2,,2024-01-05,2024-01-10
```

**Expected Result:**
- ✅ Both tasks render
- ✅ Names generated: "Task 0", "Task 1" (or similar)
- ✅ Generated names visible on bars

---

### Edge Case 7: Large Dataset (>1000 tasks)

**Steps:**
1. Create dataset with 2000 rows
2. Create Gantt chart (maxTasks default = 1000)

**Expected Result:**
- ✅ Only first 1000 tasks rendered
- ✅ Metadata banner: "Showing 1000 of 2000 tasks"
- ✅ Warning about maxTasks limit
- ✅ Chart renders in <5 seconds
- ✅ No browser freeze or crash

---

### Edge Case 8: Self-Dependencies

**Test Data:**
```csv
task_id,task_name,start_date,end_date,dependencies
T1,Task1,2024-01-01,2024-01-05,T1
T2,Task2,2024-01-05,2024-01-10,T2,T1
```

**Expected Result:**
- ✅ Both tasks render
- ✅ Self-dependencies removed (T1 doesn't depend on T1)
- ✅ Valid dependency preserved (T2→T1 arrow shows)
- ✅ Warning about self-dependencies

---

### Edge Case 9: Missing Dependency References

**Test Data:**
```csv
task_id,task_name,start_date,end_date,dependencies
T1,Task1,2024-01-01,2024-01-05,T9
T2,Task2,2024-01-05,2024-01-10,T1,T8,T7
```

**Expected Result:**
- ✅ Both tasks render
- ✅ T1 has no arrows (T9 doesn't exist)
- ✅ T2 only shows arrow to T1 (T8, T7 removed)
- ✅ Warning about missing references

---

### Edge Case 10: Progress Outside [0, 100]

**Test Data:**
```csv
task_id,task_name,start_date,end_date,progress
T1,Task1,2024-01-01,2024-01-05,-10
T2,Task2,2024-01-05,2024-01-10,150
T3,Task3,2024-01-10,2024-01-15,invalid
```

**Expected Result:**
- ✅ T1 shows 0% (clamped from -10)
- ✅ T2 shows 100% (clamped from 150)
- ✅ T3 shows no progress indicator (invalid value omitted)
- ✅ No errors, graceful handling

---

## Performance Testing

### Test 1: Render Time
**Dataset:** 1000 valid tasks
**Expected:** Chart renders in <3 seconds

### Test 2: Interaction Responsiveness
**Actions:** Click task, switch view mode, scroll
**Expected:** No lag, smooth animations

### Test 3: Memory Usage
**Dataset:** 1000 tasks
**Expected:** <100MB browser memory usage

### Test 4: Concurrent Users
**Scenario:** 10 users viewing different charts
**Expected:** No backend errors, all charts render

---

## Browser Compatibility Testing

**Test Browsers:**
- ✅ Chrome (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Edge (latest)

**Expected:** Consistent rendering and functionality across all browsers

---

## Common Issues & Solutions

### Issue 1: "Frappe Gantt library not loaded"
**Symptoms:** Error message on chart load
**Causes:**
- Resource files not accessible
- Incorrect plugin path
- Browser blocking scripts

**Debug:**
1. Check browser Network tab
2. Look for 404 errors on `/plugins/gantt-chart/resource/frappe-gantt.umd.js`
3. Verify file exists: `ls resource/frappe-gantt.umd.js`
4. Check file permissions

**Solution:**
- Ensure resource files are in correct location
- Reload plugin
- Clear browser cache

---

### Issue 2: "Column not found" error
**Symptoms:** Error message when creating chart
**Causes:**
- Selected column doesn't exist in dataset
- Typo in column name
- Dataset schema changed

**Debug:**
1. Check backend logs for error details
2. Verify column names in dataset
3. Check webapp config passed to backend

**Solution:**
- Re-select columns in UI
- Refresh dataset schema
- Check for case sensitivity

---

### Issue 3: Dependencies not showing arrows
**Symptoms:** Tasks render but no connecting arrows
**Causes:**
- Dependency format incorrect (not comma-separated)
- Referenced task IDs don't exist
- Circular dependency removed all dependencies

**Debug:**
1. Check browser console for warnings
2. Verify dependency column format
3. Check backend logs for validation warnings

**Solution:**
- Ensure dependencies are comma-separated: "T1,T2,T3"
- Verify all referenced IDs exist
- Check for and resolve circular dependencies

---

### Issue 4: Chart doesn't render/shows blank
**Symptoms:** White screen or empty container
**Causes:**
- JavaScript error halted execution
- No valid tasks after filtering
- CSS not loaded

**Debug:**
1. Open browser Developer Tools
2. Check Console tab for errors
3. Check Elements tab for `#gantt-container` content
4. Verify backend returned tasks

**Solution:**
- Fix JavaScript errors
- Check dataset has valid rows
- Verify CSS files loaded

---

### Issue 5: Slow rendering on large datasets
**Symptoms:** >10 second load time, browser freezes
**Causes:**
- Too many tasks (>1000)
- maxTasks set to 0 (unlimited)
- Browser running out of memory

**Debug:**
1. Check metadata.displayedRows count
2. Verify maxTasks setting
3. Monitor browser memory (F12 → Performance → Memory)

**Solution:**
- Reduce maxTasks limit
- Filter dataset before visualization
- Sample large datasets

---

## Logging & Debugging

### Backend Logs
**Location:** `DATA_DIR/jobs/*/log` (DSS job logs)

**Enable Debug Logging:**
```python
# In backend.py
logger.setLevel(logging.DEBUG)
```

**Key Log Messages:**
- "Reading dataset: {name}"
- "Transformed {n} tasks from {m} rows"
- "Dependency validation found {n} issues"
- "Cycle detection completed. Broke {n} cyclic dependencies"

### Frontend Debugging
**Browser Console (F12):**
- "Gantt Chart webapp initializing..."
- "Received config: {...}"
- "Fetching tasks with params: {...}"
- "Rendering Gantt with {n} tasks"
- "Gantt chart rendered successfully"

**Check Network Tab:**
- `/get-tasks` request should return 200 OK
- `/get-config` request should return 200 OK
- Response bodies should be valid JSON

### Test Data Inspection
**Check backend response:**
```javascript
// In browser console after chart loads:
dataiku.webappBackend.get('get-tasks', {
  config: JSON.stringify(dataiku.getWebAppConfig()['webAppConfig']),
  filters: '[]'
}).then(r => console.log(r));
```

---

## Acceptance Criteria Checklist

### Must Have (MVP)
- [ ] Appears in Charts tab → Other section
- [ ] Four required column pickers work
- [ ] Tasks render with correct date positions
- [ ] View mode switching works (Day/Week/Month)
- [ ] Works offline (no external requests)
- [ ] Handles empty/invalid data gracefully

### Should Have
- [ ] Dependencies render as arrows
- [ ] Progress bars display correctly
- [ ] Color by category works
- [ ] All 7 view modes functional
- [ ] Task popup on click shows details
- [ ] Today button scrolls to current date
- [ ] Weekend highlighting visible
- [ ] Filtering integration works

### Performance
- [ ] Handles 1,000 tasks smoothly (<3s render)
- [ ] No browser freeze or crash
- [ ] Memory usage reasonable (<100MB)

### Error Handling
- [ ] Empty dataset shows clear error
- [ ] Invalid dates skipped with metadata
- [ ] Circular dependencies detected and broken
- [ ] Missing columns show helpful error
- [ ] User-friendly error messages

---

## Bug Reporting Template

When reporting bugs to developer, include:

```
**Bug Title:** [Short description]

**Environment:**
- Dataiku DSS Version: [version]
- Browser: [Chrome/Firefox/Safari/Edge + version]
- Plugin Version: 0.0.1

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happens]

**Screenshots:**
[Attach screenshots if applicable]

**Console Errors:**
[Paste JavaScript console errors]

**Backend Logs:**
[Paste relevant backend log lines]

**Test Data:**
[Sample CSV or dataset description]
```

---

## Next Steps After QA

Once QA testing is complete and bugs are fixed:
1. Update version in plugin.json (0.0.1 → 0.1.0)
2. Create README.md with user documentation
3. Add example datasets
4. Create video tutorial/screenshots
5. Submit to Plugin Store (if applicable)
6. Deploy to production environment

See "Phase 3: Bug Fixing Guide.md" for development workflow when fixing bugs.
