/*
 * Dataiku Webapp Helpers
 * Provides robust backend communication wrappers.
 */

(function() {
    'use strict';

    if (typeof dataiku === 'undefined') {
        console.error("Dataiku standard library not loaded. dku-helpers.js will fail.");
        return;
    }

    if (!dataiku.webappBackend) {
        console.log("Initializing dataiku.webappBackend helper...");
        
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
