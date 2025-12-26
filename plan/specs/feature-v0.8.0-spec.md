# Feature v0.8.0 Specification

## Branch
`feature/v0.8.0-headers-and-date-formats`

## Linked Issues
- Fixes #12 (Year in upper headers across views)
- Fixes #14 (Upper elements decade format in Year view)
- Fixes #35 (Custom date format configuration)
- Fixes #41 (Thinner header to save pixel space)
- Fixes #50 (Vertical separators between header sections)

## Overview
Headers & Date Formats milestone: Improve timeline header display with consistent year context, decade grouping in Year view, thinner header layout, visual column separators, and user-configurable date formats for task popups.

---

## Part 1: Header Height Reduction (#41)

### 1.1 Current State
- Control bar: `--header-height: 56px`
- Grid header: `.grid-header { height: 50px }`
- Reference screenshot: `cli-docs/investigation/header.png`

### 1.2 Goal
Reduce header height by ~30% while maintaining readability.

### 1.3 Implementation

**File:** `resource/webapp/style.css`

**Changes:**
```css
:root {
    --header-height: 44px;  /* Reduced from 56px */
}

.gantt .grid-header {
    height: 38px;  /* Reduced from 50px */
}
```

Adjust related spacing:
```css
.control-bar {
    padding: 0 var(--spacing-sm);  /* Reduce horizontal padding */
}

/* Tighten header text */
.gantt-container .upper-text,
.gantt-container .lower-text {
    font-size: 11px;  /* Slightly smaller */
}
```

### 1.4 Testing
- [ ] Control bar height visibly reduced
- [ ] Grid header row is thinner
- [ ] All header text remains readable
- [ ] No overflow/clipping issues

---

## Part 2: Vertical Header Separators (#50)

### 2.1 Concept
Add vertical lines between header column boundaries for clearer visual demarcation.

### 2.2 Implementation Options

**Option A: CSS borders (Simpler)**
Apply to each column via existing DOM structure. May be limited by frappe-gantt's SVG structure.

**Option B: Post-render SVG injection (More Control)**
After Gantt renders, add SVG `<line>` elements at column boundaries.

### 2.3 Recommended: Option B

**File:** `webapps/gantt-chart/app.js`

Add function:
```javascript
function addHeaderSeparators() {
    const header = document.querySelector('.gantt-container .grid-header');
    const svg = document.querySelector('.gantt svg');
    if (!header || !svg) return;

    const columnWidth = ganttInstance.options?.column_width ?? 45;
    const columnCount = ganttInstance.dates?.length ?? 0;
    const headerHeight = header.getBoundingClientRect().height;

    // Create separator group
    let sepGroup = svg.querySelector('.header-separators');
    if (!sepGroup) {
        sepGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        sepGroup.classList.add('header-separators');
        svg.insertBefore(sepGroup, svg.firstChild);
    } else {
        sepGroup.innerHTML = ''; // Clear existing
    }

    // Add vertical lines at column boundaries
    for (let i = 1; i < columnCount; i++) {
        const x = i * columnWidth;
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', x);
        line.setAttribute('y2', headerHeight);
        line.setAttribute('stroke', '#dfe6e9');
        line.setAttribute('stroke-width', '1');
        sepGroup.appendChild(line);
    }
}
```

**Call locations:**
- After `renderGantt()` completes
- In `on_view_change` callback
- After zoom operations

**File:** `resource/webapp/style.css`

```css
/* Header separators */
.header-separators line {
    stroke: var(--color-border);
    stroke-width: 1;
}
```

### 2.4 Testing
- [ ] Vertical lines appear between header columns
- [ ] Lines align with grid below
- [ ] Lines update on view mode change
- [ ] Lines update on zoom

---

## Part 3: Year in Upper Headers (#12)

### 3.1 Current State
Year display is inconsistent across view modes:
- **Day/Week**: Shows month + year in upper headers
- **Month**: Shows years in upper headers
- **Year**: Shows years in lower headers

### 3.2 Goal
Ensure year is always visible in upper header section across all views.

### 3.3 Implementation

**File:** `webapps/gantt-chart/app.js`

Modify `adjustHeaderLabels()` to add year context where missing:

```javascript
function adjustHeaderLabels() {
    // ... existing code ...

    // Ensure year is in upper headers for all views
    ensureYearInUpperHeaders();
}

function ensureYearInUpperHeaders() {
    const viewMode = ganttInstance.options?.view_mode ?? 'Week';
    const upperTexts = document.querySelectorAll('.upper-text');

    // Day and Week modes may not show year in all upper labels
    if (viewMode === 'Day' || viewMode === 'Week') {
        // Upper headers show month names - append year if missing
        upperTexts.forEach(text => {
            const content = text.textContent.trim();
            // If it's a month name without year, leave as-is
            // (frappe-gantt usually includes year)
            // Check and log for investigation
        });
    }
    // Month mode: upper-text = years (already correct)
    // Year mode: needs decade grouping (handled in Part 4)
}
```

**Investigation needed:** Check actual frappe-gantt output for each view mode to confirm what's displayed and what's missing.

### 3.4 Testing
- [ ] Day view: Year visible in upper headers
- [ ] Week view: Year visible in upper headers
- [ ] Month view: Year visible in upper headers
- [ ] Year view: Years visible (decade in upper, years in lower)

---

## Part 4: Decade Format in Year View (#14)

### 4.1 Current State
Year view shows individual years in headers. For long timelines, this creates cluttered headers.

### 4.2 Goal
Group years into decades in upper headers:
- Upper: "2020s", "2030s", etc.
- Lower: Individual years

### 4.3 Implementation

**File:** `webapps/gantt-chart/app.js`

Extend `formatYearLabels()`:

```javascript
function formatYearLabels(columnWidth) {
    const upperTexts = document.querySelectorAll('.upper-text');
    const lowerTexts = document.querySelectorAll('.lower-text');

    // Group upper texts by decade
    const decades = new Map(); // decade -> [textElements]

    upperTexts.forEach(text => {
        const yearMatch = text.textContent.trim().match(/(\d{4})/);
        if (!yearMatch) return;

        const year = parseInt(yearMatch[1]);
        const decade = Math.floor(year / 10) * 10;

        if (!decades.has(decade)) {
            decades.set(decade, []);
        }
        decades.get(decade).push(text);
    });

    // Set first element of each decade group to show "2020s"
    decades.forEach((texts, decade) => {
        texts.forEach((text, i) => {
            if (i === 0) {
                text.textContent = `${decade}s`;
            } else {
                // Hide subsequent decade labels (or leave empty)
                text.textContent = '';
            }
        });
    });

    // Lower texts show individual years (existing behavior)
    lowerTexts.forEach(text => {
        const original = text.textContent.trim();
        const yearMatch = original.match(/(\d{4})/);
        if (!yearMatch) return;

        const fullYear = yearMatch[1];
        if (columnWidth < 34) {
            text.textContent = fullYear.slice(-2);
        } else {
            text.textContent = fullYear;
        }
    });
}
```

### 4.4 Testing
- [ ] Year view upper headers show "2020s", "2030s" format
- [ ] Year view lower headers show individual years
- [ ] Decade labels don't repeat within same decade span
- [ ] Works correctly across decade boundaries (2029 → 2030)

---

## Part 5: Custom Date Format (#35)

### 5.1 Current State
Task popup dates use hardcoded ISO 8601 format (`YYYY-MM-DD`).

### 5.2 Goal
Allow users to configure date display format via dropdown.

### 5.3 Configuration

**File:** `webapps/gantt-chart/webapp.json`

Add in "Appearance" section (after `padding`):

```json
{
    "type": "SEPARATOR",
    "label": "Date Display"
},
{
    "name": "dateFormat",
    "type": "SELECT",
    "label": "Date Format",
    "description": "Format for dates shown in task popups",
    "defaultValue": "ISO",
    "selectChoices": [
        {"value": "ISO", "label": "ISO 8601 (2024-12-27)"},
        {"value": "US", "label": "US (12/27/2024)"},
        {"value": "EU", "label": "European (27/12/2024)"},
        {"value": "LONG", "label": "Long (December 27, 2024)"},
        {"value": "SHORT", "label": "Short (Dec 27)"}
    ]
}
```

### 5.4 Implementation

**File:** `webapps/gantt-chart/app.js`

Replace inline `formatDate` in `buildPopupHTML()`:

```javascript
/**
 * Format a date according to user's selected format.
 * @param {Date|string} date - Date to format
 * @param {string} format - Format code: ISO, US, EU, LONG, SHORT
 * @returns {string} Formatted date string
 */
function formatDate(date, format) {
    if (!date) return 'N/A';

    // Ensure Date object
    let d = date;
    if (!(date instanceof Date)) {
        d = new Date(date);
    }
    if (isNaN(d.getTime())) return 'N/A';

    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const pad = (n) => n.toString().padStart(2, '0');

    switch (format) {
        case 'US':
            return `${pad(month + 1)}/${pad(day)}/${year}`;
        case 'EU':
            return `${pad(day)}/${pad(month + 1)}/${year}`;
        case 'LONG':
            return `${monthNames[month]} ${day}, ${year}`;
        case 'SHORT':
            return `${monthNamesShort[month]} ${day}`;
        case 'ISO':
        default:
            return `${year}-${pad(month + 1)}-${pad(day)}`;
    }
}

function buildPopupHTML(task) {
    // ... existing code ...

    const dateFormat = webAppConfig.dateFormat || 'ISO';

    // In date section:
    html += `<div class="popup-dates">${formatDate(startDate, dateFormat)} to ${formatDate(endDate, dateFormat)}</div>`;

    // ... rest of function ...
}
```

### 5.5 Testing
- [ ] Date Format dropdown appears in configuration
- [ ] Default is ISO 8601
- [ ] Each format option produces correct output:
  - ISO: `2024-12-27`
  - US: `12/27/2024`
  - EU: `27/12/2024`
  - LONG: `December 27, 2024`
  - SHORT: `Dec 27`
- [ ] Format applies to all popup date displays
- [ ] Invalid dates show "N/A"

---

## Files to Modify

| File | Action | Issues |
|------|--------|--------|
| `webapps/gantt-chart/webapp.json` | Modify | #35 |
| `webapps/gantt-chart/app.js` | Modify | #12, #14, #35, #50 |
| `resource/webapp/style.css` | Modify | #41, #50 |
| `plugin.json` | Modify | Version bump 0.7.2 → 0.8.0 |

---

## Implementation Order

Recommended sequence to minimize conflicts:

1. **#41 Header height** — CSS-only, low risk
2. **#50 Vertical separators** — Independent JS function
3. **#35 Date format** — New parameter + JS helper
4. **#12 Year in headers** — Requires investigation of current output
5. **#14 Decade format** — Builds on Year view logic

---

## Testing Checklist

### Header (#41)
- [ ] Control bar noticeably shorter
- [ ] Grid header row thinner
- [ ] Text readable at all sizes
- [ ] No layout breakage

### Separators (#50)
- [ ] Vertical lines between columns in header
- [ ] Lines align with grid
- [ ] Lines persist through view mode changes
- [ ] Lines update on zoom

### Year Context (#12)
- [ ] Day view shows year
- [ ] Week view shows year
- [ ] Month view shows year
- [ ] Consistent across zoom levels

### Decade (#14)
- [ ] Year view upper: "2020s", "2030s"
- [ ] Year view lower: individual years
- [ ] Handles decade transitions correctly

### Date Format (#35)
- [ ] Dropdown in config
- [ ] All 5 formats work correctly
- [ ] Popup dates update when format changes
- [ ] Default is ISO

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. Implement all changes
2. Run unit tests: `PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v`
3. Commit with message:
   ```
   feat(v0.8.0): Headers and date format improvements (#12, #14, #35, #41, #50)

   Header improvements:
   - Reduce header height by ~30% (#41)
   - Add vertical separators between header columns (#50)
   - Consistent year display in upper headers (#12)
   - Decade grouping in Year view (2020s, 2030s) (#14)

   Date format:
   - Add configurable date format for popups (#35)
   - Options: ISO, US, European, Long, Short

   Changes:
   - webapp.json: Add dateFormat parameter
   - app.js: Add formatDate(), addHeaderSeparators(), decade logic
   - style.css: Reduce header heights, separator styling

   Fixes #12, #14, #35, #41, #50

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```
4. Verify: `git log --oneline -1`

**User QA Steps:**
```
1. Reload plugin in Dataiku (Actions → Reload)

2. Test header height (#41):
   - Open any Gantt chart
   - Visually confirm header is noticeably thinner
   - All text still readable

3. Test vertical separators (#50):
   - Look for thin vertical lines between header columns
   - Change view modes - lines should update
   - Zoom in/out - lines should stay aligned

4. Test year display (#12):
   - Switch to Day view - verify year visible in header
   - Switch to Week view - verify year visible
   - Switch to Month view - verify years in upper row

5. Test decade format (#14):
   - Switch to Year view with multi-year data
   - Upper row should show "2020s", "2030s" etc.
   - Lower row shows individual years

6. Test date format (#35):
   - In config, find "Date Format" dropdown
   - Click a task to open popup
   - Change format to US - dates show MM/DD/YYYY
   - Change format to EU - dates show DD/MM/YYYY
   - Change format to Long - dates show "Month DD, YYYY"
   - Change format to Short - dates show "Mon DD"
```

**Do not proceed to PR/merge until user confirms all features work.**

---

## Rollback Plan
```bash
git revert HEAD
```

---

## Watch Out For

1. **SVG coordinate system** — Separator lines use SVG coordinates, not CSS pixels. Column width from options should map directly.

2. **View mode DOM recreation** — Frappe rebuilds DOM on view change. All post-render modifications must run again in `on_view_change`.

3. **Header height CSS specificity** — May need `!important` to override inline styles set by library.

4. **Decade boundary edge cases** — Tasks spanning 2029-2030 should show both decades.

5. **Date parsing** — Frappe stores dates as strings. Ensure `formatDate()` handles both Date objects and ISO strings.

6. **Year view structure** — Verify which elements are upper vs lower in Year view. May differ from Month view structure.
