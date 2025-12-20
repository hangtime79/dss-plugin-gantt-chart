# Bugfix v0.2.3 Specification

## Branch
`bugfix/v0.2.3-fix-dependency-arrows`

## Overview
Fix dependency arrows not rendering. Frappe Gantt expects `dependencies` as an array but the backend sends a comma-separated string.

---

## Bug: Dependency Arrows Not Rendering

### Symptom
- Tasks with dependencies configured show no connecting arrows
- Dependencies column is configured and data contains valid references
- No JavaScript errors in console (fails silently)

### Root Cause
**Type mismatch between backend output and Frappe Gantt expectation.**

Frappe Gantt calls `.map()` on `task.dependencies`:
```javascript
// node_modules/frappe-gantt/src/index.js:884
arrows = task.dependencies.map((task_id) => { ... })
```

But the backend sends dependencies as a string:
```python
# python-lib/ganttchart/task_transformer.py:286
task['dependencies'] = deps  # Returns "task1,task2" (string)
```

When `.map()` is called on a string, it returns `undefined` - no arrows render.

---

## Fix Plan

### Step 1: Change Return Type
**File:** `python-lib/ganttchart/task_transformer.py`

The `_extract_dependencies` method returns a comma-separated string. Change the assignment on line 286 to convert this to a list before assigning to the task.

**Current:**
```python
task['dependencies'] = deps  # string: "task1,task2"
```

**Change to:**
```python
task['dependencies'] = [d.strip() for d in deps.split(',') if d.strip()] if deps else []
```

This produces `["task1", "task2"]` which Frappe Gantt can iterate.

### Step 2: Version Bump
**File:** `plugin.json`

Change version from `0.2.2` to `0.2.3`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `python-lib/ganttchart/task_transformer.py` | Edit | Convert dependencies string to list on line 286 |
| `plugin.json` | Edit | Version bump to 0.2.3 |

---

## Testing Checklist

After implementation:
- [ ] Create test data with dependencies (e.g., Task B depends on Task A)
- [ ] Configure dependenciesColumn in webapp settings
- [ ] Verify arrows render between dependent tasks
- [ ] Verify arrow direction is correct (points from dependency to dependent)
- [ ] Verify tasks without dependencies still render correctly
- [ ] Verify empty dependency values don't cause errors
- [ ] No JavaScript errors in console
- [ ] Unit tests pass

---

## User QA Gate

**STOP: Do not commit or merge until user has completed QA.**

After implementing the fix:
1. Notify the user that the fix is ready for QA
2. Provide clear steps for the user to test in their Dataiku environment
3. Wait for explicit user approval before proceeding
4. If user reports issues, address them before continuing

**QA Script for User:**
```
1. Reload the plugin in Dataiku (Actions menu > Reload)
2. Open the Gantt Chart webapp
3. Ensure dependenciesColumn is configured to your dependencies column
4. Verify: Do arrows appear connecting dependent tasks?
5. Verify: Is arrow direction correct (from predecessor to successor)?
6. Verify: Do tasks without dependencies render normally?
```

**Do not proceed to commit until user confirms the fix works.**

---

## Rollback Plan

If issues occur:
1. Restore file: `git checkout HEAD~1 -- python-lib/ganttchart/task_transformer.py`
2. Investigate root cause before re-attempting

---

## Watch Out For

1. **Empty Strings**: Ensure empty dependency values produce `[]` not `[""]`

2. **Whitespace**: The split should strip whitespace from each dependency ID

3. **Downstream Effects**: The `dependency_validator.py` module also processes dependencies. Verify it handles both string and list formats, or update consistently.
