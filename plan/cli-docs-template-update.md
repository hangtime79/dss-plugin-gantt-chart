# CLI Docs Template Update - Plugin Webapp Standards

This document outlines architectural requirements and best practices for Dataiku plugin webapps that should be incorporated into the standard plugin template.

## 1. Backend Communication Helper (`dataiku.webappBackend`)

### Context
Standard Dataiku JS libraries (`standardWebAppLibraries: ["dataiku"]`) provide the core `dataiku` object, but they do **not** automatically provide the `dataiku.webappBackend` helper object for convenient AJAX/Fetch communication with the Python backend.

### Requirement
Every plugin webapp must include a helper file (conventionally named `dku-helpers.js`) to define this object before the main application script runs.

### Implementation (`resource/webapp/dku-helpers.js`)

```javascript
/*
 * Dataiku Webapp Helpers
 * Provides robust backend communication wrappers using Fetch API.
 */
(function() {
    'use strict';

    if (typeof dataiku === 'undefined') {
        console.error("Dataiku standard library not loaded. dku-helpers.js will fail.");
        return;
    }

    if (!dataiku.webappBackend) {
        dataiku.webappBackend = {
            getUrl: function(path) {
                return dataiku.getWebAppBackendUrl(path);
            },

            get: function(path, params) {
                let url = this.getUrl(path);
                
                // Append query parameters
                if (params && Object.keys(params).length > 0) {
                    const queryString = Object.keys(params).map(key => {
                        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
                    }).join('&');
                    url += (url.indexOf('?') === -1 ? '?' : '&') + queryString;
                }

                return fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => {
                    if (response.status == 502) {
                        throw new Error("Webapp backend is not running or not reachable (502).");
                    }
                    if (!response.ok) {
                        return response.text().then(text => {
                            let errorMsg = response.statusText;
                            try {
                                const json = JSON.parse(text);
                                if (json.error) errorMsg = json.error;
                            } catch(e) {}
                            throw new Error(`Backend Error (${response.status}): ${errorMsg}`);
                        });
                    }
                    return response.json();
                });
            }
        };
    }
})();
```

### Usage in `body.html`

The helper must be loaded **after** the frappe-gantt (or other libraries) but **before** your main `app.js`.

```html
<script src="/plugins/PLUGIN_ID/resource/webapp/dku-helpers.js"></script>
<script src="/plugins/PLUGIN_ID/resource/webapp/app.js"></script>
```

## 2. Robust Initialization Pattern

Webapps should attempt immediate initialization while also listening for the `message` event from the parent frame to ensure they receive configuration even if the initial synchronous call fails or the platform delays the message.

```javascript
// Inside app.js
try {
    const config = dataiku.getWebAppConfig()['webAppConfig'] || {};
    if (Object.keys(config).length > 0) {
        initialize(config);
    }
} catch (e) {
    console.warn("Sync config failed, waiting for message...");
}

window.addEventListener('message', function(event) {
    // ... parse and initialize ...
});
```
