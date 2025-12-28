# Feature v0.9.5 Specification

## Branch
`feature/v0.9.5-tooltip-polish-ii`

## Linked Issues
- Fixes #65 - Show Task Names instead of IDs in Dependency Tooltips
- Fixes #68 - Pin Tooltip to Screen

## Overview
Enhance tooltip usability by showing human-readable task names in dependencies and allowing users to pin tooltips to keep them visible.

---

## Feature #1: Human-Readable Dependency Names (#65)

### Current Behavior
Tooltip shows `Depends on: task_123, task_456` - raw task IDs that are often cryptic.

The `_display_dependencies` field currently stores the original raw dependency string from the data source.

### Desired Behavior
Tooltip shows `Depends on: Design Phase, Requirements Gathering` - human-readable task names.

### Root Cause
`TaskTransformer._process_row()` stores dependencies row-by-row without access to the full task list. The `id_to_name` mapping can only be built after all tasks are processed.

### Implementation

**File:** `python-lib/ganttchart/task_transformer.py`

Add post-processing step in `transform()` method after the row processing loop (line ~139):

```python
# After row processing, before dependency validation
# Build id_to_name lookup for dependency resolution (#65)
id_to_name = {t['id']: t['name'] for t in tasks}

# Post-process: resolve dependency IDs to names
for task in tasks:
    if task.get('dependencies'):
        resolved_names = []
        for dep_id in task['dependencies']:
            # Lookup name, fallback to ID if not found
            name = id_to_name.get(dep_id, dep_id)
            resolved_names.append(name)
        # Update display field with resolved names
        task['_display_dependencies'] = ', '.join(resolved_names)
```

**Logic:**
1. After all tasks are created, build `id_to_name` lookup dictionary
2. Iterate through tasks with dependencies
3. Resolve each dependency ID to its task name
4. Fallback to ID if lookup fails (data error, external reference)
5. Update `_display_dependencies` with comma-separated names

**Edge Cases:**
- Missing ID in lookup (external dependency) → show ID
- No dependencies → `_display_dependencies` remains empty string
- Already display-friendly IDs → still works (name lookup succeeds)

---

## Feature #2: Pin Tooltip to Screen (#68)

### Current Behavior
Tooltip closes when:
- User clicks elsewhere on the chart
- Mouse leaves the task bar (if hover mode)
- Another task is clicked

### Desired Behavior
- Add a "Pin" button to the tooltip
- Pinned tooltip stays visible until unpinned or closed
- Clicking another task closes pinned tooltip and opens new one
- Unpin/close button restores normal behavior

### Root Cause
Library's `hide_popup()` unconditionally hides the popup. No state tracking for "pinned" status.

### Implementation

**File:** `webapps/gantt-chart/app.js`

#### Step 1: Modify buildPopupHTML to add Pin button

```javascript
function buildPopupHTML(task) {
    // ... existing code ...

    let html = `
        <div class="gantt-popup">
            <div class="popup-header">
                <div class="popup-title">${escapeHtml(task.name)}</div>
                <div class="popup-actions">
                    <button class="popup-pin-btn" title="Pin tooltip">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                    <button class="popup-close-btn" title="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
    `;
    // ... rest of popup content ...
}
```

#### Step 2: Add popup button event handlers

After popup is shown, attach event handlers:

```javascript
// After show_popup patch, add button handlers
requestAnimationFrame(() => {
    const popup = ganttInstance.$popup_wrapper;
    if (!popup) return;

    const pinBtn = popup.querySelector('.popup-pin-btn');
    const closeBtn = popup.querySelector('.popup-close-btn');

    if (pinBtn) {
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.dataset.pinned = popup.dataset.pinned === 'true' ? 'false' : 'true';
            pinBtn.classList.toggle('active', popup.dataset.pinned === 'true');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.dataset.pinned = 'false';
            ganttInstance.hide_popup();
        });
    }
});
```

#### Step 3: Monkey-patch hide_popup to respect pinned state

```javascript
// Patch hide_popup to check pinned state (#68)
const originalHidePopup = ganttInstance.hide_popup.bind(ganttInstance);
ganttInstance.hide_popup = function() {
    const popup = ganttInstance.$popup_wrapper;
    if (popup && popup.dataset.pinned === 'true') {
        return; // Don't hide pinned popup
    }
    originalHidePopup();
};
```

#### Step 4: Reset pinned state when new popup opens

In the existing show_popup patch:
```javascript
ganttInstance.show_popup = function(opts) {
    // Reset any existing pinned state
    const popup = ganttInstance.$popup_wrapper;
    if (popup) {
        popup.dataset.pinned = 'false';
    }
    originalShowPopup(opts);
    // ... rest of positioning logic ...
};
```

**File:** `resource/webapp/style.css`

```css
/* Popup header with actions (#68) */
.gantt-popup .popup-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
}

.gantt-popup .popup-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
}

.gantt-popup .popup-pin-btn,
.gantt-popup .popup-close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px;
    opacity: 0.6;
    transition: opacity 0.15s;
}

.gantt-popup .popup-pin-btn:hover,
.gantt-popup .popup-close-btn:hover {
    opacity: 1;
}

.gantt-popup .popup-pin-btn.active {
    opacity: 1;
    color: var(--color-primary, #0078d4);
}

/* Dark mode icons */
.dark-theme .gantt-popup .popup-pin-btn,
.dark-theme .gantt-popup .popup-close-btn {
    color: var(--color-text);
}
```

---

## Version Bump

**File:** `plugin.json`

Change version from `0.9.4` to `0.9.5`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `python-lib/ganttchart/task_transformer.py` | Modify | Add post-processing to resolve dependency IDs to names |
| `webapps/gantt-chart/app.js` | Modify | Add pin/close buttons, patch hide_popup |
| `resource/webapp/style.css` | Modify | Add popup header/actions styles |
| `plugin.json` | Modify | Version 0.9.4 → 0.9.5 |

---

## Testing Checklist

### #65 - Dependency Names
- [ ] Tooltip shows task names instead of IDs for dependencies
- [ ] Single dependency: `Depends on: Task Name`
- [ ] Multiple dependencies: `Depends on: Name1, Name2, Name3`
- [ ] Missing dependency (data error): Falls back to showing ID
- [ ] No dependencies: No "Depends on" line shown
- [ ] Works with all ID formats (numeric, string, generated)

### #68 - Pin Tooltip
- [ ] Pin button visible in tooltip header
- [ ] Close button visible in tooltip header
- [ ] Click Pin: Tooltip stays visible when clicking chart background
- [ ] Click Pin again: Tooltip unpins (returns to normal behavior)
- [ ] Click Close: Tooltip closes immediately
- [ ] Click another task: Pinned tooltip closes, new one opens
- [ ] Dark mode: Icons visible and styled correctly
- [ ] Light mode: Icons visible and styled correctly

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing fixes, commit with:
   ```
   feat(v0.9.5): Tooltip content and interaction polish (#65, #68)

   - Show task names instead of IDs in dependency tooltips
   - Add pin/close buttons to keep tooltips visible
   - Fallback to ID if dependency name lookup fails

   Changes:
   - python-lib/ganttchart/task_transformer.py: Dependency name resolution
   - webapps/gantt-chart/app.js: Pin/close buttons, hide_popup patch
   - resource/webapp/style.css: Popup header/actions styles
   - plugin.json: Version 0.9.4 → 0.9.5

   Fixes #65, Fixes #68

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```
2. Verify: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open a Gantt chart with tasks that have dependencies

DEPENDENCY NAMES TEST (#65):
3. Click on a task that has dependencies
4. VERIFY: "Depends on" shows task NAMES (not IDs)
5. Check a task with multiple dependencies
6. VERIFY: All dependency names shown, comma-separated

PIN TOOLTIP TEST (#68):
7. Click on any task bar
8. VERIFY: Tooltip shows Pin icon (pushpin) and Close icon (X)
9. Click the Pin icon
10. VERIFY: Pin icon becomes highlighted/active
11. Click somewhere else on the chart (not on a task)
12. VERIFY: Tooltip STAYS VISIBLE (pinned)
13. Click on a DIFFERENT task
14. VERIFY: Old tooltip closes, new tooltip opens
15. Click the Close (X) button
16. VERIFY: Tooltip closes immediately

Report: PASS or describe any issues observed.
```

**Do not proceed to PR/merge until user confirms both features work.**

---

## Rollback Plan

**If #65 breaks:**
Remove the post-processing loop in `task_transformer.py`. `_display_dependencies` will return to showing raw IDs.

**If #68 breaks:**
- Remove pin/close buttons from `buildPopupHTML()`
- Remove `hide_popup` monkey-patch
- Remove popup header CSS

Both features are independent; can roll back one without affecting the other.

---

## Watch Out For

1. **Dependency self-reference:** If a task ID references itself, the lookup will still work (just returns its own name). Not a bug, but edge case to be aware of.

2. **Performance:** Post-processing is O(N×M) where N=tasks, M=average dependencies. For 1000 tasks with ~3 deps each, this is negligible.

3. **Event listener cleanup:** Pin/close button handlers attach on each popup show. Use event delegation or ensure handlers don't stack.

4. **CSS-safe IDs vs display IDs:** The `_display_dependencies` already stores display-friendly values. The post-processing should use the CSS-safe `id` for lookup (since that's what `dependencies` array contains).

5. **Button icons:** Use FontAwesome classes (`fas fa-thumbtack`, `fas fa-times`) since Dataiku includes FontAwesome 5.15.4.

---

## Spec Complete

**Ready for SDE implementation.**

The SDE should:
1. Implement dependency name resolution (#65) first - Python side
2. Implement pin/close tooltip (#68) second - JS/CSS side
3. Bump version
4. Commit and request User QA
5. Do NOT proceed past QA gate without user approval
