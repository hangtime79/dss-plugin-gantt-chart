# Bugfix v0.2.1 - Horizontal Scrolling Fix

## Branch
`bugfix/v0.2.1-fix-horizontal-scrolling`

## Problem
The Gantt chart does not scroll horizontally or vertically when the chart content exceeds the viewport dimensions. This prevents users from viewing tasks outside the initial visible area, especially in granular views like "Hour" or "Day".

---

## Root Cause (Updated After Investigation)

### Primary Issue: Wrong File Edited
The SDE applied CSS fixes to the wrong file. There are **duplicate style.css files** in the codebase:

| File | Size | Status |
|------|------|--------|
| `webapps/gantt-chart/style.css` | 4744 bytes | **Modified by SDE** - NOT loaded by browser |
| `resource/webapp/style.css` | 4337 bytes | **Old version** - ACTUALLY loaded by browser |

**Evidence from `body.html` (line 2):**
```html
<link rel="stylesheet" href="/plugins/gantt-chart/resource/webapp/style.css">
```

The browser loads `resource/webapp/style.css`, but the scroll fix was applied to `webapps/gantt-chart/style.css`.

### Secondary Issue: Duplicate File Structure
The plugin has a confusing architecture with overlapping directories:

```
webapps/gantt-chart/          # Webapp definition (app.js, backend.py, webapp.json)
├── style.css                 # DUPLICATE - not served to browser
├── body.html                 # References resource/webapp/style.css
└── ...

resource/webapp/              # Static resources served to browser
├── style.css                 # ACTUAL file loaded by browser
└── dku-helpers.js            # Helper utilities
```

### Original Root Cause (Still Valid)
The Frappe Gantt library creates an internal container (`.gantt-container`) that handles scrolling. Previous fixes from v0.1.0 were lost during refactoring, and the CSS/JS do not correctly enforce the container dimensions or overflow properties.

---

## Fix Required

### Step 1: Apply CSS Fix to Correct File

**File to modify:** `resource/webapp/style.css` (NOT `webapps/gantt-chart/style.css`)

**Changes:**

1. Change `#gantt-container` from `overflow: auto` to `overflow: hidden`
2. Add `.gantt-container` rules for scroll handling

```css
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: hidden;  /* Changed from 'auto' */
    position: relative;
}

/* Frappe Gantt internal container - ADD THIS BLOCK */
.gantt-container {
    height: 100%;
    width: 100%;
    overflow: auto;
}
```

### Step 2: JS Changes (Already Applied Correctly)

The `app.js` changes in commit `4d4e65c` are correct:
- Added `updateSvgDimensions()` function
- Called after render and on view change

No additional JS changes needed.

### Step 3: Consolidate Duplicate Files (REQUIRED)

Eliminate the `resource/webapp/` folder entirely to prevent future confusion. All webapp-specific files should live in `webapps/gantt-chart/`.

**Files to consolidate:**

| Current Location | Action | Target |
|------------------|--------|--------|
| `resource/webapp/style.css` | Delete after merging | N/A |
| `resource/webapp/dku-helpers.js` | Inline into app.js | `webapps/gantt-chart/app.js` |
| `webapps/gantt-chart/style.css` | Keep (apply scroll fix) | N/A |

**Keep in `resource/` (third-party libraries):**
- `resource/frappe-gantt.css` - Frappe Gantt library styles
- `resource/frappe-gantt.umd.js` - Frappe Gantt library code

#### Step 3a: Inline dku-helpers.js into app.js

The `dku-helpers.js` file (60 lines) provides the `dataiku.webappBackend` wrapper. Inline it at the top of `app.js` inside the IIFE:

**Add at the beginning of app.js (after `'use strict';`):**
```javascript
// ===== BACKEND HELPERS =====
// Provides robust backend communication wrappers (formerly dku-helpers.js)
if (typeof dataiku !== 'undefined' && !dataiku.webappBackend) {
    dataiku.webappBackend = {
        getUrl: function(path) {
            return dataiku.getWebAppBackendUrl(path);
        },
        get: function(path, params) {
            let url = this.getUrl(path);
            if (params && Object.keys(params).length > 0) {
                const queryString = Object.keys(params).map(key => {
                    return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
                }).join('&');
                url += (url.indexOf('?') === -1 ? '?' : '&') + queryString;
            }
            return fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }
            })
            .then(response => {
                if (response.status == 502) {
                    throw new Error("Webapp backend is not running or not reachable (502).");
                }
                if (!response.ok) {
                    return response.text().then(text => {
                        let errorMsg = response.statusText;
                        try {
                            const json = JSON.parse(text);
                            if (json.error) errorMsg = json.error;
                        } catch(e) {}
                        throw new Error(`Backend Error (${response.status}): ${errorMsg}`);
                    });
                }
                return response.json();
            });
        }
    };
}
```

#### Step 3b: Update body.html

**Current `body.html`:**
```html
<link rel="stylesheet" href="/plugins/gantt-chart/resource/frappe-gantt.css">
<link rel="stylesheet" href="/plugins/gantt-chart/resource/webapp/style.css">

<div id="gantt-container"></div>

<div id="loading" class="loading-overlay">
    <div class="spinner"></div>
    <p>Loading Gantt chart...</p>
</div>

<script src="/plugins/gantt-chart/resource/frappe-gantt.umd.js"></script>
<script src="/plugins/gantt-chart/resource/webapp/dku-helpers.js"></script>
```

**Updated `body.html`:**
```html
<link rel="stylesheet" href="/plugins/gantt-chart/resource/frappe-gantt.css">

<div id="gantt-container"></div>

<div id="loading" class="loading-overlay">
    <div class="spinner"></div>
    <p>Loading Gantt chart...</p>
</div>

<script src="/plugins/gantt-chart/resource/frappe-gantt.umd.js"></script>
```

**Changes:**
1. Remove `resource/webapp/style.css` link - Dataiku auto-loads `style.css` from webapp folder
2. Remove `resource/webapp/dku-helpers.js` script - now inlined in app.js

#### Step 3c: Delete resource/webapp/ folder

After completing steps 3a and 3b:
```bash
rm -rf resource/webapp/
```

#### Step 3d: Apply scroll fix to correct style.css

Now that we're using `webapps/gantt-chart/style.css`, the scroll fix is already in place from the SDE's earlier changes. Verify it contains:

```css
#gantt-container {
    overflow: hidden;
}

.gantt-container {
    height: 100%;
    width: 100%;
    overflow: auto;
}
```

---

## File Comparison

### Current `resource/webapp/style.css` (LOADED - needs fix):
```css
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: auto;           /* <-- Problem: should be 'hidden' */
    position: relative;
}

/* Missing .gantt-container scroll rules */
```

### Current `webapps/gantt-chart/style.css` (NOT LOADED - has fix):
```css
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: hidden;         /* <-- Correct */
    position: relative;
}

.gantt-container {            /* <-- Correct, but never applied */
    height: 100%;
    width: 100%;
    overflow: auto;
}
```

---

## Verification Checklist

### After consolidation:

- [ ] `resource/webapp/` folder is deleted
- [ ] `body.html` no longer references `resource/webapp/`
- [ ] `dku-helpers.js` code is inlined in `app.js`
- [ ] Reload plugin in Dataiku

### After scroll fix:

- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Verify CSS loads (check DevTools Network tab for style.css)
- [ ] Load a chart with many tasks (vertical scroll check)
- [ ] Switch to "Day" or "Hour" view (horizontal scroll check)
- [ ] Verify scrollbars appear and function correctly
- [ ] Verify both horizontal AND vertical scrolling work

---

## Lessons Learned

1. **Verify which files are actually loaded** - Use browser DevTools Network tab to confirm which CSS/JS files are loaded
2. **Eliminate duplicate files immediately** - Having the same filename in multiple locations causes confusion and bugs
3. **Understand Dataiku's resource serving** - Files in `webapps/{name}/` are automatically loaded by Dataiku; `resource/` is for third-party libraries only
4. **Keep webapp code consolidated** - All webapp-specific code (JS, CSS) should live in `webapps/{name}/`, not scattered across `resource/webapp/`

---

## Final Directory Structure

After this fix, the webapp file structure should be:

```
webapps/gantt-chart/
├── app.js              # Main JS (includes backend helpers)
├── backend.py          # Flask backend
├── body.html           # HTML template (references only resource/frappe-gantt.*)
├── style.css           # All custom styles (with scroll fix)
└── webapp.json         # Configuration

resource/
├── frappe-gantt.css    # Third-party library (keep)
├── frappe-gantt.umd.js # Third-party library (keep)
├── frappe-gantt.es.js  # Third-party library (keep)
└── license.txt         # License file (keep)

# DELETED: resource/webapp/ folder
```

---

## Updated: 2025-12-20
## Status: In Progress - Requires file consolidation and scroll fix
