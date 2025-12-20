# CLI Docs Updates

## 1. Frappe Gantt Popup Callback Wrapper

### Context
When implementing a custom `popup` function in the Frappe Gantt configuration.

### The Problem
The library sometimes passes a wrapper object instead of the direct Task object to the callback. Accessing properties like `task.name` or `task.start` directly yields `undefined`.

### The Solution
Check if the passed object has a `task` property and unwrap it.

### Implementation

```javascript
popup: function(task) {
    // Unwrap if necessary
    if (task && task.task) {
        task = task.task;
    }
    // Now safe to use task.name, task.start, etc.
    return buildHtml(task);
}
```

## 2. Debugging Frappe Gantt Objects

### Context
Logging task objects to the console for debugging.

### The Problem
Frappe Gantt task objects contain circular references (e.g., links to DOM elements or parent SVG containers). Using `JSON.stringify(task)` causes a `TypeError: cyclic object value`.

### The Solution
Log the object directly to the console, allowing the browser's native inspector to handle it.

### Implementation

```javascript
// BAD
console.log('Task:', JSON.stringify(task)); // Crashes

// GOOD
console.log('Task:', task); // Works
```
