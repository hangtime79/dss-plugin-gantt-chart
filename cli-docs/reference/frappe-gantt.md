# Frappe Gantt Reference

Library-specific patterns for integrating [Frappe Gantt](https://frappe.io/gantt) in Dataiku webapps.

---

## Quick Reference

| Need to... | See Section |
|------------|-------------|
| Initialize the chart | [Basic Setup](#basic-setup) |
| Handle popup clicks | [Popup Callback](#popup-callback-wrapper) |
| Fix scroll issues | [Scrolling Container](#scrolling-container-setup) |
| Set dependencies | [Dependencies Format](#dependencies-data-type) |
| Debug issues | [Common Gotchas](#common-gotchas) |

---

## Basic Setup

```javascript
const tasks = [
    {
        id: 'task-1',
        name: 'Task Name',
        start: '2024-01-01',
        end: '2024-01-15',
        progress: 50,
        dependencies: ['task-0']  // Array, not string!
    }
];

const gantt = new Gantt('#gantt-container', tasks, {
    view_mode: 'Week',  // Case-sensitive: "Week" not "week"
    on_click: task => console.log(task),
    on_view_change: mode => console.log(mode.name)  // mode is object, not string
});
```

---

## Configuration

### Options vs Config Objects

The library maintains two state objects:

| Object | Contains | Example |
|--------|----------|---------|
| `gantt.options` | Primitive values (strings, numbers) | `options.view_mode` → `"Week"` |
| `gantt.config` | Computed objects, internal state | `config.view_mode` → `{name: "Week", ...}` |

**Always use `options.view_mode`** when you need the string value.

### View Modes

Case-sensitive values: `"Hour"`, `"Quarter Day"`, `"Half Day"`, `"Day"`, `"Week"`, `"Month"`, `"Year"`

---

## Callbacks

### Popup Callback Wrapper

**The Problem:** The library sometimes passes a wrapper object instead of the Task directly.

```javascript
popup: function(task) {
    // Unwrap if necessary
    if (task && task.task) {
        task = task.task;
    }
    // Now safe to use task.name, task.start, etc.
    return buildPopupHtml(task);
}
```

### on_view_change Mode Parameter

**The Problem:** The `mode` parameter is an object, not a string. Saving it directly to localStorage stores `"[object Object]"`.

```javascript
// BAD - mode is an object
on_view_change: function(mode) {
    localStorage.setItem('viewMode', mode);  // Stores "[object Object]"
}

// GOOD - Extract mode.name for the string value
on_view_change: function(mode) {
    const viewModeName = typeof mode === 'string' ? mode : mode.name;
    localStorage.setItem('viewMode', viewModeName);  // Stores "Week"
}
```

---

## DOM Structure

Understanding the library's DOM helps with custom styling and post-render manipulation.

### Grid Header

The `.grid-header` is an **HTML `<div>`** with absolutely-positioned text elements, NOT an SVG group.

```css
/* This works - HTML elements */
.grid-header .upper-text { font-weight: bold; }

/* This WON'T work - no SVG lines in header */
.grid-header line { stroke: red; }
```

### Month View Text

The naming is counterintuitive:
- `.upper-text` → Displays **Years**
- `.lower-text` → Displays **Months**

### Data Attributes

The `data-id` attribute is on `.bar-wrapper`, not `.bar-group`:

```javascript
// CORRECT
wrapper.getAttribute('data-id')

// WRONG - bar-group doesn't have data-id
wrapper.closest('.bar-group').getAttribute('data-id')
```

---

## Scrolling Container Setup

**The Problem:** Frappe uses CSS variable `--gv-grid-height` for dynamic height. Overriding with `height: 100%` breaks scrolling.

**The Solution:** Put `overflow: auto` on YOUR wrapper, not Frappe's container:

```css
/* Your outer container - this one scrolls */
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: auto;      /* Scrollbars appear here */
    position: relative;
}

/* Do NOT override Frappe's container height!
   .gantt-container { height: 100%; }  <-- WRONG
*/
```

---

## Dependencies Data Type

**The Problem:** Library expects `task.dependencies` as an **array**. Comma-separated strings fail silently.

```python
# Backend (Python)
# BAD - String
task['dependencies'] = "task1,task2"

# GOOD - Array
task['dependencies'] = ["task1", "task2"]
```

```javascript
// Frontend check (defensive)
if (typeof task.dependencies === 'string') {
    task.dependencies = task.dependencies.split(',').map(s => s.trim());
}
```

---

## Popup Positioning

**The Problem:** The library treats popup coordinates as anchors and re-centres after render. Modifying `opts.x/y` before `show_popup()` doesn't work reliably.

**The Solution:** Call original method first, then correct position in `requestAnimationFrame`:

```javascript
const originalShowPopup = gantt.show_popup.bind(gantt);

gantt.show_popup = function(opts) {
    originalShowPopup(opts);

    requestAnimationFrame(() => {
        const popup = document.querySelector('.popup-wrapper');
        popup.style.transition = 'none';  // Prevent visual jump
        popup.style.left = desiredX + 'px';
        popup.style.top = desiredY + 'px';
    });
};
```

---

## Header Manipulation

### Position-Based Date Lookup

**The Problem:** When adding year to header text, searching by month name finds the FIRST match in the array, regardless of position.

```javascript
// BAD - Finds first December in entire dates array
const matchingDate = ganttInstance.dates.find(d => d.getMonth() === 11);
// If timeline has Dec 2023 AND Dec 2024, always returns Dec 2023
```

**The Solution:** Use position to calculate array index:

```javascript
const columnWidth = ganttInstance.config.column_width;

upperTexts.forEach(text => {
    const elementX = parseFloat(text.style.left) || 0;
    const dateIndex = Math.round(elementX / columnWidth);

    if (dateIndex >= 0 && dateIndex < ganttInstance.dates.length) {
        const elementDate = ganttInstance.dates[dateIndex];
        text.textContent = `${text.textContent} ${elementDate.getFullYear()}`;
    }
});
```

---

## Common Gotchas

### CSS Class Generation

The library creates CSS selectors from task properties (e.g., `.highlight-{task.id}`).

**Risk:** Task IDs with special characters create invalid CSS:
- `"Task 1"` → `.highlight-Task 1` (invalid - space)
- `"54.8"` → `.highlight-54.8` (invalid - period means class)

**Fix:** Hex-encode IDs to be CSS-safe before passing to library.

### custom_class Whitespace

The library uses `classList.add()` for `custom_class`, which throws on whitespace:

```javascript
// WRONG - DOMException
task.custom_class = "status-active high-priority"

// CORRECT - Single class only
task.custom_class = "status-active"
```

### No destroy() Method

The library lacks a `destroy()` method. Event listeners persist after DOM is cleared, causing memory leaks or zombie handlers on re-render.

**Workaround:** Guard against undefined when accessing potentially stale DOM refs.

### Debugging Circular References

Task objects contain circular refs (DOM elements, SVG containers). `JSON.stringify(task)` crashes.

```javascript
// BAD - Crashes
console.log('Task:', JSON.stringify(task));

// GOOD - Let browser handle circular refs
console.log('Task:', task);
```

### Scroll Behavior Race Condition

Using `behavior: "smooth"` triggers a race condition if you read `scrollLeft` immediately after.

```javascript
// BAD - scrollLeft is stale
container.scrollTo({ left: 100, behavior: 'smooth' });
console.log(container.scrollLeft);  // Wrong value!

// GOOD - Use instant for synchronous updates
container.scrollTo({ left: 100, behavior: 'instant' });
console.log(container.scrollLeft);  // Correct
```

### maintain_scroll Issues

The library's `maintain_scroll` feature preserves pixel positions across view modes, which is often meaningless (Week position 500px ≠ Month position 500px).

### View Mode Mutation Bug

**The Problem:** The library's `change_view_mode()` assigns a default config object directly, then mutates it. Closures capture the mutated object; subsequent renders see stale values.

```javascript
// Library internals (simplified)
const DEFAULT_MODE = { name: "Week", padding: "2m" };
this.config.view_mode = DEFAULT_MODE;  // Direct assignment
this.config.view_mode.language = currentLang;  // Mutates shared object!
```

**Impact:** First render captures language in closure. Later renders reuse the same mutated object with stale language.

**Fix:** Shallow copy before assignment in patches:

```javascript
this.config.view_mode = { ...DEFAULT_MODE };  // New object each time
```

### Single Popup Architecture

**The Problem:** Library has a single `$popup_wrapper` singleton. You can't have multiple simultaneous tooltips.

**Workaround:** For pinnable/persistent tooltips, clone popup content into independent DOM elements:

```javascript
// Create separate container for pinned tooltips
const pinnedContainer = document.createElement('div');
pinnedContainer.className = 'pinned-tooltips';
document.body.appendChild(pinnedContainer);

// Clone popup content instead of fighting library's singleton
function pinTooltip(popupContent) {
    const clone = popupContent.cloneNode(true);
    clone.classList.add('pinned-tooltip');
    pinnedContainer.appendChild(clone);
    return clone;
}
```

---

## Rendering & Sizing

### SVG Width Bug

The library sets `width="100%"` which can break layout in some containers.

**Workaround:** Explicitly set pixel width after render:

```javascript
requestAnimationFrame(() => {
    const svg = document.querySelector('.gantt svg');
    svg.setAttribute('width', container.scrollWidth + 'px');
});
```

### Post-Render DOM Manipulation

Libraries manipulate DOM asynchronously. Use `requestAnimationFrame` for custom adjustments:

```javascript
ganttInstance = new Gantt("#gantt", tasks, options);

// Defer until after library render
requestAnimationFrame(() => {
    applyCustomStyles();
});
```

For layout-dependent calculations, use double rAF:

```javascript
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        // Layout is now settled
        measureAndAdjust();
    });
});
```

### Hardcoded Colors

Some elements like `.current-upper` (floating year) have hardcoded `background: #fff`, requiring `!important` for dark mode overrides.

---

## Related

- [Frappe Gantt GitHub](https://github.com/frappe/gantt)
- [Webapps Guide](../guides/webapps.md) - General webapp patterns
