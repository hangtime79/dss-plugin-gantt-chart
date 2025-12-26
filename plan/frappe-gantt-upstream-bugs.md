# Frappe Gantt Library Bugs

Tracking bugs discovered in the bundled Frappe Gantt library for potential upstream contribution.

**Library Version:** Bundled (unknown exact version, files in `resource/`)
**Upstream Repo:** https://github.com/niceguyjames/frappe-gantt (primary) / https://github.com/niceguitest/frappe-gantt

---

## How to Use This Document

1. Document bugs found during development/QA
2. Include reproduction steps and root cause
3. Note our local patch (for reference when reporting upstream)
4. Track upstream issue URL if reported

---

## Bug #1: clientWidth Accessed on Undefined Element

**Discovered:** v0.4.0 (2025-12-22)
**Severity:** HIGH (crashes app)
**Upstream Issue:** Not yet reported

### Symptom
```
TypeError: can't access property "clientWidth", m is undefined
```
Occurs when switching to Month or Year view.

### Root Cause
In scroll handler and `set_scroll_position()`:
```javascript
m = this.upperTexts.find(b => b.textContent === $);
this.current_date = d.add(..., m.clientWidth, ...); // CRASH - m can be undefined
```

When switching view modes, `this.upperTexts` contains stale DOM references. The `.find()` returns `undefined`, then `m.clientWidth` crashes.

### Our Patch
Added null guards in `frappe-gantt.umd.js`:
```javascript
m = this.upperTexts.find(b => b.textContent === $);
if (!m) return;  // Added guard
```

### Upstream Fix Suggestion
The library should:
1. Add null check before accessing `m.clientWidth`
2. Or refresh `this.upperTexts` after DOM changes
3. Or implement proper `destroy()` method to clean up event listeners

---

## Bug #2: maintain_scroll Breaks View Mode Switching

**Discovered:** v0.4.1 (2025-12-22)
**Severity:** HIGH (data disappears)
**Upstream Issue:** Not yet reported

### Symptom
When switching view modes via dropdown, chart renders blank or with missing bars. Scroll position jumps to incorrect date.

### Root Cause
View mode select event listener passes `maintain_scroll=true`:
```javascript
t.addEventListener("change", (function() {
  this.change_view_mode(t.value, !0);  // !0 = true = maintain_scroll
}).bind(this))
```

When `maintain_scroll=true`:
1. `setup_gantt_dates(true)` skips recalculating `gantt_start`/`gantt_end`
2. New view uses stale date boundaries from previous view
3. Grid/bar calculations mismatch, causing blank render
4. Pixel scroll position restored (meaningless across different time scales)

### Our Patch
Removed `!0` argument in both `.es.js` and `.umd.js`:
```javascript
this.change_view_mode(t.value);  // Removed !0
```

### Upstream Fix Suggestion
The `maintain_scroll` feature should:
1. Not be used for user-initiated view mode changes
2. Convert scroll position to a DATE, not pixels, before view switch
3. Restore date-based position after view switch

---

## Bug #3: SVG Width 100% Causes Partial Render

**Discovered:** v0.4.1 QA (2025-12-22)
**Severity:** HIGH (partial render)
**Upstream Issue:** Not yet reported

### Symptom
When transitioning FROM Hour view to other views (Quarter Day, Half Day, Day, Month), chart only partially renders.

Console shows:
```
Updated SVG dimensions: width=100%, height=12410px  // BROKEN
Updated SVG dimensions: width=20250px, height=12410px  // WORKS
```

### Root Cause
Two functions interact poorly:

1. `make_grid_background()` always sets `width: "100%"`:
```javascript
p.attr(this.$svg, {
  height: e,
  width: "100%"  // Always 100%
})
```

2. `set_dimensions()` only overrides to pixels conditionally:
```javascript
set_dimensions() {
  const { width: t } = this.$svg.getBoundingClientRect();
  const e = this.$svg.querySelector(".grid .grid-row").getAttribute("width");
  t < e && this.$svg.setAttribute("width", e);  // Only if container smaller
}
```

When container is already wide (from previous view with many columns), `t < e` is false, SVG stays at `100%`, and bar positioning breaks.

### Our Patch
Changed `set_dimensions()` to always set pixel width:
```javascript
set_dimensions() {
  const e = this.$svg.querySelector(".grid .grid-row") ?
            this.$svg.querySelector(".grid .grid-row").getAttribute("width") : 0;
  if (e) this.$svg.setAttribute("width", e);  // Always set, not conditional
}
```

### Upstream Fix Suggestion
Either:
1. Always set pixel width in `set_dimensions()` (our approach)
2. Calculate pixel width in `make_grid_background()` instead of using 100%
3. Use CSS `min-width` instead of `width` for the 100% case

---

## Bug #4: get_closest_date() Date Parsing Breaks Month/Year Views

**Discovered:** v0.4.1 QA (2025-12-22)
**Severity:** HIGH (Today button broken)
**Upstream Issue:** Not yet reported

### Symptom
Today button doesn't work in Month view. Clicking it scrolls to the first date instead of today. Also affects Year view.

### Root Cause
In `get_closest_date()`:
```javascript
return [
  new Date(
    d.format(e, this.config.date_format, this.options.language) + " "
  ),
  i
];
```

The `+ " "` (trailing space) breaks date parsing for Month and Year formats:
- Month: `new Date("2024-12 ")` → Invalid Date
- Year: `new Date("2024 ")` → Invalid Date
- Day: `new Date("2024-12-22 ")` → Works (browsers forgive trailing space)

When an Invalid Date is returned, `set_scroll_position()` calculates NaN for scroll position, causing scroll to fail or go to start.

### Our Patch
Use the original date object instead of format+reparse:
```javascript
// Before: return [new Date(d.format(e, ...) + " "), i];
return [e, i];  // Use original date object directly
```

### Upstream Fix Suggestion
Either:
1. Return the original date object `e` (our approach)
2. Remove the trailing space: `d.format(e, ...) + " "` → `d.format(e, ...)`
3. Add date format validation before creating new Date

---

## Bug #5: Smooth Scroll Timing Issue in set_scroll_position()

**Discovered:** v0.4.1 QA (2025-12-22)
**Severity:** MEDIUM (view transitions fail to center)
**Upstream Issue:** Not yet reported

### Symptom
When switching view modes (especially zooming out: Hour→Quarter Day, Day→Week, Week→Month), the chart fails to center on Today even though `scroll_to: "today"` is configured.

### Root Cause
In `set_scroll_position()`:
```javascript
this.$container.scrollTo({
  left: i - this.config.column_width / 6,
  behavior: "smooth"  // Asynchronous!
}), this.$current && this.$current.classList.remove("current-upper"),
this.current_date = d.add(
  this.gantt_start,
  this.$container.scrollLeft / this.config.column_width,  // Reads OLD value!
  this.config.unit
);
```

The code uses `behavior: "smooth"` (asynchronous animation) but then immediately reads `this.$container.scrollLeft`. Since smooth scroll is async, `scrollLeft` still has the OLD value, causing incorrect `current_date` calculation and upper text highlighting.

### Our Patch
Changed to instant scroll:
```javascript
this.$container.scrollTo({
  left: i - this.config.column_width / 6,
  behavior: "instant"  // Synchronous
});
```

### Upstream Fix Suggestion
Either:
1. Use `behavior: "instant"` (our approach) - loses animation but works correctly
2. Move the scrollLeft-dependent code into a scroll event handler
3. Use a Promise/callback pattern to execute code after scroll completes

---

## Bug #6: Month View Bar Positioning Off By One Month

**Discovered:** v0.7.0 QA (2025-12-26)
**Severity:** HIGH (incorrect visualization)
**Upstream Issue:** Not yet reported

### Symptom
In Month view, task bars are positioned approximately one month late. A task from Oct 1 - Dec 31 appears to span Nov - Jan instead.

Additionally:
- Hover highlight on header shows wrong months (Nov/Dec/Jan instead of Oct/Nov/Dec)
- Any calculations based on bar position (like expected progress markers) are wrong

### Evidence
Same task "Validate model performance" (Oct 1 - Dec 31):
- **Week view (CORRECT):** barX: 4245.56, barWidth: 591.43
- **Month view (WRONG):** barX: 2330.1, barWidth: 138 (offset ~1 month late)

### Root Cause
TBD - Likely in `compute_x()` or month diff calculation:
```javascript
compute_x(){
  const{column_width:t}=this.gantt.config,
  e=this.task._start,
  i=this.gantt.gantt_start;
  let r=d.diff(e,i,this.gantt.config.unit)/this.gantt.config.step*t;
  this.x=r
}
```

Possible causes:
1. `d.diff()` month calculation off-by-one
2. `gantt_start` boundary calculation wrong for Month view
3. Step/unit configuration mismatch

### Our Patch
TBD - Under investigation

### Workaround
Week view works correctly. Use Week view for accurate positioning until patched.

---

## Reporting Upstream

### Before Reporting
- [ ] Create minimal reproduction case
- [ ] Test against latest upstream version
- [ ] Check if issue already reported

### Issue Template
```markdown
## Bug Description
[One sentence]

## Steps to Reproduce
1.
2.
3.

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Environment
- Frappe Gantt version: X.X.X
- Browser: Chrome/Firefox/Safari
- OS:

## Suggested Fix
[If you have one]
```

---

## Patch Application Log

When updating Frappe Gantt, these patches must be reapplied:

| File | Location | Patch Description |
|------|----------|-------------------|
| `frappe-gantt.umd.js` | scroll handler | Null guard for `m.clientWidth` |
| `frappe-gantt.umd.js` | set_dimensions | Remove conditional, always set pixels |
| `frappe-gantt.umd.js` | view_mode_select listener | Remove `!0` argument |
| `frappe-gantt.umd.js` | get_closest_date | Return `[e, i]` instead of format+reparse |
| `frappe-gantt.umd.js` | set_scroll_position | Change `behavior:"smooth"` to `"instant"` |
| `frappe-gantt.es.js` | ~line 1077 | Remove `!0` from change_view_mode call |
| `frappe-gantt.es.js` | ~line 1321-1324 | set_dimensions always sets pixel width |
| `frappe-gantt.es.js` | ~line 1401-1404 | Return `[e, i]` instead of format+reparse |
| `frappe-gantt.es.js` | ~line 1347-1350 | Change `behavior:"smooth"` to `"instant"` |
