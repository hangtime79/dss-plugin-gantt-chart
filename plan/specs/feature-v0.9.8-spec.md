# Feature v0.9.8 Specification - Task Filtering

## Branch
`feature/v0.9.8-task-filtering`

## Linked Issues
- Fixes #51

## Overview
Add filter buttons to the control bar that allow users to show/hide tasks based on their status: All, Completed, Overdue, In-Process, Not Started.

---

## Feature: Task Status Filtering

### User Story
As a user, I want to filter the Gantt chart by task status so I can focus on specific categories of work (e.g., only overdue tasks, only completed tasks).

### Design Decisions (User Confirmed)
1. **Multiple Selection**: OR logic - can select multiple filters (e.g., Overdue AND In-Process shows both)
2. **Placement**: Left side of control bar, right of "Project Timeline" brand title
3. **Overdue Overlap**: Overdue tasks also appear in In-Process/Not Started when those filters are active

### Status Definitions
| Status | Condition |
|--------|-----------|
| Completed | progress === 100 |
| Overdue | progress < 100 AND end_date < today |
| In-Process | progress > 0 AND progress < 100 |
| Not Started | progress === 0 |

Note: Overdue is NOT mutually exclusive - an overdue task can also be In-Process or Not Started.

---

## Implementation Plan

### Step 1: Add Filter Buttons HTML
**File:** `webapps/gantt-chart/body.html`

Add after the brand-title div (line ~18), inside the first control-group:

```html
<div class="filter-group">
    <button id="btn-filter-all" class="btn btn-filter active" data-status="all" title="Show All Tasks">
        All
    </button>
    <button id="btn-filter-completed" class="btn btn-filter" data-status="completed" title="Show Completed Tasks">
        Completed
    </button>
    <button id="btn-filter-overdue" class="btn btn-filter" data-status="overdue" title="Show Overdue Tasks">
        Overdue
    </button>
    <button id="btn-filter-in-progress" class="btn btn-filter" data-status="in-progress" title="Show In-Process Tasks">
        In Progress
    </button>
    <button id="btn-filter-not-started" class="btn btn-filter" data-status="not-started" title="Show Not Started Tasks">
        Not Started
    </button>
</div>
```

### Step 2: Add Filter Button Styles
**File:** `resource/webapp/style.css`

```css
/* Task Filter Buttons */
.filter-group {
    display: flex;
    gap: 4px;
    margin-left: var(--spacing-md);
}

.btn-filter {
    padding: 4px 10px;
    font-size: 12px;
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
}

.btn-filter:hover {
    background: var(--color-background);
    color: var(--text-main);
}

.btn-filter.active {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
}

/* Dark mode */
.dark-theme .btn-filter {
    background: var(--color-surface);
    border-color: var(--color-border);
}

.dark-theme .btn-filter.active {
    background: var(--color-accent);
}
```

### Step 3: Add Filter Logic to JavaScript
**File:** `webapps/gantt-chart/app.js`

#### 3a. Add state variable (near line 63 with other state vars)
```javascript
let activeFilters = ['all']; // Track active filter buttons
```

#### 3b. Add getTaskStatus function (new function)
```javascript
/**
 * Determine task status based on progress and dates.
 * Note: Overdue is NOT mutually exclusive with In-Process/Not Started.
 * @param {Object} task - Task object with progress, start, end properties
 * @returns {string[]} Array of applicable statuses
 */
function getTaskStatuses(task) {
    const statuses = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(task.end);
    endDate.setHours(0, 0, 0, 0);

    const progress = task.progress || 0;

    if (progress === 100) {
        statuses.push('completed');
    } else {
        // Not completed - check other statuses
        if (endDate < today) {
            statuses.push('overdue');
        }
        if (progress > 0) {
            statuses.push('in-progress');
        } else {
            statuses.push('not-started');
        }
    }

    return statuses;
}
```

#### 3c. Add applyTaskFilters function (new function)
```javascript
/**
 * Apply active filters to hide/show task bars in DOM.
 * Uses display:none on bar-wrapper elements.
 */
function applyTaskFilters() {
    const barWrappers = document.querySelectorAll('.gantt .bar-wrapper');
    let visibleCount = 0;

    barWrappers.forEach(wrapper => {
        const taskId = wrapper.getAttribute('data-id');
        const task = currentTasks.find(t => t.id === taskId);
        if (!task) return;

        const taskStatuses = getTaskStatuses(task);

        // Show if 'all' is active OR any of task's statuses match active filters
        const shouldShow = activeFilters.includes('all') ||
            taskStatuses.some(status => activeFilters.includes(status));

        wrapper.style.display = shouldShow ? '' : 'none';
        if (shouldShow) visibleCount++;
    });

    // Update empty state if needed
    updateFilterEmptyState(visibleCount);
}
```

#### 3d. Add empty state handler (new function)
```javascript
/**
 * Show/hide empty state message when no tasks match filter.
 */
function updateFilterEmptyState(visibleCount) {
    let emptyMsg = document.getElementById('filter-empty-message');

    if (visibleCount === 0 && !activeFilters.includes('all')) {
        if (!emptyMsg) {
            emptyMsg = document.createElement('div');
            emptyMsg.id = 'filter-empty-message';
            emptyMsg.className = 'filter-empty-state';
            emptyMsg.textContent = 'No tasks match the selected filter(s)';
            document.getElementById('gantt-container').appendChild(emptyMsg);
        }
        emptyMsg.style.display = 'block';
    } else if (emptyMsg) {
        emptyMsg.style.display = 'none';
    }
}
```

#### 3e. Add setupFilterButtons function (new function)
```javascript
/**
 * Initialize filter button event listeners.
 */
function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.btn-filter');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const status = btn.dataset.status;

            if (status === 'all') {
                // "All" clears other filters
                activeFilters = ['all'];
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            } else {
                // Toggle this filter
                const allBtn = document.getElementById('btn-filter-all');

                if (activeFilters.includes('all')) {
                    // Switching from "All" to specific filter
                    activeFilters = [status];
                    allBtn.classList.remove('active');
                } else if (activeFilters.includes(status)) {
                    // Remove this filter
                    activeFilters = activeFilters.filter(f => f !== status);
                    if (activeFilters.length === 0) {
                        // No filters = show all
                        activeFilters = ['all'];
                        allBtn.classList.add('active');
                    }
                } else {
                    // Add this filter
                    activeFilters.push(status);
                }

                // Update button states
                filterButtons.forEach(b => {
                    if (b.dataset.status === 'all') return;
                    b.classList.toggle('active', activeFilters.includes(b.dataset.status));
                });
            }

            applyTaskFilters();
            console.log('Active filters:', activeFilters);
        });
    });
}
```

#### 3f. Call setupFilterButtons in initialization
In the existing init flow (around line 865 where setupControls is called):
```javascript
setupFilterButtons();
```

#### 3g. Re-apply filters after render
In renderGantt() after gantt is created (around line 984):
```javascript
// Re-apply filters after render
requestAnimationFrame(() => {
    applyTaskFilters();
});
```

#### 3h. Re-apply filters on view change
In on_view_change callback (around line 968):
```javascript
// Re-apply filters after view change
requestAnimationFrame(() => {
    applyTaskFilters();
});
```

### Step 4: Add Empty State Styles
**File:** `resource/webapp/style.css`

```css
/* Filter empty state */
.filter-empty-state {
    display: none;
    text-align: center;
    padding: var(--spacing-xl);
    color: var(--text-muted);
    font-size: 14px;
}
```

### Step 5: Version Bump
**File:** `plugin.json`

Change version from `"0.9.7"` to `"0.9.8"`

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/body.html` | Modify | Add filter button group |
| `webapps/gantt-chart/app.js` | Modify | Add filter state, functions, event handlers |
| `resource/webapp/style.css` | Modify | Add filter button and empty state styles |
| `plugin.json` | Modify | Version bump to 0.9.8 |

---

## Testing Checklist
- [ ] Filter buttons appear to the right of "Project Timeline"
- [ ] "All" button is active by default
- [ ] Clicking "Completed" shows only 100% progress tasks
- [ ] Clicking "Overdue" shows only past-due incomplete tasks
- [ ] Clicking "In Progress" shows tasks with 0 < progress < 100
- [ ] Clicking "Not Started" shows tasks with progress = 0
- [ ] Multiple filters can be selected (OR logic)
- [ ] Overdue task also shows when "In Progress" or "Not Started" selected
- [ ] Clicking active filter deselects it
- [ ] When no filters active, defaults back to "All"
- [ ] Filters persist across view mode changes
- [ ] Empty state shows when no tasks match
- [ ] Dark mode styling works correctly
- [ ] Button hover states work

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. After implementing the fix, commit with message:
   ```
   feat(v0.9.8): Add task status filtering (#51)

   Adds filter buttons to show/hide tasks by status:
   - All, Completed, Overdue, In Progress, Not Started
   - Multiple selection with OR logic
   - Overdue tasks also appear in In-Process/Not Started

   Changes:
   - body.html: Add filter button group
   - app.js: Add filter state, getTaskStatuses(), applyTaskFilters()
   - style.css: Add filter button and empty state styles
   - plugin.json: Version bump to 0.9.8

   Fixes #51
   ```

2. Verify commit: `git log --oneline -1`
3. Notify user that code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open a Gantt chart with tasks of varying progress/dates
3. Verify filter buttons appear right of "Project Timeline"
4. Click "Completed" - verify only 100% tasks shown
5. Click "Overdue" - verify only past-due incomplete tasks shown
6. Click "In Progress" - verify 0 < progress < 100 tasks shown
7. Click "Not Started" - verify progress = 0 tasks shown
8. Test multi-select: Click "Overdue" then "In Progress" - both should show
9. Verify overdue task appears in both Overdue and its original status
10. Click active filter to deselect - verify it toggles off
11. Deselect all filters - verify "All" becomes active
12. Switch view modes - verify filters persist
13. Test dark mode styling
14. Test with filter that matches zero tasks - verify empty message
```

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan
Revert the commit: `git revert HEAD`

---

## Watch Out For
- Button placement must be in the LEFT control-group, not right
- Filter state must persist across view mode changes
- Overdue logic: endDate < today, NOT endDate <= today
- DOM manipulation timing: use requestAnimationFrame after render
- Empty state should only show when filters active AND no matches
