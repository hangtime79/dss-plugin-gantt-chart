# Feature v0.11.0 Specification: Defensive Programming

## Branch
`feature/v0.11.0-defensive-programming`

## Linked Issues
- Fixes #76 - Enhanced ID uniqueness handling
- Fixes #77 - Improved loading/empty states
- Fixes #83 - Missing dependency warnings

## Overview
Improve error handling and user feedback throughout the plugin. This release adds validation warnings, better loading states, and dependency visibility indicators to help users understand and troubleshoot issues.

---

## Feature 1: Enhanced ID Uniqueness Handling (#76)

### Current State
- `TaskTransformer` auto-renames duplicate IDs (e.g., `task_1`, `task_2`)
- Warning added to `metadata.warnings` array
- No visibility in UI about duplicates or their impact

### Requirements

#### 1.1 Strict Mode Option
Add `duplicateIdHandling` parameter to `webapp.json`:
- `"rename"` (default): Current behavior - auto-rename with suffix
- `"skip"`: Skip duplicate rows, keep first occurrence only

#### 1.2 Structured Duplicate Metadata
Enhance metadata to categorize duplicate ID issues:
```python
metadata = {
    'warnings': [...],  # General warnings (existing)
    'duplicateIds': [   # NEW: Structured duplicate info
        {
            'originalId': 'TASK-001',
            'occurrences': [
                {'rowIndex': 5, 'assignedId': 'TASK-001'},
                {'rowIndex': 12, 'assignedId': 'TASK-001_1'},
                {'rowIndex': 18, 'assignedId': 'TASK-001_2'}
            ]
        }
    ]
}
```

#### 1.3 Dependency Impact Warnings
When a task is renamed due to duplicate ID:
- Check if any other tasks reference the original ID as a dependency
- Add warning: "Task 'TASK-001_1' was renamed. Dependencies referencing 'TASK-001' may be ambiguous."

#### 1.4 UI Warning Banner
Display dismissible banner when duplicates are detected:
- "X duplicate task IDs were found and auto-renamed. Check console for details."

### Files to Modify
| File | Change |
|------|--------|
| `webapp.json` | Add `duplicateIdHandling` SELECT param |
| `task_transformer.py` | Implement strict mode, structured metadata, dependency impact check |
| `app.js` | Display duplicate warning banner |
| `style.css` | Warning banner styles (reuse zoom banner pattern) |

---

## Feature 2: Improved Loading and Empty States (#77)

### Current State
- Generic skeleton loader during initialization
- Basic error display via `displayError()`
- No distinction between "loading", "not configured", and "error"

### Requirements

#### 2.1 Descriptive Loading Messages
Modify `showLoading()` to accept optional message parameter:
```javascript
showLoading('Loading configuration...');
showLoading('Fetching task data...');
showLoading('Rendering chart...');
```

#### 2.2 Setup Required State
When chart is not configured (missing required fields):
- Display "Setup Required" card instead of error
- List what needs to be configured:
  - Dataset (if not selected)
  - ID Column (if not mapped)
  - Start/End Date columns (if not mapped)
- Visual distinction from fatal errors (info style, not error style)

#### 2.3 Empty Dataset State
When dataset is configured but has no rows:
- Display "No Tasks Found" message
- Suggest checking data filters or dataset contents

#### 2.4 Zero Tasks After Filter State
Already implemented in v0.9.8 - verify it uses consistent styling.

### Files to Modify
| File | Change |
|------|--------|
| `app.js` | Enhance `showLoading()`, add `showSetupRequired()`, add `showEmptyDataset()` |
| `body.html` | Add setup-required container template |
| `style.css` | Setup required and empty state styles |

---

## Feature 3: Missing Dependency Warnings (#83)

### Current State
- Dependencies that don't exist or are filtered out simply don't render
- No visual indication to user that arrows are missing
- Tooltip shows dependency list but no status

### Requirements

#### 3.1 Dependency Status Detection
Track three categories:
- **Visible**: Dependency exists and is displayed
- **Filtered**: Dependency exists but hidden by filter
- **Missing**: Dependency ID not found in dataset

#### 3.2 Tooltip Enhancement
Modify tooltip dependency display:
```
Depends on:
  ✓ Task A (visible)
  ⚠ Task B (filtered)
  ⚠ Task C (not found)
```

Use icons/colors to distinguish status:
- Visible: Normal text (or subtle checkmark)
- Filtered: Warning icon + "(filtered)" suffix
- Missing: Warning icon + "(not found)" suffix

#### 3.3 Warning Banner
Display dismissible banner when any dependencies are unresolved:
- Triggered when filtering hides dependency targets
- Triggered on initial load if invalid dependency references exist
- Text: "Some dependency arrows are hidden. Hover over tasks for details."
- Reuse banner pattern from zoom limit banner

#### 3.4 Detection Logic
```javascript
function analyzeDependencies(visibleTaskIds, allTaskIds) {
    return {
        filtered: [],  // IDs that exist but not visible
        missing: []    // IDs that don't exist at all
    };
}
```

### Files to Modify
| File | Change |
|------|--------|
| `app.js` | Add dependency analysis, enhance tooltip, add warning banner |
| `style.css` | Dependency status styles in tooltip, banner styles |

---

## Implementation Order

Recommended sequence for SDE:

1. **#77 - Loading States** (foundational)
   - Least dependencies on other features
   - Improves debugging experience for later work

2. **#76 - ID Uniqueness** (Python-first)
   - Backend changes in task_transformer.py
   - UI banner for warnings

3. **#83 - Dependency Warnings** (builds on #76)
   - Uses the duplicate detection metadata
   - Most complex tooltip changes

---

## Testing Checklist

### #76 - ID Uniqueness
- [ ] Duplicate IDs auto-renamed with suffix (default behavior)
- [ ] Skip mode drops duplicates, keeps first
- [ ] Metadata includes structured `duplicateIds` array
- [ ] Warning banner appears when duplicates detected
- [ ] Dependency impact warning when renamed ID was a dependency target

### #77 - Loading States
- [ ] Loading overlay shows descriptive messages
- [ ] Setup Required state shows when dataset not selected
- [ ] Setup Required state shows when required columns not mapped
- [ ] Setup Required is visually distinct from errors
- [ ] Empty dataset shows appropriate message
- [ ] Filter empty state consistent with other empty states

### #83 - Dependency Warnings
- [ ] Tooltip shows dependency status (visible/filtered/missing)
- [ ] Banner appears when dependencies are filtered out
- [ ] Banner appears on load if invalid dependency references exist
- [ ] Banner is dismissible
- [ ] Banner reappears if filter state changes to hide more dependencies

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. Commit with message format:
   ```
   feat(v0.11.0): Add defensive programming enhancements (#76, #77, #83)
   ```
2. Verify commit: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
=== LOADING STATES (#77) ===
1. Reload plugin (Actions → Reload)
2. Open Gantt chart webapp
3. Verify loading shows descriptive message during init
4. Create NEW webapp (don't select dataset)
5. Verify "Setup Required" message appears (not error)
6. Verify message lists: Dataset, ID Column, Start/End Dates

=== ID UNIQUENESS (#76) ===
7. Create test data with duplicate IDs:
   - Row 1: ID="DUP", name="First"
   - Row 2: ID="DUP", name="Second"
8. Load in Gantt chart
9. Verify both tasks appear (one renamed to "DUP_1")
10. Verify warning banner appears about duplicates
11. Optional: Test "Skip" mode in settings (if enabled)

=== DEPENDENCY WARNINGS (#83) ===
12. Create test data with dependencies:
    - Task A: id="A", no dependencies
    - Task B: id="B", depends on "A"
    - Task C: id="C", depends on "MISSING"
13. Load in Gantt chart
14. Hover on Task C - verify tooltip shows "MISSING (not found)"
15. Filter to show only "Completed" tasks (hiding Task A)
16. Hover on Task B - verify tooltip shows "A (filtered)"
17. Verify warning banner appears about hidden dependencies
```

**Do not proceed to PR/merge until user confirms all features work.**

---

## Rollback Plan
Revert changes to:
- `webapp.json`
- `task_transformer.py`
- `app.js`
- `body.html`
- `style.css`

Reset version to 0.10.1.

---

## Watch Out For

- **Banner stacking**: Multiple banners (zoom, duplicate, dependency) need vertical stacking
- **Tooltip width**: Additional dependency status may need wider tooltip
- **Performance**: Dependency analysis runs on each filter change - keep it O(n)
- **Consistency**: Use same warning icon/color across all features
- **Dismissal persistence**: Decide if banner dismissal persists across filter changes
- **Interaction with #51**: Filter buttons affect which dependencies are "filtered"
