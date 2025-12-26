# Gantt Chart Render Flow - Pseudo-code

## Overview

Two render paths exist:
1. **Initial Render** - When page loads or config changes
2. **View Mode Change** - When user switches view modes or zoom triggers re-render

---

## 1. Initial Render Flow

```
USER ACTION: Page load OR config panel change

dataiku.getWebAppConfig():
    webAppConfig = received config

    IF config incomplete:
        RETURN (wait for complete config)

    validateConfig(webAppConfig)
    validateDateBoundaries()

    DEBOUNCE 300ms:
        IF renderInProgress:
            SKIP (wait for next debounce)

        // Save current state for restoration
        savedState = {
            viewMode: ganttInstance.options.view_mode,
            scrollLeft: container.scrollLeft,
            scrollTop: container.scrollTop
        }
        window._ganttRestoreState = savedState

        renderInProgress = TRUE
        initializeChart(webAppConfig, filters)
```

### initializeChart(config, filters)

```
showLoading()

IF Gantt library not loaded:
    displayError("Library Error")
    RETURN

ganttConfig = buildGanttConfig(config)
    // Handles:
    // - View mode persistence (localStorage)
    // - Zoom preservation (currentColumnWidth)
    // - Config panel columnWidth changes

tasks = AWAIT fetchTasks(config, filters)  // Backend call

hideLoading()

IF error OR no tasks:
    displayError(...)
    RETURN

IF metadata has warnings:
    displayMetadata(...)

renderGantt(tasks, ganttConfig)
```

### renderGantt(tasks, config)

```
currentTasks = tasks  // Store for expected progress markers

container.innerHTML = ''  // Clear previous
ganttInstance = NULL

// Create fresh SVG element
svg = createSVGElement(id='gantt-svg')
container.appendChild(svg)

// Build options object
ganttOptions = {
    view_mode: config.view_mode,
    column_width: config.column_width,
    bar_height: config.bar_height,
    ...
    on_view_change: [callback - see View Mode Change Flow]
}

applyDateBoundaryPatch()  // Monkey-patch before instantiation

TRY:
    ganttInstance = new Gantt('#gantt-svg', tasks, ganttOptions)

    updateControlsState(ganttOptions)

    // POST-RENDER ADJUSTMENTS (next frame)
    requestAnimationFrame():
        enforceMinimumBarWidths()
        fixProgressBarRadius()
        updateSvgDimensions()
        adjustHeaderLabels()
        setupStickyHeader()
        addExpectedProgressMarkers()
        ensureEdgeToEdgeContent()  // <-- Issue #21 fix

        // Restore saved state if exists
        IF window._ganttRestoreState:
            restore viewMode, scrollLeft, scrollTop
            window._ganttRestoreState = NULL

        renderInProgress = FALSE

CATCH error:
    displayError(...)
    renderInProgress = FALSE
```

---

## 2. View Mode Change Flow

Triggered by:
- User clicks view mode dropdown
- `ganttInstance.change_view_mode()` called
- `ensureEdgeToEdgeContent()` triggers re-render

```
ganttInstance.change_view_mode(newMode)
    |
    v
FRAPPE-GANTT INTERNAL:
    - Recalculates date columns
    - Rebuilds SVG grid and bars
    - Recreates header DOM
    |
    v
on_view_change CALLBACK:
    viewModeName = mode.name  // mode is object, not string!

    // Sync UI dropdown
    viewModeSelect.value = viewModeName

    // Persist to localStorage
    saveViewMode(datasetName, viewModeName)

    // POST-VIEW-CHANGE ADJUSTMENTS (next frame)
    requestAnimationFrame():
        enforceMinimumBarWidths()
        fixProgressBarRadius()
        updateSvgDimensions()
        adjustHeaderLabels()
        setupStickyHeader()
        addExpectedProgressMarkers()
        ensureEdgeToEdgeContent()  // <-- May trigger another change_view_mode!
```

---

## 3. Edge-to-Edge Content Flow (Issue #21)

### Understanding SVG Width Calculation

Frappe Gantt calculates SVG width as:
```
SVG Width = ganttInstance.dates.length * ganttInstance.config.column_width
```

Where:
- `dates` = Array of Date objects, one per column
- `dates.length` = Number of columns (determined by date range + view mode)
- `config.column_width` = Pixel width per column

**Key Insight:** `dates.length` is only known AFTER `new Gantt()` runs. The library:
1. Calculates `gantt_start` and `gantt_end` from task data
2. Generates `dates[]` array based on view mode step (Day=1 day, Week=7 days, etc.)
3. Renders SVG with `width = dates.length * column_width`

### Current Implementation (Two-Pass Render)

```
ensureEdgeToEdgeContent():
    IF no ganttInstance: RETURN
    IF edgeToEdgeInProgress: RETURN  // CRITICAL: Prevents infinite loop

    // AVAILABLE AT THIS POINT:
    // - ganttInstance.dates.length (number of columns)
    // - ganttInstance.config.column_width (current width)
    // - ganttInstance.gantt_start, gantt_end (date boundaries)
    // - svg.getAttribute('width') = dates.length * column_width

    containerWidth = container.offsetWidth
    svgWidth = svg.getAttribute('width')  // = dates.length * column_width
    currentColWidth = ganttInstance.options.column_width

    IF svgWidth >= containerWidth:
        // Content fills viewport - no action needed
        minColumnWidthForViewport = currentColWidth
        RETURN

    // Content is narrow - calculate needed column width
    // Formula: neededColWidth = containerWidth / dates.length
    // Current code uses ratio: currentColWidth * (containerWidth / svgWidth) * 1.02
    // Which simplifies to: containerWidth / dates.length * 1.02
    neededColWidth = currentColWidth * (containerWidth / svgWidth) * 1.02
    minColumnWidthForViewport = neededColWidth

    IF currentColWidth < neededColWidth:
        // Apply zoom to fill viewport
        currentColumnWidth = neededColWidth
        ganttInstance.options.column_width = neededColWidth
        updateZoomIndicator()

        // RE-RENDER (second pass) with guard
        edgeToEdgeInProgress = TRUE
        ganttInstance.change_view_mode(currentViewMode)

        // Clear guard after 2 frames (covers callback cycle)
        requestAnimationFrame():
            requestAnimationFrame():
                edgeToEdgeInProgress = FALSE
```

### The Problem: Two-Pass Render

When content is narrow, we render TWICE:
1. **First pass:** Render with default/current column_width → SVG too narrow
2. **Second pass:** Recalculate needed width, re-render with larger column_width

### Alternative: Single-Pass (Calculate Before Render)

We COULD calculate `dates.length` ourselves before rendering:

```
// Pseudo-code for pre-calculating column count
function calculateColumnCount(startDate, endDate, viewMode):
    SWITCH viewMode:
        'Day':    RETURN daysBetween(start, end)
        'Week':   RETURN weeksBetween(start, end)
        'Month':  RETURN monthsBetween(start, end)
        'Year':   RETURN yearsBetween(start, end)

neededColumnWidth = containerWidth / columnCount
config.column_width = MAX(neededColumnWidth, MIN_ZOOM)
// Then render once
```

**Why we don't do this:**
- Need to replicate Frappe's date range calculation logic
- Edge cases with padding, step sizes, etc.
- Current two-pass approach is simpler and works

---

## 4. Manual Zoom Flow

```
USER ACTION: Click +/- zoom button

adjustZoom(delta):  // delta = +5 or -5
    IF no ganttInstance: RETURN

    newWidth = currentColumnWidth + delta

    // Enforce minimum only (no maximum)
    IF newWidth < MIN_ZOOM (15):
        newWidth = MIN_ZOOM

    IF newWidth == currentColumnWidth:
        RETURN  // No change

    currentColumnWidth = newWidth
    ganttInstance.options.column_width = newWidth

    // Force refresh via view mode change
    ganttInstance.change_view_mode(currentViewMode)
    // This triggers on_view_change -> post-render adjustments

    updateZoomIndicator()
```

---

## Key State Variables

| Variable | Purpose |
|----------|---------|
| `ganttInstance` | Active Frappe Gantt instance |
| `currentColumnWidth` | Local zoom state (preserved across config changes) |
| `lastConfiguredColumnWidth` | Tracks panel setting to detect explicit changes |
| `renderInProgress` | Prevents overlapping renders |
| `edgeToEdgeInProgress` | Prevents infinite edge-to-edge loops |
| `minColumnWidthForViewport` | Calculated minimum for viewport fill |
| `currentTasks` | Stored for expected progress markers |

---

## Render Trigger Summary

| Trigger | Path | Notes |
|---------|------|-------|
| Page load | Initial | Full init |
| Config panel change | Initial (debounced) | Preserves zoom unless columnWidth changed |
| View mode dropdown | View Mode Change | Via dropdown handler |
| Zoom +/- buttons | View Mode Change | Via adjustZoom() |
| Edge-to-edge auto-zoom | View Mode Change | Guarded to prevent loops |
