# General Coding & Usage Learnings

## Architecture Patterns

### Separation of Concerns
- **Python for Validation:** All heavy data validation, transformation, and business logic should reside in the Python backend (`python-lib/`). The frontend should receive clean, ready-to-render data.
- **JS for Display:** The frontend (`app.js`) should focus purely on rendering logic, UI interactions, and visual overrides. Avoid complex data processing in the browser.

### Immutable Data
- **Transform, Don't Mutate:** When processing data (especially in `TaskTransformer`), always create new objects/lists rather than mutating inputs. This prevents side effects and makes debugging easier.

## JavaScript & DOM Techniques

### Monkey-Patching Strategy
When modifying 3rd-party library behavior without forking:
1.  **Store Original:** Save the original method: `const originalMethod = lib.prototype.method;`
2.  **Override:** Replace the method: `lib.prototype.method = function(args) { ... }`
3.  **Call Original:** Invoke the stored method within your override to preserve core functionality: `originalMethod.apply(this, arguments);`
4.  **Apply Fix:** Execute your custom logic before or after the original call as needed.
5.  **Timing:** Ensure patches are applied *before* the library instance is created.

### DOM Manipulation Timing
- **requestAnimationFrame:** Libraries often manipulate the DOM asynchronously or in batches. When applying post-render fixes (like adjusting SVG dimensions or label positions), wrap your logic in `requestAnimationFrame(() => { ... })` to ensure it runs after the browser has painted the library's changes.
- **Double rAF:** In some cases (like calculated styles depending on layout), a nested `requestAnimationFrame` (`rAF(() => rAF(() => { ... }))`) ensures the logic runs in the *next* frame, guaranteeing the layout is settled.

### CSS Variables
- **Theming:** Use CSS variables (e.g., `--gantt-popup-gap`) for layout values that might need to change based on themes (Light/Dark). This avoids hardcoding pixel values in JS and allows CSS-driven configuration.

## Workflow & Process

### Development Cycle
- **Incremental Development:** Implement ONE feature at a time and test. Massive commits with multiple features lead to unmanageable debugging sessions (see v0.1.0 post-mortem).
- **Spec-Driven Success:** Detailed specs with clear implementation plans significantly reduce churn (v0.3.0, v0.8.0). Jumping straight to coding often leads to rewrites (v0.9.2).
- **Commit Before QA:** For Dataiku plugins, code is loaded from the *committed* state in Git, not the working directory. Always commit before asking a user to test.

### Testing
- **Test What You Fix:** Every bugfix should include a regression test case that would have caught the original bug.
- **Console Testing:** Use browser console to validate hypotheses about data structures or event firing before writing code fixes.