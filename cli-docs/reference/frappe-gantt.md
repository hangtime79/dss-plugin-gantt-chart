# Frappe Gantt Reference

Library-specific patterns for integrating [Frappe Gantt](https://frappe.io/gantt) in Dataiku webapps.

---

## Popup Callback Wrapper

### The Problem

When implementing a custom `popup` function, the library sometimes passes a wrapper object instead of the direct Task object. Accessing `task.name` directly yields `undefined`.

### The Solution

Check if the passed object has a `task` property and unwrap it:

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

---

## Debugging Circular References

### The Problem

Frappe Gantt task objects contain circular references (links to DOM elements, parent SVG containers). Using `JSON.stringify(task)` crashes with `TypeError: cyclic object value`.

### The Solution

Log objects directly - let the browser inspector handle circular refs:

```javascript
// BAD - Crashes
console.log('Task:', JSON.stringify(task));

// GOOD - Works
console.log('Task:', task);
```

---

## Scrolling Container Setup

### The Problem

Frappe Gantt uses CSS variable `--gv-grid-height` to dynamically set height based on task count. Overriding with `height: 100%` eliminates overflow - no scrollbars appear.

### The Solution

Put `overflow: auto` on YOUR outer wrapper, not on Frappe's container:

```css
/* Your outer container - this one scrolls */
#gantt-container {
    width: 100%;
    height: 100%;
    overflow: auto;      /* Scrollbars appear here */
    position: relative;
}

/* Do NOT override Frappe's container height!
   Frappe uses: height: var(--gv-grid-height);
   which it calculates dynamically.

   .gantt-container {
       height: 100%;    <-- WRONG - breaks scrolling
   }
*/
```

### Why This Works

1. Your `#gantt-container` fills the viewport with `overflow: auto`
2. Frappe's `.gantt-container` grows larger than viewport (via `--gv-grid-height`)
3. When Frappe exceeds your container, scrollbars appear

### Common Mistake

```css
/* WRONG - Forces both to viewport height, nothing to scroll */
#gantt-container { overflow: hidden; }
.gantt-container { height: 100%; overflow: auto; }
```

---

## Dependencies Data Type

### The Problem

Frappe Gantt expects `task.dependencies` as an **array** of task IDs. If you pass a comma-separated string, `.map()` fails silently and no dependency arrows render.

### The Solution

Ensure dependencies are arrays:

```python
# Backend (Python)
# BAD - String
task['dependencies'] = "task1,task2"

# GOOD - Array
task['dependencies'] = ["task1", "task2"]
```

```javascript
// Frontend check
if (typeof task.dependencies === 'string') {
    task.dependencies = task.dependencies.split(',').map(s => s.trim());
}
```

---

## Related

- [Frappe Gantt GitHub](https://github.com/frappe/gantt)
- [Webapps Guide](../guides/webapps.md) - General webapp patterns
