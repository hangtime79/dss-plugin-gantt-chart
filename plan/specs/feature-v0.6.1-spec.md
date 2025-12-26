# Feature v0.6.1 Specification

## Branch
`feature/v0.6.1-stability-and-labels`

## Linked Issues
- Fixes #18 (Dataset row limit for scalability)
- Fixes #40 (Task labels invisible when positioned outside bars)
- Closes #19 (Not needed - Dataiku handles filter pushdown)

## Overview
Add dataset row limit to prevent OOM crashes and fix task label visibility when labels are positioned outside bars.

---

## Feature 1: Dataset Row Limit (#18)

### Problem
`backend.py` calls `dataset.get_dataframe()` without a limit, loading entire datasets into memory. Large datasets (>100k rows) can cause OOM crashes.

### Solution
Use `maxTasks` configuration parameter (already exists) to limit data loading at source:

```python
max_tasks = int(config.get('maxTasks', 1000))
df = dataset.get_dataframe(limit=max_tasks)
```

### File
`webapps/gantt-chart/backend.py` (line ~59)

---

## Bug 2: Label Visibility (#40)

### Problem
When task names don't fit inside bars, Frappe Gantt positions them outside (to the right) with class `.big`. Our CSS forces all labels to white, making external labels invisible on white background.

### Root Cause
```css
.gantt .bar-label {
    fill: #ffffff !important;  /* Forces ALL labels to white */
}
```

### Solution
Add override for external labels:
```css
/* External labels (positioned outside bars) need dark text on white background */
.gantt .bar-label.big {
    fill: #333333 !important;
}
```

### File
`resource/webapp/style.css`

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/backend.py` | Modify | Add `limit=max_tasks` to `get_dataframe()` |
| `resource/webapp/style.css` | Modify | Add `.bar-label.big` dark text rule |
| `plugin.json` | Modify | Bump version to 0.6.1 |

---

## Testing Checklist

### Row Limit (#18)
- [ ] Set `maxTasks` to 10 in config
- [ ] Load dataset with 100+ rows
- [ ] Verify only 10 tasks displayed (metadata banner shows "10 of X")
- [ ] No OOM errors on large datasets

### Label Visibility (#40)
- [ ] Create tasks with long names that don't fit in bars
- [ ] Verify labels appear to the right of bars (dark text)
- [ ] Labels inside bars still use appropriate contrast colors
- [ ] Check with Color By enabled and disabled

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. Implement changes
2. Commit with message:
   ```
   feat(v0.6.1): add dataset row limit and fix label visibility (#18, #40)

   Changes:
   - backend.py: Add limit=max_tasks to get_dataframe()
   - style.css: Add .bar-label.big dark text for external labels
   - plugin.json: Bump to 0.6.1

   Fixes #18, Fixes #40

   [claude signature]
   ```
3. Verify: `git log --oneline -1`

**User QA Steps:**
```
1. Reload plugin in Dataiku
2. Test row limit:
   - Set maxTasks to 10
   - Load dataset with 50+ rows
   - Verify metadata banner shows "Showing 10 of X tasks"
3. Test label visibility:
   - Create/use tasks with long names
   - Zoom out so bars are narrow
   - Verify labels appear to right of bars in dark text
4. Test with Color By enabled
```

---

## Rollback Plan
```bash
git revert HEAD
```

---

## Watch Out For
1. **maxTasks vs limit semantics** — `maxTasks` limits displayed tasks, now also limits data loading
2. **Label truncation** — Very long labels may still overflow; this is expected browser behavior
3. **Color contrast** — External labels always dark; internal labels use per-color rules
