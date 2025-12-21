# Feature v0.3.0 Specification: Hierarchical Grouping ("Super Sort")

## Branch
`feature/v0.3.0-hierarchical-grouping`

## Overview

Add hierarchical task grouping that organizes tasks by categorical columns (Region, Workstream, Country, etc.) before applying standard sorting rules. Users can select N columns for multi-level grouping (e.g., Country → Region → State), with the existing "Sort Tasks By" applying within each lowest-level group.

---

## User Story

> As a user managing complex data, I want to group my tasks by high-level categories (like Region or Workstream) before the standard sorting rules apply, so that I can organize my view by organizational structure.

---

## Feature: Hierarchical Grouping

### Behavior

1. **Multi-Level Grouping**: Users select 1+ columns for hierarchical organization
   - Example: Select `Country`, then `Region`, then `State`
   - Tasks grouped first by Country, then by Region within each Country, etc.

2. **Integration with Existing Sort**: The current "Sort Tasks By" applies within each leaf group
   - If grouped by Region with sort "Start Date (Earliest First)":
     - All APAC tasks appear together, sorted by start date
     - All EMEA tasks appear together, sorted by start date
     - etc.

3. **Group Ordering**: Groups themselves are sorted alphabetically by default
   - Null/empty values sorted to the end with label "(No Value)"

4. **No Visual Separators**: This version maintains flat task list (no group headers in UI)
   - Future enhancement: Add collapsible group headers

---

## UI Design

### Location
**Left Sidebar** → New section **"Task Grouping"** placed between "Optional Columns" and "Tooltip Fields"

### Parameter Configuration

```json
{
    "type": "SEPARATOR",
    "label": "Task Grouping"
},
{
    "name": "groupByColumns",
    "type": "DATASET_COLUMNS",
    "datasetParamName": "dataset",
    "label": "Group By",
    "description": "Group tasks hierarchically by these columns. Drag to set grouping order (first = outermost group).",
    "mandatory": false
}
```

### UX Pattern
Uses the same `DATASET_COLUMNS` pattern as "Tooltip Fields":
- Multi-select dropdown for columns
- Drag-to-reorder for controlling hierarchy
- Familiar interaction pattern for existing users

---

## Technical Design

### Data Flow

```
webapp.json (groupByColumns)
    ↓
backend.py (extract config)
    ↓
TaskTransformerConfig (group_by_columns)
    ↓
TaskTransformer.transform()
    ↓
group_and_sort_tasks() in sort_utils.py
    ↓
Frappe Gantt (renders grouped/sorted tasks)
```

### Algorithm: `group_and_sort_tasks()`

```python
def group_and_sort_tasks(
    tasks: List[Dict],
    group_by_columns: List[str],
    sort_by: str
) -> List[Dict]:
    """
    Group tasks hierarchically, then sort within each group.

    Args:
        tasks: List of task dictionaries (must include group column values)
        group_by_columns: Ordered list of column names for hierarchical grouping
        sort_by: Sort criteria to apply within each leaf group

    Returns:
        Flattened list of tasks in grouped, sorted order
    """
    if not group_by_columns:
        return sort_tasks(tasks, sort_by)

    # Build nested groups recursively
    def group_recursive(task_list, columns, depth=0):
        if depth >= len(columns) or not task_list:
            # Leaf level - apply sorting
            return sort_tasks(task_list, sort_by)

        col = columns[depth]
        groups = {}
        no_value_tasks = []

        for task in task_list:
            # Get group value from task's group_values dict
            val = task.get('_group_values', {}).get(col)
            if val is None or val == '':
                no_value_tasks.append(task)
            else:
                key = str(val)
                if key not in groups:
                    groups[key] = []
                groups[key].append(task)

        # Sort group keys alphabetically
        sorted_keys = sorted(groups.keys())

        # Recursively process each group
        result = []
        for key in sorted_keys:
            result.extend(group_recursive(groups[key], columns, depth + 1))

        # Add no-value tasks at the end
        if no_value_tasks:
            result.extend(group_recursive(no_value_tasks, columns, depth + 1))

        return result

    return group_recursive(tasks, group_by_columns)
```

---

## Implementation Plan

### Step 1: Update webapp.json
**File:** `webapps/gantt-chart/webapp.json`

Add new "Task Grouping" section with `groupByColumns` parameter after "Optional Columns" separator (around line 82):

```json
{
    "type": "SEPARATOR",
    "label": "Task Grouping"
},
{
    "name": "groupByColumns",
    "type": "DATASET_COLUMNS",
    "datasetParamName": "dataset",
    "label": "Group By",
    "description": "Group tasks hierarchically by these columns. Drag to set grouping order (first = outermost group).",
    "mandatory": false
}
```

### Step 2: Update TaskTransformerConfig
**File:** `python-lib/ganttchart/task_transformer.py`

Add new field to dataclass (line ~33):

```python
@dataclass
class TaskTransformerConfig:
    """Configuration for the task transformer."""
    id_column: str
    start_column: str
    end_column: str
    name_column: Optional[str] = None
    progress_column: Optional[str] = None
    dependencies_column: Optional[str] = None
    color_column: Optional[str] = None
    tooltip_columns: Optional[List[str]] = None
    group_by_columns: Optional[List[str]] = None  # NEW
    sort_by: str = 'none'
    max_tasks: int = 1000
```

### Step 3: Capture Group Values in Task Objects
**File:** `python-lib/ganttchart/task_transformer.py`

In `_process_row()`, add group column values to task object (around line 325):

```python
# Add group column values for hierarchical sorting
if self.config.group_by_columns:
    group_values = {}
    for col in self.config.group_by_columns:
        if col in row.index:
            val = row[col]
            if pd.isna(val):
                group_values[col] = None
            else:
                group_values[col] = str(val).strip()
    if group_values:
        task['_group_values'] = group_values
```

### Step 4: Add Grouping Function to sort_utils.py
**File:** `python-lib/ganttchart/sort_utils.py`

Add new function `group_and_sort_tasks()` (implementation above) and update imports.

### Step 5: Update backend.py
**File:** `webapps/gantt-chart/backend.py`

Update transformer config creation (line ~98):

```python
transformer_config = TaskTransformerConfig(
    id_column=config.get('idColumn'),
    name_column=config.get('nameColumn'),
    start_column=config.get('startColumn'),
    end_column=config.get('endColumn'),
    progress_column=config.get('progressColumn'),
    dependencies_column=config.get('dependenciesColumn'),
    color_column=config.get('colorColumn'),
    tooltip_columns=config.get('tooltipColumns'),
    group_by_columns=config.get('groupByColumns'),  # NEW
    max_tasks=int(config.get('maxTasks', 1000))
)
```

Update sorting logic (line ~118):

```python
# Apply grouping and sorting
group_by = config.get('groupByColumns', [])
sort_by = config.get('sortBy', 'none')

if group_by:
    result['tasks'] = group_and_sort_tasks(result['tasks'], group_by, sort_by)
elif sort_by and sort_by != 'none':
    result['tasks'] = sort_tasks(result['tasks'], sort_by)
```

### Step 6: Version Bump
**File:** `plugin.json`

Change version from `0.2.3` to `0.3.0`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/webapp.json` | Edit | Add "Task Grouping" section with groupByColumns parameter |
| `python-lib/ganttchart/task_transformer.py` | Edit | Add group_by_columns to config; capture group values in tasks |
| `python-lib/ganttchart/sort_utils.py` | Edit | Add group_and_sort_tasks() function |
| `webapps/gantt-chart/backend.py` | Edit | Pass groupByColumns to config; call grouping function |
| `tests/python/unit/test_sort_utils.py` | Edit | Add tests for group_and_sort_tasks() |
| `plugin.json` | Edit | Version bump to 0.3.0 |

---

## Testing Checklist

### Unit Tests
- [ ] `group_and_sort_tasks()` with single grouping column
- [ ] `group_and_sort_tasks()` with multiple grouping columns (2-3 levels)
- [ ] `group_and_sort_tasks()` with empty/null values in grouping columns
- [ ] `group_and_sort_tasks()` with no grouping columns (fallback to sort_tasks)
- [ ] `group_and_sort_tasks()` combined with each sort_by option
- [ ] `_group_values` correctly populated in task objects
- [ ] Groups sorted alphabetically
- [ ] Null/empty values sorted to end of each group level

### Manual Testing
- [ ] Group By dropdown appears in sidebar under "Task Grouping"
- [ ] Can select single column - tasks group correctly
- [ ] Can select multiple columns - hierarchical grouping works
- [ ] Drag-to-reorder changes grouping hierarchy
- [ ] "Sort Tasks By" applies within each group
- [ ] Empty grouping column works (shows all tasks, no grouping)
- [ ] Null values in data handled gracefully
- [ ] Performance acceptable with 100+ tasks and 3 grouping levels

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing the fix, commit with message:
   ```
   feat(v0.3.0): Add hierarchical task grouping

   Adds "Group By" parameter allowing users to organize tasks by
   categorical columns before standard sorting applies.

   Changes:
   - webapp.json: Add groupByColumns parameter in new Task Grouping section
   - task_transformer.py: Capture group column values in task objects
   - sort_utils.py: Add group_and_sort_tasks() for hierarchical grouping
   - backend.py: Wire up grouping configuration

   Supports N-level hierarchy (e.g., Country → Region → State)
   with standard sorting within each leaf group.
   ```

2. Verify commit: `git log --oneline -1`

3. Notify user that code is committed and ready for QA

**QA Script for User:**
```
1. Reload the plugin in Dataiku (Actions menu → Reload)
2. Open the Gantt Chart webapp
3. Verify: "Task Grouping" section appears in left sidebar
4. Select a single categorical column (e.g., Region) in "Group By"
5. Verify: Tasks are grouped by that column
6. Add a second column (e.g., Team) to "Group By"
7. Verify: Tasks grouped hierarchically (Region → Team)
8. Set "Sort Tasks By" to "Start Date (Earliest First)"
9. Verify: Within each group, tasks are sorted by start date
10. Drag to reorder the grouping columns
11. Verify: Grouping hierarchy updates accordingly
```

**Do not proceed to PR/merge until user confirms the feature works.**

---

## Rollback Plan

If issues occur:
```bash
git checkout main -- webapps/gantt-chart/webapp.json
git checkout main -- python-lib/ganttchart/task_transformer.py
git checkout main -- python-lib/ganttchart/sort_utils.py
git checkout main -- webapps/gantt-chart/backend.py
```

---

## Watch Out For

1. **Performance with Large Datasets**: Recursive grouping on 1000+ tasks with 3+ levels could be slow. Consider iterative approach if performance issues arise.

2. **Column Name Conflicts**: Group column names should not conflict with internal task properties. Using `_group_values` prefix avoids this.

3. **Frontend Display**: This version maintains flat list (no visual group headers). Future enhancement could add collapsible sections.

4. **Type Coercion**: Group values should be normalized to strings for consistent sorting. Handle numeric columns that might group as "1.0" vs "1".

5. **Empty Array vs None**: `groupByColumns` may come as `[]`, `None`, or `[""]`. Handle all cases.

6. **Interaction with Dependencies Sort**: If `sort_by = 'dependencies'` (topological), grouping may break dependency chains. Consider warning or disabling grouping when topological sort is selected.

---

## Future Enhancements (Not in Scope)

1. **Visual Group Headers**: Add collapsible group separators in the Gantt chart
2. **Group Aggregation**: Show summary stats (task count, date range) for each group
3. **Custom Group Sort Order**: Allow sorting groups by first task date instead of alphabetically
4. **Save Grouping Presets**: Allow users to save favorite grouping configurations
