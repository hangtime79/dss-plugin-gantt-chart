# Feature v0.9.0 Specification

## Branch
`feature/v0.9.0-theming-and-visual-polish`

## Linked Issues
- Fixes #31 (Dark Mode Support)
- Fixes #34 (Grid Lines Configuration)
- Fixes #47 (Pill Box Labels)
- Fixes #49 (Color Palette Selection)
- Fixes #54 (Zoom carryover bug)
- Fixes #57 (Visual stacking order)

## Overview
Theming & Visual Polish milestone: Add dark mode support, color palette selection, configurable grid lines, pill box labels for better contrast, fix visual stacking order, and address intermittent zoom bug.

---

## Part 1: Visual Stacking Order (#57)

### 1.1 Problem
Today line and markers can be obscured by task bars when they overlap.

### 1.2 Desired Order (top to bottom)
1. **Markers** (Expected Progress indicators, tooltips)
2. **Today Line**
3. **Task Bars**

### 1.3 Implementation

**File:** `resource/webapp/style.css`

The stacking order is controlled by SVG rendering order (later = on top) and z-index for positioned elements.

```css
/* Today line should be above bars */
.gantt .today-highlight {
    z-index: 10;
}

/* Progress markers above today line */
.gantt .expected-progress-marker,
.gantt .progress-marker {
    z-index: 20;
}
```

**File:** `webapps/gantt-chart/app.js`

If CSS z-index isn't sufficient for SVG elements, reorder DOM elements after render:

```javascript
function ensureStackingOrder() {
    const svg = document.querySelector('.gantt svg');
    if (!svg) return;

    // Move today-highlight to end of bars group (renders on top)
    const todayLine = svg.querySelector('.today-highlight');
    const barsLayer = svg.querySelector('.bar-wrapper')?.parentElement;
    if (todayLine && barsLayer) {
        barsLayer.appendChild(todayLine);
    }

    // Markers should be in their own layer at the end
    const markers = svg.querySelectorAll('.expected-progress-marker');
    markers.forEach(m => svg.appendChild(m));
}
```

### 1.4 Testing
- [ ] Today line visible on top of task bars when overlapping
- [ ] Expected progress markers visible on top of Today line
- [ ] Works across all view modes

---

## Part 2: Zoom Carryover Bug (#54)

### 2.1 Problem
Intermittent race condition where zoom from previous view carries to new view.

### 2.2 Root Cause Analysis
The `ensureEdgeToEdgeContent()` function compares rendered SVG width to desired width. Race condition may occur when:
- View change triggers before previous render completes
- Column width comparison happens with stale values

### 2.3 Investigation Needed

**File:** `webapps/gantt-chart/app.js` (line ~1069)

Add defensive checks:

```javascript
function ensureEdgeToEdgeContent() {
    // Add debounce to prevent rapid-fire calls
    if (ensureEdgeToEdgeContent.pending) return;
    ensureEdgeToEdgeContent.pending = true;

    requestAnimationFrame(() => {
        ensureEdgeToEdgeContent.pending = false;
        // ... existing logic

        // Verify current view mode matches expected
        const currentMode = ganttInstance?.options?.view_mode;
        if (currentMode !== expectedViewMode) {
            console.log('View mode changed during zoom calculation, aborting');
            return;
        }
    });
}
```

### 2.4 Testing
- [ ] Switch between views rapidly - zoom should not carry over
- [ ] Each view maintains its independent zoom level
- [ ] No console errors during view switching

---

## Part 3: Pill Box Labels (#47)

### 3.1 Problem
Label text can be hard to read against bar colors.

### 3.2 Implementation

**File:** `resource/webapp/style.css`

Add pill background to labels:

```css
/* Pill box background for labels */
.gantt .bar-label {
    background: rgba(255, 255, 255, 0.9);
    padding: 1px 6px;
    border-radius: 3px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* Ensure internal labels have contrast */
.bar-wrapper .bar-label:not(.big) {
    background: rgba(255, 255, 255, 0.85);
    color: var(--text-main);
}

/* External labels (.big) already have dark text */
.gantt .bar-label.big {
    background: rgba(255, 255, 255, 0.9);
    color: var(--text-main);
}
```

### 3.3 Testing
- [ ] Labels have visible pill background
- [ ] Works with all color options
- [ ] Internal and external labels both readable
- [ ] No layout issues with varying label lengths

---

## Part 4: Grid Lines Configuration (#34)

### 4.1 Configuration Parameters

**File:** `webapps/gantt-chart/webapp.json`

Add in "Appearance" section:

```json
{
    "type": "SEPARATOR",
    "label": "Grid Lines"
},
{
    "name": "showVerticalGridLines",
    "type": "BOOLEAN",
    "label": "Show vertical grid lines",
    "defaultValue": true
},
{
    "name": "showHorizontalGridLines",
    "type": "BOOLEAN",
    "label": "Show horizontal grid lines",
    "defaultValue": true
},
{
    "name": "gridLineOpacity",
    "type": "INT",
    "label": "Grid line opacity (%)",
    "defaultValue": 100,
    "minI": 0,
    "maxI": 100
}
```

### 4.2 Implementation

**File:** `webapps/gantt-chart/app.js`

Apply grid settings after render:

```javascript
function applyGridSettings() {
    const showVertical = webAppConfig?.showVerticalGridLines ?? true;
    const showHorizontal = webAppConfig?.showHorizontalGridLines ?? true;
    const opacity = (webAppConfig?.gridLineOpacity ?? 100) / 100;

    // Vertical lines (column ticks)
    document.querySelectorAll('.gantt .tick').forEach(el => {
        el.style.display = showVertical ? '' : 'none';
        el.style.opacity = opacity;
    });

    // Horizontal lines (row separators)
    document.querySelectorAll('.gantt .row-line').forEach(el => {
        el.style.display = showHorizontal ? '' : 'none';
        el.style.opacity = opacity;
    });
}
```

### 4.3 Testing
- [ ] Toggle vertical grid lines works
- [ ] Toggle horizontal grid lines works
- [ ] Opacity slider affects line transparency
- [ ] Changes preview in real-time
- [ ] Settings persist across view changes

---

## Part 5: Color Palette Selection (#49)

### 5.1 Palettes to Define

| Palette | Description |
|---------|-------------|
| Classic | Current vibrant colors (default) |
| Pastel | Softer, less saturated |
| Dark | High contrast for dark backgrounds |
| Dataiku | Matches DSS qualitative colors |

### 5.2 Configuration

**File:** `webapps/gantt-chart/webapp.json`

Add in "Appearance" section:

```json
{
    "name": "colorPalette",
    "type": "SELECT",
    "label": "Color Palette",
    "defaultValue": "classic",
    "selectChoices": [
        {"value": "classic", "label": "Classic (Vibrant)"},
        {"value": "pastel", "label": "Pastel (Soft)"},
        {"value": "dark", "label": "Dark Mode"},
        {"value": "dataiku", "label": "Dataiku"}
    ]
}
```

### 5.3 Backend Implementation

**File:** `python-lib/ganttchart/color_mapper.py`

```python
PALETTES = {
    'classic': [
        'bar-blue', 'bar-green', 'bar-orange', 'bar-purple',
        'bar-red', 'bar-teal', 'bar-pink', 'bar-indigo',
        'bar-cyan', 'bar-amber', 'bar-lime', 'bar-gray'
    ],
    'pastel': [
        'bar-pastel-blue', 'bar-pastel-green', 'bar-pastel-orange', 'bar-pastel-purple',
        'bar-pastel-red', 'bar-pastel-teal', 'bar-pastel-pink', 'bar-pastel-indigo',
        'bar-pastel-cyan', 'bar-pastel-amber', 'bar-pastel-lime', 'bar-pastel-gray'
    ],
    'dark': [
        'bar-dark-blue', 'bar-dark-green', 'bar-dark-orange', 'bar-dark-purple',
        'bar-dark-red', 'bar-dark-teal', 'bar-dark-pink', 'bar-dark-indigo',
        'bar-dark-cyan', 'bar-dark-amber', 'bar-dark-lime', 'bar-dark-gray'
    ],
    'dataiku': [
        'bar-dku-1', 'bar-dku-2', 'bar-dku-3', 'bar-dku-4',
        'bar-dku-5', 'bar-dku-6', 'bar-dku-7', 'bar-dku-8',
        'bar-dku-9', 'bar-dku-10', 'bar-dku-11', 'bar-dku-12'
    ]
}

def get_palette(name: str = 'classic') -> list:
    """Get color palette by name, defaults to classic."""
    return PALETTES.get(name, PALETTES['classic'])
```

### 5.4 CSS Definitions

**File:** `resource/webapp/style.css`

Add pastel, dark, and Dataiku palette definitions:

```css
/* Pastel Palette */
.bar-pastel-blue .bar { fill: #a8d8ea; }
.bar-pastel-green .bar { fill: #a8e6cf; }
.bar-pastel-orange .bar { fill: #ffd3b6; }
/* ... etc for all 12 colors */

/* Dark Palette */
.bar-dark-blue .bar { fill: #1a5276; }
.bar-dark-green .bar { fill: #196f3d; }
/* ... etc */

/* Dataiku Palette (matches DSS qualitative) */
.bar-dku-1 .bar { fill: #2678B1; }
.bar-dku-2 .bar { fill: #FF7F0E; }
.bar-dku-3 .bar { fill: #2CA02C; }
.bar-dku-4 .bar { fill: #D62728; }
.bar-dku-5 .bar { fill: #9467BD; }
.bar-dku-6 .bar { fill: #8C564B; }
.bar-dku-7 .bar { fill: #E377C2; }
.bar-dku-8 .bar { fill: #7F7F7F; }
.bar-dku-9 .bar { fill: #BCBD22; }
.bar-dku-10 .bar { fill: #17BECF; }
.bar-dku-11 .bar { fill: #AEC7E8; }
.bar-dku-12 .bar { fill: #FFBB78; }
```

### 5.5 Testing
- [ ] Color Palette dropdown appears in config
- [ ] Changing palette updates chart colors
- [ ] All 4 palettes render correctly
- [ ] Palette persists across reloads

---

## Part 6: Dark Mode Support (#31)

### 6.1 Configuration

**File:** `webapps/gantt-chart/webapp.json`

Add at start of "Appearance" section:

```json
{
    "name": "theme",
    "type": "SELECT",
    "label": "Theme",
    "defaultValue": "auto",
    "selectChoices": [
        {"value": "auto", "label": "Auto (System)"},
        {"value": "light", "label": "Light"},
        {"value": "dark", "label": "Dark"}
    ]
}
```

### 6.2 CSS Dark Theme

**File:** `resource/webapp/style.css`

```css
/* Dark theme overrides */
.dark-theme {
    --color-primary: #ecf0f1;
    --color-secondary: #bdc3c7;
    --color-accent: #3498db;
    --color-accent-hover: #5dade2;
    --color-background: #1a1a2e;
    --color-surface: #16213e;
    --color-border: #2c3e50;

    --color-success: #27ae60;
    --color-warning: #f39c12;
    --color-error: #e74c3c;

    --text-main: #ecf0f1;
    --text-muted: #95a5a6;
    --text-inverted: #1a1a2e;

    --chart-grid-line: #2c3e50;
    --chart-today-line: #e74c3c;

    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
}

/* Dark mode specific overrides */
.dark-theme .gantt .grid-header {
    background-color: var(--color-surface);
}

.dark-theme .gantt .grid-row:nth-child(even) {
    background-color: rgba(255, 255, 255, 0.02);
}

.dark-theme .control-bar {
    background-color: var(--color-surface);
}

/* Pill labels in dark mode */
.dark-theme .gantt .bar-label {
    background: rgba(0, 0, 0, 0.7);
    color: var(--text-main);
}

/* Popup in dark mode */
.dark-theme .popup-wrapper {
    background-color: var(--color-surface);
    border-color: var(--color-border);
}
```

### 6.3 JavaScript Implementation

**File:** `webapps/gantt-chart/app.js`

```javascript
function initTheme() {
    const themeSetting = webAppConfig?.theme ?? 'auto';
    applyTheme(themeSetting);
}

function applyTheme(setting) {
    const body = document.body;
    body.classList.remove('dark-theme', 'light-theme');

    let useDark = false;

    if (setting === 'auto') {
        // Detect system preference
        useDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
        useDark = setting === 'dark';
    }

    if (useDark) {
        body.classList.add('dark-theme');
    }

    // Listen for system changes if auto
    if (setting === 'auto') {
        window.matchMedia('(prefers-color-scheme: dark)')
            .addEventListener('change', e => {
                body.classList.toggle('dark-theme', e.matches);
            });
    }
}
```

### 6.4 Testing
- [ ] Theme dropdown appears in config
- [ ] "Auto" detects system preference
- [ ] "Light" forces light theme
- [ ] "Dark" forces dark theme
- [ ] All UI elements styled correctly in dark mode
- [ ] Text maintains WCAG AA contrast
- [ ] Popups, tooltips, control bar all themed
- [ ] Skeleton loader adapts to dark mode

---

## Files to Modify

| File | Action | Issues |
|------|--------|--------|
| `webapps/gantt-chart/webapp.json` | Modify | #31, #34, #49 |
| `webapps/gantt-chart/app.js` | Modify | #31, #34, #54, #57 |
| `resource/webapp/style.css` | Modify | #31, #47, #49, #57 |
| `python-lib/ganttchart/color_mapper.py` | Modify | #49 |
| `plugin.json` | Modify | Version bump 0.8.0 → 0.9.0 |

---

## Implementation Order

Recommended sequence to minimize conflicts:

1. **#57 Stacking Order** — Quick CSS fix, independent
2. **#54 Zoom Bug** — Independent JS fix
3. **#47 Pill Box Labels** — CSS, lays groundwork for dark mode labels
4. **#34 Grid Lines Config** — New parameters + JS
5. **#49 Color Palettes** — Backend + CSS palettes
6. **#31 Dark Mode** — Builds on all above (affects everything)

---

## Testing Checklist

### Stacking Order (#57)
- [ ] Today line on top of bars
- [ ] Markers on top of Today line
- [ ] Works in all view modes

### Zoom Bug (#54)
- [ ] Rapid view switching doesn't carry zoom
- [ ] Per-view zoom preserved

### Pill Labels (#47)
- [ ] Pill background visible
- [ ] Good contrast on all colors

### Grid Lines (#34)
- [ ] Toggle vertical lines
- [ ] Toggle horizontal lines
- [ ] Opacity slider works

### Color Palettes (#49)
- [ ] Classic palette (default)
- [ ] Pastel palette
- [ ] Dark palette
- [ ] Dataiku palette

### Dark Mode (#31)
- [ ] Auto detection works
- [ ] Manual light/dark toggle
- [ ] All components themed
- [ ] WCAG contrast maintained

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. Implement all changes
2. Run unit tests: `PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v`
3. Commit with message:
   ```
   feat(v0.9.0): Theming and visual polish (#31, #34, #47, #49, #54, #57)

   Theming:
   - Add dark mode with auto/light/dark options (#31)
   - Add color palette selection: Classic, Pastel, Dark, Dataiku (#49)

   Visual improvements:
   - Pill box background for bar labels (#47)
   - Configurable grid lines with opacity (#34)
   - Fix stacking order: Markers > Today > Bars (#57)

   Bug fix:
   - Fix intermittent zoom carryover between views (#54)

   Fixes #31, #34, #47, #49, #54, #57

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```
4. Verify: `git log --oneline -1`

**User QA Steps:**
```
1. Reload plugin in Dataiku (Actions → Reload)

2. Test stacking order (#57):
   - Create tasks that overlap with Today
   - Verify Today line visible on top of bars
   - Verify progress markers on top of Today line

3. Test zoom bug (#54):
   - Switch rapidly between views (Week → Month → Year → Day)
   - Each view should use its own zoom level

4. Test pill labels (#47):
   - Verify labels have white pill background
   - Check contrast with different bar colors

5. Test grid lines (#34):
   - Toggle "Show vertical grid lines" - lines should hide/show
   - Toggle "Show horizontal grid lines" - lines should hide/show
   - Adjust opacity slider - lines should fade

6. Test color palettes (#49):
   - Change "Color Palette" to each option
   - Classic: Vibrant colors
   - Pastel: Soft colors
   - Dark: High contrast
   - Dataiku: DSS-style colors

7. Test dark mode (#31):
   - Set Theme to "Auto" - should match system
   - Set Theme to "Dark" - dark background, light text
   - Set Theme to "Light" - light background, dark text
   - Verify all UI components themed correctly
```

**Do not proceed to PR/merge until user confirms all features work.**

---

## Rollback Plan
```bash
git revert HEAD
```

---

## Watch Out For

1. **SVG z-index limitations** — SVG elements don't support z-index. Must use DOM order for stacking.

2. **Dark mode contrast** — Ensure all text meets WCAG AA (4.5:1 for normal text, 3:1 for large).

3. **Palette backwards compatibility** — Default to "classic" palette to maintain existing behavior.

4. **Grid line selectors** — Verify `.tick` and `.row-line` are correct for frappe-gantt's current DOM structure.

5. **Theme flash** — Apply theme class early in initialization to prevent light-to-dark flash.

6. **System preference listener cleanup** — Remove event listener if theme changes from "auto" to manual.

7. **Color palette in backend** — The palette selection must be passed from frontend config to backend via `get_config` endpoint.
