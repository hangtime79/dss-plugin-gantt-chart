# Feature v0.4.2 Specification: Debounce & Sticky Header

## Branch
`feature/v0.4.2-debounce-and-sticky-header`

## Linked Issues
- Fixes #15 - Configuration input debouncing
- Fixes #11 - Sticky header via JS scroll sync

## Overview

Two UX improvements for the Gantt chart:
1. **Configuration Debouncing** - Prevent excessive re-renders when adjusting numeric settings
2. **Sticky Header** - Keep timeline header visible during vertical scrolling via JavaScript

---

## Feature 1: Configuration Input Debouncing

### Symptom
When users adjust numeric configuration inputs (e.g., "Bar Height" spinner), the chart re-renders for every single step (30 → 31 → 32 → 33), causing visual jank and scroll position jumps.

### Root Cause
The Dataiku webapp framework sends configuration updates immediately on every input change event. The `message` event listener in `app.js` (line 349-374) immediately calls `initializeChart()` on every update with no rate limiting.

Current flow:
```
User clicks spinner up → config message → initializeChart() → full re-render
User clicks spinner up → config message → initializeChart() → full re-render
User clicks spinner up → config message → initializeChart() → full re-render
```

### Solution
Implement a 500ms debounce timer on the message event listener. This ensures the chart only re-renders once the user stops interacting with input controls.

Target flow:
```
User clicks spinner up × 5 rapidly → debounce buffers → single initializeChart() after 500ms idle
```

---

## Fix Plan: Debouncing

### Step 1: Add Debounce Timer Variable
**File:** `webapps/gantt-chart/app.js`

At the top of the STATE section (~line 50), add:

```javascript
// ===== STATE =====
let webAppConfig = {};
let ganttInstance = null;
let configDebounceTimer = null;  // NEW: Debounce timer for config updates
const CONFIG_DEBOUNCE_MS = 500;  // NEW: 500ms debounce delay
```

### Step 2: Wrap Message Handler with Debounce
**File:** `webapps/gantt-chart/app.js`

Modify the message event listener (lines 349-374):

**Before:**
```javascript
window.addEventListener('message', function(event) {
    if (event.data) {
        try {
            const eventData = JSON.parse(event.data);
            webAppConfig = eventData['webAppConfig'];
            const filters = eventData['filters'] || [];

            console.log('Received updated config:', webAppConfig);

            validateConfig(webAppConfig);

            // Validate date boundaries - block rendering if invalid
            const dateBoundaryError = validateDateBoundaries();
            if (dateBoundaryError) {
                displayError('Date Boundary Error', dateBoundaryError);
                return;
            }

            initializeChart(webAppConfig, filters);

        } catch (error) {
            console.error('Configuration processing error:', error);
            displayError('Configuration Error', error.message);
        }
    }
});
```

**After:**
```javascript
window.addEventListener('message', function(event) {
    if (event.data) {
        try {
            const eventData = JSON.parse(event.data);
            webAppConfig = eventData['webAppConfig'];
            const filters = eventData['filters'] || [];

            console.log('Received updated config:', webAppConfig);

            validateConfig(webAppConfig);

            // Validate date boundaries - block rendering if invalid
            const dateBoundaryError = validateDateBoundaries();
            if (dateBoundaryError) {
                displayError('Date Boundary Error', dateBoundaryError);
                return;
            }

            // Debounce chart initialization to prevent excessive re-renders
            // when user is rapidly adjusting numeric inputs (spinners)
            if (configDebounceTimer) {
                clearTimeout(configDebounceTimer);
            }
            configDebounceTimer = setTimeout(() => {
                initializeChart(webAppConfig, filters);
            }, CONFIG_DEBOUNCE_MS);

        } catch (error) {
            console.error('Configuration processing error:', error);
            displayError('Configuration Error', error.message);
        }
    }
});
```

---

## Feature 2: Sticky Header via JavaScript

### Symptom
When users scroll vertically through a large task list, the timeline header (showing months/weeks/days) scrolls out of view, making it difficult to determine what date each task bar corresponds to.

### Root Cause
CSS `position: sticky` fails because of nested scroll containers:

```html
<!-- Dataiku iframe container (has overflow) -->
  <div id="gantt-container" style="overflow: auto">    <!-- Our container -->
    <div class="gantt-container" style="overflow: auto">  <!-- Frappe's container -->
      <div class="grid-header">  <!-- Sticky target -->
```

The `.grid-header` element is sticky relative to `.gantt-container`, but actual scrolling happens on `#gantt-container`. This architectural mismatch breaks CSS sticky positioning.

Previous attempts in v0.4.0 tried CSS-only solutions but confirmed they don't work in Dataiku's iframe structure.

### Solution
Use JavaScript to sync header position during vertical scroll events. This manually positions the header element to simulate sticky behavior.

---

## Fix Plan: Sticky Header

### Step 1: Add Sticky Header Setup Function
**File:** `webapps/gantt-chart/app.js`

Add a new function after the `updateSvgDimensions()` function (~line 607):

```javascript
// ===== STICKY HEADER VIA JS SCROLL SYNC =====

/**
 * Set up JavaScript-based sticky header behavior.
 * CSS position:sticky fails in nested scroll containers (Dataiku's iframe structure).
 * This manually syncs the header position during vertical scroll.
 */
function setupStickyHeader() {
    const container = document.getElementById('gantt-container');
    const header = document.querySelector('.gantt-container .grid-header');

    if (!container || !header) {
        console.warn('Sticky header setup failed: container or header not found');
        return;
    }

    // Store original header styles for cleanup
    const originalPosition = header.style.position;
    const originalTop = header.style.top;
    const originalZIndex = header.style.zIndex;

    // Apply base styles for JS-controlled sticky
    header.style.position = 'relative';
    header.style.zIndex = '1001';
    header.style.backgroundColor = 'var(--g-header-background, #fff)';

    // Track scroll position and update header transform
    container.addEventListener('scroll', function onScroll() {
        // Only apply vertical offset - horizontal scrolling should move header
        const scrollTop = container.scrollTop;

        // Use transform for smoother performance than top/position changes
        header.style.transform = `translateY(${scrollTop}px)`;
    }, { passive: true });

    console.log('Sticky header initialized via JS scroll sync');
}
```

### Step 2: Call Setup After Chart Render
**File:** `webapps/gantt-chart/app.js`

In the `renderGantt()` function, add call to `setupStickyHeader()` in the post-render block (~line 571):

**Before:**
```javascript
// Post-render adjustments
requestAnimationFrame(() => {
    enforceMinimumBarWidths();
    updateSvgDimensions();
    adjustHeaderLabels();
});
```

**After:**
```javascript
// Post-render adjustments
requestAnimationFrame(() => {
    enforceMinimumBarWidths();
    updateSvgDimensions();
    adjustHeaderLabels();
    setupStickyHeader();  // NEW: Enable sticky header via JS
});
```

### Step 3: Disable Conflicting CSS Sticky
**File:** `resource/webapp/style.css`

The existing CSS sticky rules may conflict with JS-based positioning. Update the sticky section (~line 315):

**Before:**
```css
/* ===== STICKY HEADER FIX ===== */
/* Ensure header stays visible during vertical scroll.
   With .gantt-container overflow-y:visible (set above), the header is now
   sticky relative to #gantt-container where actual scrolling happens. */
.gantt-container .grid-header {
    position: sticky;
    top: 0;
    z-index: 1001;
    background-color: var(--g-header-background, #fff);
}
```

**After:**
```css
/* ===== STICKY HEADER (JS-CONTROLLED) ===== */
/* CSS position:sticky doesn't work in Dataiku's nested scroll containers.
   JavaScript in app.js handles sticky behavior via transform on scroll.
   These base styles ensure the header renders correctly. */
.gantt-container .grid-header {
    position: relative;  /* JS will apply transform */
    z-index: 1001;
    background-color: var(--g-header-background, #fff);
    will-change: transform;  /* Optimize for animations */
}
```

---

## Step N: Version Bump
**File:** `plugin.json`

Change version from `0.4.1.6` to `0.4.2`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/app.js` | Edit | Add debounce timer, add setupStickyHeader() |
| `resource/webapp/style.css` | Edit | Update sticky header CSS for JS control |
| `plugin.json` | Edit | Version 0.4.1.6 → 0.4.2 |

---

## Testing Checklist

### Debouncing (#15)
- [ ] Adjust Bar Height spinner rapidly (click 5+ times quickly)
- [ ] Verify chart only re-renders once after clicking stops
- [ ] Verify no visual jank during rapid adjustment
- [ ] Verify scroll position is preserved after debounced render
- [ ] Verify text inputs (dataset selection) still work immediately

### Sticky Header (#11)
- [ ] Load chart with 20+ tasks
- [ ] Scroll DOWN vertically - header stays visible at top
- [ ] Scroll RIGHT horizontally - header scrolls with content (correct)
- [ ] Scroll diagonally - header tracks vertical position only
- [ ] Switch view modes with header in sticky position - no visual glitches
- [ ] Large dataset (100+ tasks) - no performance lag during scroll

### Regression Checks
- [ ] Responsive header abbreviations still work (Week, Month, Year views)
- [ ] Date boundary controls still work
- [ ] View mode transitions work correctly
- [ ] Today button works in all views

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files. If changes aren't committed, the user will test against old code.

**Pre-QA Commit Process:**
1. After implementing the features, **commit the changes** with:
   ```
   feat(v0.4.2): Add config debouncing and sticky header (#15, #11)

   Implements two UX improvements:
   - Configuration debouncing: 500ms delay prevents excessive re-renders
     when adjusting numeric inputs like bar height spinner
   - Sticky header: JavaScript scroll sync keeps timeline header visible
     during vertical scrolling (CSS sticky fails in nested containers)

   Changes:
   - app.js: Add debounce timer, add setupStickyHeader()
   - style.css: Update header CSS for JS-controlled sticky
   - plugin.json: Version bump to 0.4.2

   Fixes #15
   Fixes #11

   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```

2. Verify commit was successful: `git log --oneline -1`

3. Notify the user that code is committed and ready for QA

**User QA Steps:**
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Provide clear steps for the user to test
3. Wait for explicit user approval before proceeding
4. If user reports issues, address them and commit again before re-testing

**QA Script for User:**
```
1. DEBOUNCING TEST
   - In Gantt Chart webapp settings sidebar, find "Bar Height"
   - Click the up/down spinner arrows rapidly 5+ times
   - EXPECTED: Chart only re-renders once after you stop clicking
   - EXPECTED: No visual jank or scroll position jumps during clicking

2. STICKY HEADER TEST
   - Load a dataset with at least 20 tasks
   - Scroll DOWN through the task list
   - EXPECTED: Timeline header (dates/weeks) stays fixed at top
   - Scroll RIGHT horizontally
   - EXPECTED: Header scrolls horizontally with the chart content

3. REGRESSION TEST
   - Switch between view modes (Week → Month → Year → Day)
   - EXPECTED: All views render correctly, header labels adjust appropriately
   - Test Today button in each view
   - EXPECTED: Chart scrolls to today's date
```

**Do not proceed to PR/merge until user confirms both features work.**

---

## Rollback Plan

If issues occur:

```bash
# Revert specific files
git checkout main -- webapps/gantt-chart/app.js
git checkout main -- resource/webapp/style.css
git checkout main -- plugin.json
```

---

## Watch Out For

1. **Debounce Timer Cleanup**: If multiple rapid config changes arrive, ensure only the final state is rendered. The `clearTimeout` pattern handles this.

2. **Scroll Event Performance**: Use `{ passive: true }` on scroll listener to avoid blocking scroll. Transform-based positioning is GPU-accelerated.

3. **Header Reference Stale After View Change**: Frappe Gantt recreates DOM on view mode switch. The `setupStickyHeader()` is called in `requestAnimationFrame` after each render to handle this.

4. **Horizontal Scroll Interaction**: The JS sticky approach only applies vertical transform. Horizontal scrolling should work normally since header is inside the scrolling container.

5. **Initial Render Debounce**: The first render after page load should NOT be debounced - user expects immediate chart display. The debounce only applies to subsequent config updates.

---

## Architecture Notes

### Why JavaScript Instead of CSS Sticky?

CSS `position: sticky` requires:
- The sticky element to be a direct child of the scrolling container
- Only ONE ancestor with `overflow` set

Dataiku's architecture violates both:
```
Dataiku iframe (overflow: auto)
  → #gantt-container (overflow: auto)
    → .gantt-container (overflow: auto)
      → .grid-header (sticky target)
```

With 3 nested scroll contexts, the browser can't determine which container the header should stick to. The JS approach bypasses this by directly manipulating the header's transform based on scroll position.

### Debounce vs Throttle

We use **debounce** (wait until activity stops) rather than **throttle** (limit frequency):
- Debounce: User clicks 10 times → 1 render after 500ms of inactivity
- Throttle: User clicks 10 times → renders every 500ms during clicking

Debounce is better here because:
1. We want the FINAL value, not intermediate values
2. Rendering intermediate states wastes resources
3. User should see their final choice reflected, not arbitrary midpoints
