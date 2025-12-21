# Feature v0.4.0 Specification: View Enhancements

## Branch
`feature/v0.4.0-view-enhancements`

## Overview

Three view-related enhancements to improve the Gantt chart user experience:
1. **Freeze Header** - Keep timeline header visible during vertical scrolling
2. **Constrain Date Boundaries** - Allow users to set fixed start/end dates for the chart
3. **Fix Header Text Collisions** - Prevent date label overlapping when switching view modes

---

## Investigation Findings

### Current Architecture

**Container Structure:**
```html
<div id="gantt-container">           <!-- Outer wrapper, overflow: auto -->
  <div class="gantt-container">      <!-- Frappe's container, overflow: auto -->
    <div class="grid-header">        <!-- Header with position: sticky -->
      <div class="upper-header">     <!-- Month/Year labels -->
      <div class="lower-header">     <!-- Day/Week labels -->
    </div>
    <svg class="gantt">              <!-- Task bars, grid, arrows -->
  </div>
</div>
```

**Key Files:**
- `resource/frappe-gantt.es.js` - Bundled library (minified)
- `resource/frappe-gantt.css` - Library styles
- `resource/webapp/style.css` - Custom styles
- `webapps/gantt-chart/app.js` - Frontend logic

---

## Feature 1: Freeze Header

### Current State

The library CSS already includes `position: sticky; top: 0` on `.grid-header`. However, there's a nested scrolling container issue:

```css
/* From frappe-gantt.css */
.gantt-container {
  overflow: auto;  /* This is the scrolling container */
}
.gantt-container .grid-header {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 1000;
}
```

The issue is that our outer `#gantt-container` wrapper ALSO has `overflow: auto`, creating nested scroll contexts.

### Root Cause

When two nested elements both have `overflow: auto`, the inner sticky element (`.grid-header`) is sticky relative to the INNER `.gantt-container`, not the outer `#gantt-container` where the user actually scrolls.

### Solution

**Option A: Remove outer scroll container**

Modify `resource/webapp/style.css` to let Frappe's container be the only scroll handler:

```css
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: visible;  /* Changed from auto */
    position: relative;
}

/* Ensure Frappe's container fills space */
.gantt-container {
    height: 100%;
    max-height: 100%;
}
```

**Option B: CSS Transform approach (backup)**

If Option A doesn't work due to Dataiku's iframe constraints, use JavaScript to sync header position:

```javascript
// In app.js
function setupStickyHeader() {
    const container = document.getElementById('gantt-container');
    const header = document.querySelector('.grid-header');

    if (!container || !header) return;

    container.addEventListener('scroll', () => {
        // Keep header at top during vertical scroll
        header.style.transform = `translateY(${container.scrollTop}px)`;
    });
}
```

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `resource/webapp/style.css` | Edit | Adjust overflow properties |
| `webapps/gantt-chart/app.js` | Edit (if Option B) | Add scroll sync logic |

---

## Feature 2: Constrain Date Boundaries

### Current State

Date boundaries are calculated automatically in `setup_gantt_dates()`:

```javascript
// From frappe-gantt.es.js (line ~947)
setup_gantt_dates(t) {
    // Find min/max dates from tasks
    for (let s of this.tasks)
        (!e || s._start < e) && (e = s._start),
        (!i || s._end > i) && (i = s._end);

    // Add padding
    this.gantt_start = d.add(e, -padding, unit);
    this.gantt_end = d.add(i, padding, unit);
}
```

### Solution: Monkey-Patch with User Constraints

Add configuration parameters and override library behavior after it calculates initial dates.

### UI Configuration

Add to `webapp.json` in the "View Settings" section:

```json
{
    "type": "SEPARATOR",
    "label": "Date Boundaries"
},
{
    "name": "chartStartDate",
    "type": "STRING",
    "label": "Fixed Start Date",
    "description": "YYYY-MM-DD format. Leave empty for automatic.",
    "mandatory": false
},
{
    "name": "chartEndDate",
    "type": "STRING",
    "label": "Fixed End Date",
    "description": "YYYY-MM-DD format. Leave empty for automatic.",
    "mandatory": false
}
```

### Implementation

In `app.js`, after Gantt instance is created:

```javascript
function applyDateConstraints(ganttInstance, config) {
    // Store original method
    const originalSetupDates = Gantt.prototype.setup_gantt_dates;

    // Override with constraint logic
    Gantt.prototype.setup_gantt_dates = function(forceRecalc) {
        // Run original calculation first
        originalSetupDates.apply(this, arguments);

        // Apply user constraints
        if (config.chartStartDate) {
            const userStart = new Date(config.chartStartDate);
            if (!isNaN(userStart.getTime())) {
                this.gantt_start = userStart;
            }
        }

        if (config.chartEndDate) {
            const userEnd = new Date(config.chartEndDate);
            if (!isNaN(userEnd.getTime())) {
                this.gantt_end = userEnd;
            }
        }

        // Safety check: ensure start < end
        if (this.gantt_start >= this.gantt_end) {
            console.warn('Chart boundary error: Start >= End. Auto-adjusting.');
            this.gantt_end = new Date(this.gantt_start);
            this.gantt_end.setMonth(this.gantt_end.getMonth() + 1);
        }
    };
}
```

### Validation

- Invalid date format: Log warning, use automatic calculation
- Start >= End: Log warning, extend end by 1 month from start
- Tasks outside boundaries: Tasks still render but may be clipped (user sees warning in metadata banner)

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/webapp.json` | Edit | Add chartStartDate/chartEndDate parameters |
| `webapps/gantt-chart/app.js` | Edit | Add monkey-patch for date constraints |

---

## Feature 3: Fix Header Text Collisions

### Current State

From `frappe-gantt.css`:

```css
.gantt-container .lower-text {
    width: calc(var(--gv-column-width) * .8);  /* Fixed width */
    /* No overflow handling */
}

.gantt-container .upper-text {
    width: fit-content;  /* Can grow indefinitely - CAUSES COLLISIONS */
}
```

The `upper-text` elements (month/year labels) use `width: fit-content`, allowing long text like "December 2024" to overlap adjacent columns.

### Root Cause Analysis

1. **No overflow handling**: Text can extend beyond column boundaries
2. **View mode switching**: Different view modes have different column widths but same text formatting
3. **Dynamic recalculation**: Labels are recreated on view change but sizing issues persist

### Solution Strategy

**Multi-pronged approach:**

1. **CSS Overflow Handling** - Add text truncation
2. **Strategic Label Skipping** - Show every Nth label when dense
3. **Abbreviations** - Use short formats based on available space

### CSS Fix

Add to `resource/webapp/style.css`:

```css
/* Prevent header text collision */
.gantt-container .upper-text {
    width: fit-content;
    max-width: calc(var(--gv-column-width) * 3);  /* Limit to 3 columns */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.gantt-container .lower-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* When columns are very narrow (Hour/Half-Day views) */
@container (max-width: 30px) {
    .gantt-container .lower-text {
        font-size: 10px;
    }
}
```

### JavaScript Enhancement (Optional)

For more intelligent label management, modify `app.js`:

```javascript
function adjustHeaderLabels() {
    const columnWidth = parseInt(
        getComputedStyle(document.documentElement)
            .getPropertyValue('--gv-column-width')
    ) || 45;

    // If column width is very narrow, hide some labels
    if (columnWidth < 25) {
        const lowerTexts = document.querySelectorAll('.lower-text');
        lowerTexts.forEach((text, i) => {
            // Show every other label in narrow view
            text.style.visibility = (i % 2 === 0) ? 'visible' : 'hidden';
        });
    }
}

// Call after view mode change
ganttOptions.on_view_change = function(mode) {
    requestAnimationFrame(() => {
        adjustHeaderLabels();
        enforceMinimumBarWidths();
        updateSvgDimensions();
    });
};
```

### Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `resource/webapp/style.css` | Edit | Add overflow handling for header text |
| `webapps/gantt-chart/app.js` | Edit | Add adjustHeaderLabels() function |

---

## Implementation Plan

### Step 1: Fix Header Text Collisions (Lowest Risk)
**File:** `resource/webapp/style.css`

Add CSS overflow handling rules. This is pure CSS and won't break any functionality.

### Step 2: Implement Sticky Header (Medium Risk)
**Files:** `resource/webapp/style.css`, possibly `app.js`

Try Option A (CSS-only) first. If that fails, implement Option B (JS scroll sync).

### Step 3: Add Date Boundary Controls (Medium Risk)
**Files:** `webapp.json`, `app.js`

Add UI parameters and monkey-patch implementation.

### Step 4: Version Bump
**File:** `plugin.json`

Change version from `0.3.0` to `0.4.0`.

---

## Files to Modify Summary

| File | Feature(s) | Description |
|------|------------|-------------|
| `webapps/gantt-chart/webapp.json` | Date Boundaries | Add chartStartDate/chartEndDate parameters |
| `webapps/gantt-chart/app.js` | All 3 | Scroll sync, date constraints, label adjustment |
| `resource/webapp/style.css` | Header, Collisions | Overflow handling, sticky fixes |
| `plugin.json` | Version | Bump to 0.4.0 |

---

## Testing Checklist

### Freeze Header
- [ ] Scroll down vertically - header stays visible at top
- [ ] Scroll right horizontally - header scrolls with content (correct behavior)
- [ ] Switch view modes - header remains sticky
- [ ] Large dataset (100+ tasks) - no performance issues

### Date Boundaries
- [ ] Leave both fields empty - automatic calculation (existing behavior)
- [ ] Set only start date - chart starts from that date
- [ ] Set only end date - chart ends at that date
- [ ] Set both dates - chart constrained to exact range
- [ ] Invalid date format - warning logged, falls back to auto
- [ ] Start >= End - warning logged, auto-corrected
- [ ] Tasks outside range - visible warning in metadata banner

### Header Collisions
- [ ] Hour view - labels don't overlap
- [ ] Quarter Day view - labels don't overlap
- [ ] Half Day view - labels don't overlap
- [ ] Day view - labels don't overlap
- [ ] Week view (default) - labels display correctly
- [ ] Month view - labels display correctly
- [ ] Year view - labels display correctly
- [ ] Switch between view modes rapidly - no visual glitches

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files.

**Pre-QA Commit Process:**
1. After implementing all features, commit with message:
   ```
   feat(v0.4.0): Add view enhancements

   - Freeze header: Keep timeline header visible during vertical scroll
   - Date boundaries: Add Fixed Start/End Date configuration
   - Fix header collisions: Prevent label overlapping on view mode change

   Changes:
   - webapp.json: Add chartStartDate/chartEndDate parameters
   - app.js: Add scroll sync, date constraints, label adjustment
   - style.css: Add overflow handling, sticky fixes
   - plugin.json: Version bump to 0.4.0
   ```

2. Verify commit: `git log --oneline -1`

3. Notify user that code is committed and ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open the Gantt Chart webapp
3. [STICKY HEADER TEST]
   - Load a dataset with 20+ tasks
   - Scroll DOWN - verify header stays at top
   - Scroll RIGHT - verify header scrolls with content

4. [DATE BOUNDARIES TEST]
   - In sidebar, find "Date Boundaries" section
   - Set "Fixed Start Date" to 2024-01-01
   - Set "Fixed End Date" to 2024-06-30
   - Verify chart is constrained to that range
   - Clear fields and verify automatic range returns

5. [HEADER COLLISION TEST]
   - Switch to "Hour" view mode
   - Verify date labels don't overlap
   - Switch through all view modes
   - Verify no label collisions in any mode
```

**Do not proceed to PR/merge until user confirms all features work.**

---

## Rollback Plan

If issues occur:

```bash
# Revert specific files
git checkout main -- webapps/gantt-chart/webapp.json
git checkout main -- webapps/gantt-chart/app.js
git checkout main -- resource/webapp/style.css
git checkout main -- plugin.json
```

---

## Watch Out For

1. **Nested Scroll Containers**: Dataiku's iframe may add its own scroll context. Test in actual DSS environment.

2. **Monkey-Patch Timing**: The `setup_gantt_dates` override must happen BEFORE Gantt instantiation or the library may cache the original method.

3. **View Mode Re-render**: Frappe Gantt destroys and recreates elements on view change. Any DOM-based fixes must be reapplied.

4. **Column Width CSS Variable**: The `--gv-column-width` variable is set dynamically. CSS calculations using it should work, but verify in all view modes.

5. **Performance with Large Datasets**: Label adjustment logic runs on every view change. Use `requestAnimationFrame` to avoid blocking.

6. **Date Parsing Edge Cases**: Users might enter dates in various formats (MM/DD/YYYY vs YYYY-MM-DD). Document expected format clearly.

---

## Future Enhancements (Not in Scope)

1. **Frozen Task Names Column**: Pin task names on left side during horizontal scroll
2. **Date Picker Widget**: Replace text input with calendar picker for date boundaries
3. **Dynamic Abbreviations**: Automatically choose "Dec" vs "December" based on space
4. **Zoom Controls**: Button-based zoom in/out instead of dropdown view mode
