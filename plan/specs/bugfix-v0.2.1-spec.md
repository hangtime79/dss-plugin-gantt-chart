# Bugfix v0.2.1 - Horizontal Scrolling Fix (Revised v3)

## Branch
`bugfix/v0.2.1-fix-horizontal-scrolling`

## Problem
The Gantt chart does not scroll horizontally or vertically. Touchpad scrolling also doesn't work.

---

## Root Cause Analysis (v3 - FINAL)

### Previous Attempts and Why They Failed

| Attempt | Approach | Result |
|---------|----------|--------|
| v1 | `#gantt-container { overflow: hidden }` + `.gantt-container { height: 100%; overflow: auto }` | No scrollbars - inner container forced to viewport height |
| v2 | Same as v1, but wrong file edited | CSS not loaded at all |

### The Real Problem

Frappe Gantt's CSS uses a **CSS variable** for the container height:

```css
/* From frappe-gantt.css */
.gantt-container {
    overflow: auto;
    height: var(--gv-grid-height);  /* Dynamically calculated by Frappe JS */
    width: 100%;
}
```

Frappe Gantt calculates `--gv-grid-height` based on the number of task rows. When we override this with `height: 100%`, we force the container to exactly match the viewport height, eliminating any overflow.

**Our broken CSS:**
```css
.gantt-container {
    height: 100%;    /* BREAKS SCROLLING - overrides Frappe's calculated height */
    overflow: auto;
}
```

### The Correct Architecture

```
#gantt-container (our div)
├── overflow: auto          ← WE control scrolling here
├── height: 100%            ← Fills the viewport
└── .gantt-container (Frappe's div)
    ├── height: var(--gv-grid-height)  ← Frappe calculates this (may exceed viewport)
    └── overflow: visible   ← Let content flow to parent
        └── svg.gantt       ← The actual chart
```

---

## Correct Fix

### Step 1: Update `resource/webapp/style.css`

**Remove the `.gantt-container` height override.** Let Frappe control its own container.

**Current (BROKEN):**
```css
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: hidden;      /* Clips everything */
    position: relative;
}

.gantt-container {
    height: 100%;          /* WRONG - overrides Frappe's calculated height */
    width: 100%;
    overflow: auto;
}
```

**Fixed:**
```css
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: auto;        /* Changed: OUR container scrolls */
    position: relative;
}

/* REMOVED: Do not override .gantt-container height!
   Frappe Gantt sets height via --gv-grid-height CSS variable.

   .gantt-container {
       height: 100%;
       width: 100%;
       overflow: auto;
   }
*/
```

### Step 2: Keep the second `.gantt-container` rule (line ~151)

This rule only sets `font-family: inherit` and is safe to keep:
```css
.gantt-container {
    font-family: inherit;
}
```

---

## Why This Works

1. **`#gantt-container`** (our outer div):
   - `height: 100%` - fills the iframe viewport
   - `overflow: auto` - shows scrollbars when content exceeds viewport

2. **`.gantt-container`** (Frappe's inner div):
   - `height: var(--gv-grid-height)` - Frappe calculates total height of all rows
   - If this exceeds the viewport, `#gantt-container` shows scrollbars

3. **No height override** means Frappe's container can grow larger than the viewport, triggering scrollbars on our outer container.

---

## Verification Checklist

After applying fix:

- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Colors still display correctly (not gray)
- [ ] Vertical scrollbar appears with many tasks
- [ ] Horizontal scrollbar appears in Day/Hour view
- [ ] Touchpad/mousewheel scrolling works
- [ ] Scroll position is preserved when clicking on tasks

---

## Files Changed

| File | Change |
|------|--------|
| `resource/webapp/style.css` | Remove `.gantt-container { height: 100% }` block, change `#gantt-container` to `overflow: auto` |

---

## Previous Attempts (Historical)

### Attempt 1: Wrong file edited
The SDE modified `webapps/gantt-chart/style.css` but `body.html` loads from `resource/webapp/style.css`.

### Attempt 2: Correct file, wrong CSS
Fixed the file location issue, but the CSS approach was flawed - overriding Frappe's height calculation broke scrolling.

### Attempt 3: This fix
Don't fight Frappe's CSS. Let it control `.gantt-container` height, and put `overflow: auto` on our outer `#gantt-container`.