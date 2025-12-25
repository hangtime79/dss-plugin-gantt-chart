# Feature v0.5.0 Specification

## Branch
`feature/v0.5.0-ui-overhaul`

## Linked Issues
- Related to "How could we improve the UI" request

## Overview
A comprehensive UI overhaul to modernize the Gantt Chart plugin. This includes a new design system (CSS variables), improved spacing/typography (system stack), and proper control bars, while respecting air-gap constraints and platform limitations.

---

## Feature: Modern UI & Design System

### Symptom
The current UI looks basic, with raw HTML elements and default styling. The user requested a "deep analysis" and UI improvements to make it "wowed at first glance" while maintaining functionality.

### Root Cause
- Lack of a coherent design system (hardcoded colors).
- Old-fashioned loading/error states.
- Hidden or default UI controls.

---

## Fix Plan

### Step 1: Design System & CSS Refactor
**File:** `resource/webapp/style.css`
- **Goal**: Introduce CSS variables for colors, spacing, and shadows to act as a "Design System".
- **Action**:
    - Define `:root` variables for Primary (`#2d3436`), Secondary (`#636e72`), Accent (`#0984e3`), and Background colors.
    - Set `font-family` to a robust System Font Stack (e.g., Apple System, Segoe UI, Inter, sans-serif) to simulate premium typography without external requests (Air-Gap safe).
    - Refactor existing classes to use these variables.
    - Implement BEM-like naming for new components.

### Step 2: Component Upgrades
**File:** `webapps/gantt-chart/body.html`, `webapps/gantt-chart/app.js`
- **Control Bar**:
    - Create a `<div class="control-bar">` above the chart.
    - Move "View Mode" selector here, styled as a modern dropdown.
    - Add "Zoom" buttons (+/-) that adjust `options.column_width` (Careful with sticky header: mostly for visual clarity, not structural change).
- **Loading State**:
    - Replace spinner with a CSS-only skeleton loader (animated gray bars).
    - Logic: Show skeleton on *initial* load only. Keep spinner or subtle progress bar for updates.
- **Toasts**:
    - Style the metadata banner to look like a floating "Toast" notification.
- **Empty/Error States**:
    - Use `<i class="icon-warning-sign"></i>` (Dataiku standard FontAwesome) instead of large text blocks.

### Step 3: Visual Polish
**File:** `resource/webapp/style.css`
- **Bars**: Add subtle rounding and softer colors to Gantt bars.
- **Grid**: Lighten lines (`#f1f2f6`).
- **Tooltips**: Style as "Cards" with shadow and padding.

### Step 4: Progress-Based Default Colors (No Color Column)
**Files:** `python-lib/ganttchart/task_transformer.py`, `resource/webapp/style.css`

When **no color column is selected**:

**Base bar**: `#f0f3f6` (light gray)
**Text**: Black (`#2d3436`)
**Progress overlay**: Color changes based on completion percentage:

| Progress | Overlay Color | CSS Class |
|----------|---------------|-----------|
| 0% | `#f0f3f6` (invisible - same as base) | `progress-tier-0` |
| 1-24% | `#d4d9de` | `progress-tier-1` |
| 25-49% | `#bac2ca` | `progress-tier-25` |
| 50-74% | `#a8b1ba` | `progress-tier-50` |
| 75-99% | `#96a0a8` | `progress-tier-75` |
| 100% | `#8faa94` (green tint - complete) | `progress-tier-100` |

**Logic**:
- In `task_transformer.py`, when `color_column` is None/empty:
  - Set `custom_class` = `bar-default` (base gray bar with black text)
  - Calculate progress tier and add `progress-tier-{N}` class
- CSS targets `.bar-default .bar` for base color, `.progress-tier-{N} .bar-progress` for overlay

**Visual effect**: Progress overlay darkens as completion increases, with green tint at 100%.

### Step N: Version Bump
**File:** `plugin.json`
- Bump version to `0.5.0`

---

## Files to Modify
| File | Action | Description |
|------|--------|-------------|
| `resource/webapp/style.css` | Rewrite | CSS variables, component styles, progress tier classes |
| `webapps/gantt-chart/body.html` | Modify | Add control bar structure, skeleton loader markup |
| `webapps/gantt-chart/app.js` | Modify | Update logic for controls and loading states |
| `python-lib/ganttchart/task_transformer.py` | Modify | Progress tier class assignment when no color column |
| `plugin.json` | Modify | Bump version |

---

## Testing Checklist
- [ ] **Air-Gap Check**: Ensure no network requests (FontAwesome via Dataiku classes, System Fonts).
- [ ] **Responsiveness**: Resize window → Control bar wraps/shrinks gracefully.
- [ ] **View Modes**: Switching view modes updates the chart correctly.
- [ ] **Controls**: Zoom In/Out works (adjusts column width).
- [ ] **Updates**: Changing a filter in the parent app updates the chart correctly.
- [ ] **Sticky Header**: Verify header still sticks (or degrades gracefully) after UI changes.

---

## User QA Gate                        ◀─── MANDATORY SECTION

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. After implementing the UI changes, **commit the changes** with:
   `feature(v0.5.0): modern ui overhaul (#user-req)`
2. Notify the user that code is committed.

**User QA Steps:**
1. Reload the plugin in Dataiku.
2. **Visual Check**: Does it look "Premium"? (Subjective but important).
3. **Control Bar**: Test the View Mode dropdown and Zoom buttons.
4. **Resiliency**: Resize the browser window. Does the header break?
5. **Data**: Verify tasks still load and render correctly.

**QA Script for User:**
\`\`\`
1. Open the webapp.
2. Confirm the new "Control Bar" is visible at the top.
3. Switch View Mode to "Month" using the new dropdown.
4. Click "Zoom In" (+). Confirm columns get wider.
5. Scroll down. Confirm the header (dates) sticks to the top.
\`\`\`

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Watch Out For
- **Sticky Header**: Changing layout height (Control Bar) might affect the JS scroll sync offset calculation. Check `app.js` scroll handler.
- **CSS Specificity**: Ensure our styles override `frappe-gantt.css` correctly (use specific selectors or layers if needed).
