# Frappe Gantt Specific Learnings

## Core Library Behaviors

### Options vs. Config
- **Distinction:** The library maintains two state objects:
    - `gantt.options`: Stores primitive configuration values (strings, numbers) passed during initialization.
    - `gantt.config`: Stores computed objects and internal state.
- **Gotcha:** When checking the current view mode, always check `options.view_mode` (string, e.g., "Week") rather than `config.view_mode` (often an object).

### DOM Structure
- **Grid Header:** The `.grid-header` is an HTML `<div>` containing absolutely positioned text elements, NOT an SVG group. You cannot use SVG elements (like `<line>`) to decorate it; use HTML `<div>`s instead.
- **Month View:** The naming is counterintuitive:
    - `.upper-text`: Displays Years.
    - `.lower-text`: Displays Months.
- **Data Attributes:** The `data-id` attribute is on `.bar-wrapper`, not its child `.bar-group`. Use `wrapper.getAttribute('data-id')` directly.

### Rendering & Sizing
- **SVG Width Bug:** The library attempts to set `width="100%"`, which can break layout in some containers. Workaround: Explicitly set pixel width on the SVG element after rendering.
- **Partial Rendering:** Transitions from detailed views (Hour) to broad views can sometimes leave the SVG partially rendered. Force a dimension update to fix this.
- **Dynamic Height:** The library sets `.gantt-container` height via the `--gv-grid-height` CSS variable. Overriding this with `height: 100%` breaks vertical scrolling.

### CSS & Styling
- **Class Name Generation:** The library generates CSS class names from task properties (e.g., `.highlight-{task.id}`).
    - **Risk:** If a Task ID contains spaces or special characters (e.g., "Task 1", "v1.0", "54.8"), the generated selector will be invalid and crash the renderer.
    - **Fix:** Hex-encode IDs to be CSS-safe before passing them to the library.
- **Whitespace Sensitivity:** The `custom_class` property is added using `classList.add()`, which throws an error if the string contains spaces. Only pass single class names.
- **Hardcoded Colors:** Some elements like `.current-upper` (floating year) have hardcoded `background: #fff` in the library CSS, requiring `!important` overrides for dark mode.

## Interaction Quirks

### Popup (Tooltip) Positioning
- **Anchoring:** The library treats the mouse/click coordinates as anchors and attempts to re-center the popup vertically after rendering.
- **Override Strategy:** Do not modify the coordinates passed to `show_popup`. Instead, call the original method, then use `requestAnimationFrame` to manually adjust the `top` and `left` styles of the popup wrapper to your desired position.
- **Wrapper Object:** The `popup(task)` callback receives a wrapper object `{ task: Task, chart: Gantt }`, not just the Task object directly. Always check `task.task` to access properties.

### Scroll Handling
- **Broken maintain_scroll:** The library's `maintain_scroll` feature tries to preserve pixel positions across view modes, which is often meaningless.
- **Smooth Scroll Race:** Using `behavior: "smooth"` triggers a race condition if you try to read `scrollLeft` immediately after. Use `behavior: "instant"` for synchronous updates.

### Lifecycle
- **No Destroy:** The library does not have a `destroy()` method. Event listeners attached to the container persist even if the DOM is cleared. This can lead to memory leaks or zombie event handlers on re-renders.