# Dataiku Plugins - General Learnings

## Development Environment

### Code Loading
- **Committed Code Only:** Dataiku loads plugin code from the *committed* state in the Git repository, not the working directory. Changes must be committed to be visible in the DSS UI for testing.
- **The "Two app.js" Problem:** For `STANDARD` webapps, Dataiku automatically injects `webapps/<id>/app.js`. Do not manually include `<script src="app.js">` in `body.html`, or the code will run twice, causing race conditions (see v0.1.2 post-mortem).

### Webapp Architecture
- **Iframe Isolation:** Webapps run inside an iframe.
    - **Impact:** `document` refers to the iframe document. Queries targeting the parent window will fail or be blocked. Console logging should be done within the webapp's context.
- **HTML Fragments:** The `body.html` file is injected into a wrapper. It should **not** contain `<!DOCTYPE html>`, `<html>`, or `<body>` tags, as these will trigger "Quirks Mode" warnings or rendering issues.

## Communication

### Configuration Lifecycle
- **No Auto-Heartbeat:** Dataiku does not automatically push configuration updates to the webapp.
- **Polling/Events:** You must implement a mechanism (like `postMessage` or specific backend endpoints) to request and receive the current configuration, especially for initialization.
- **Init Race Condition:** `dataiku.getWebAppConfig()` is synchronous but often misses filter state on initial load. Always use the asynchronous `postMessage("sendConfig")` flow to ensure complete state (config + filters) is received.

## Assets & Resources

### Icons
- **Inline SVG:** Standard FontAwesome classes (e.g., `fas fa-*`) do not render correctly inside the webapp context due to missing CSS or font files.
- **Best Practice:** Use inline `<svg>` elements with `fill="currentColor"` to ensure icons render reliably and respect theme coloring.

### File Structure
- **Resource Folder:** Static assets (JS libraries, CSS) must be placed in the `resource/` folder to be accessible via the web server.
- **Clean Cleanup:** When moving files (e.g., from `resource/` to `webapps/`), immediately delete the old file. Duplicate files in the tree can confuse the loader or the developer (v0.2.1 post-mortem).