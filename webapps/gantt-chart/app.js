(function() {
    'use strict';

    // ===== BACKEND HELPERS =====
    // Provides robust backend communication wrappers (formerly dku-helpers.js)
    if (typeof dataiku !== 'undefined' && !dataiku.webappBackend) {
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

    // ===== STATE =====
    let webAppConfig = {};
    try {
        if (typeof dataiku !== 'undefined' && dataiku.getWebAppConfig) {
            webAppConfig = dataiku.getWebAppConfig()['webAppConfig'] || {};
        }
    } catch (e) {
        console.warn('Initial dataiku.getWebAppConfig failed:', e);
    }
    let ganttInstance = null;

    // ===== INITIALIZATION =====

    console.log('Gantt Chart webapp initializing...');

    try {
        // Request config from parent frame - this includes filter state
        // We deliberately do NOT render with synchronous config because it
        // lacks the current filter state. The parent frame response includes
        // both webAppConfig AND filters, ensuring filters are applied on first render.
        showLoading();
        window.parent.postMessage("sendConfig", "*");
    } catch (e) {
        console.error('Initialization error:', e);
    }

    // Listen for config updates
    window.addEventListener('message', function(event) {
        if (event.data) {
            try {
                const eventData = JSON.parse(event.data);
                webAppConfig = eventData['webAppConfig'];
                const filters = eventData['filters'] || [];

                console.log('Received updated config:', webAppConfig);

                validateConfig(webAppConfig);
                initializeChart(webAppConfig, filters);

            } catch (error) {
                console.error('Configuration processing error:', error);
                displayError('Configuration Error', error.message);
            }
        }
    });

    // ===== VALIDATION =====

    function validateConfig(config) {
        const required = ['dataset', 'idColumn', 'startColumn', 'endColumn'];
        const missing = required.filter(param => !config[param]);

        if (missing.length > 0) {
            throw new Error(`Missing required parameters: ${missing.join(', ')}. Please configure all required columns.`);
        }
    }

    // ===== CHART INITIALIZATION =====

    function initializeChart(config, filters) {
        showLoading();

        if (typeof Gantt === 'undefined') {
            hideLoading();
            displayError('Library Error', 'Frappe Gantt library failed to load.');
            return;
        }

        // Build gantt config directly from webAppConfig (not from backend)
        // This ensures we use the current config, not stale backend state
        const ganttConfig = buildGanttConfig(config);

        // Fetch task data from backend
        fetchTasks(config, filters)
        .then(tasksResponse => {
            hideLoading();

            // DEBUG: Check what backend returned
            console.log('=== BACKEND RESPONSE DEBUG ===');
            console.log('Total tasks received:', tasksResponse.tasks?.length);
            if (tasksResponse.tasks) {
                tasksResponse.tasks.forEach(task => {
                    if (task.dependencies) {
                        console.log(`Backend task ${task.id} dependencies:`, task.dependencies, `(type: ${typeof task.dependencies}, isArray: ${Array.isArray(task.dependencies)})`);
                    }
                });
            }
            console.log('=== END BACKEND DEBUG ===');

            if (tasksResponse.error) {
                displayError(tasksResponse.error.code, tasksResponse.error.message, tasksResponse.error.details);
                return;
            }

            if (!tasksResponse.tasks || tasksResponse.tasks.length === 0) {
                displayError('No Tasks', 'No valid tasks to display.');
                return;
            }

            if (tasksResponse.metadata && tasksResponse.metadata.skippedRows > 0) {
                displayMetadata(tasksResponse.metadata);
            }

            renderGantt(tasksResponse.tasks, ganttConfig);
        })
        .catch(error => {
            console.error('Chart load failed:', error);
            hideLoading();
            displayError('Failed to load chart', error.message || error);
        });
    }

    // ===== DATA FETCHING =====

    function fetchTasks(config, filters) {
        const params = {
            config: JSON.stringify(config),
            filters: JSON.stringify(filters)
        };
        return dataiku.webappBackend.get('get-tasks', params);
    }

    // ===== CONFIG BUILDING =====

    /**
     * Build Gantt configuration from webapp config.
     *
     * This derives Frappe Gantt options directly from the webAppConfig
     * received via the message event, eliminating the need for a separate
     * backend call which could return stale data.
     */
    function buildGanttConfig(webAppConfig) {
        const ganttConfig = {
            // View settings
            view_mode: webAppConfig.viewMode || 'Week',
            view_mode_select: webAppConfig.viewModeSelect !== false,

            // Appearance - parseInt with fallback for safety
            bar_height: parseInt(webAppConfig.barHeight) || 30,
            bar_corner_radius: parseInt(webAppConfig.barCornerRadius) || 3,
            column_width: parseInt(webAppConfig.columnWidth) || 45,
            padding: parseInt(webAppConfig.padding) || 18,

            // Behavior
            readonly: webAppConfig.readonly !== false,
            popup_on: webAppConfig.popupOn || 'click',
            today_button: webAppConfig.todayButton !== false,
            scroll_to: webAppConfig.scrollTo || 'today',

            // Language
            language: 'en'
        };

        // Handle weekend highlighting
        if (webAppConfig.highlightWeekends !== false) {
            ganttConfig.holidays = {
                'var(--g-weekend-highlight-color)': 'weekend'
            };
        }

        console.log('Built ganttConfig from webAppConfig:', JSON.stringify(ganttConfig, null, 2));
        return ganttConfig;
    }

    // ===== GANTT RENDERING =====

    function renderGantt(tasks, config) {
        console.log(`Rendering Gantt with ${tasks.length} tasks`);
        console.log('Gantt config:', JSON.stringify(config, null, 2));

        const container = document.getElementById('gantt-container');

        // Always clear and recreate - simpler and more reliable
        container.innerHTML = '';
        ganttInstance = null;

        // Create SVG element for Gantt
        // Note: Do NOT set style.width - let Frappe Gantt control the SVG width
        // Setting width:100% would override the calculated timeline width
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'gantt-svg';
        container.appendChild(svg);

        // Build options object
        const ganttOptions = {
            // View settings
            view_mode: config.view_mode ?? 'Week',
            view_mode_select: config.view_mode_select !== false,

            // Appearance - use nullish coalescing to allow 0 values
            bar_height: config.bar_height ?? 30,
            bar_corner_radius: config.bar_corner_radius ?? 3,
            column_width: config.column_width ?? 45,
            padding: config.padding ?? 18,

            // Behavior
            readonly: config.readonly !== false,
            popup_on: config.popup_on || 'click',
            today_button: config.today_button !== false,
            scroll_to: config.scroll_to || 'today',

            // Holidays (weekends)
            holidays: config.holidays || {},

            // Language
            language: config.language || 'en',

            // Custom popup content
            popup: function(task) {
                return buildPopupHTML(task);
            },

            // Event handlers
            on_click: function(task) {
                console.log('Task clicked:', task);
            },

            on_date_change: function(task, start, end) {
                console.log('Date changed:', task.id, start, end);
            },

            on_progress_change: function(task, progress) {
                console.log('Progress changed:', task.id, progress);
            },

            on_view_change: function(mode) {
                console.log('View changed:', mode);
                // Re-enforce minimum bar widths after view mode change
                requestAnimationFrame(() => {
                    enforceMinimumBarWidths();
                    updateSvgDimensions();
                });
            }
        };

        console.log('Gantt options:', JSON.stringify({
            view_mode: ganttOptions.view_mode,
            bar_height: ganttOptions.bar_height,
            bar_corner_radius: ganttOptions.bar_corner_radius,
            column_width: ganttOptions.column_width,
            padding: ganttOptions.padding
        }, null, 2));

        // Initialize Frappe Gantt
        try {
            // DEBUG: Log tasks with dependencies
            console.log('=== DEPENDENCY DEBUG ===');
            tasks.forEach(task => {
                if (task.dependencies && task.dependencies.length > 0) {
                    console.log(`Task ${task.id} has dependencies:`, task.dependencies, `(type: ${typeof task.dependencies})`);
                }
            });
            console.log('=== END DEBUG ===');

            ganttInstance = new Gantt('#gantt-svg', tasks, ganttOptions);
            console.log(`Gantt chart created successfully with ${tasks.length} tasks`);

            // Enforce minimum bar widths after render completes
            requestAnimationFrame(() => {
                enforceMinimumBarWidths();
                updateSvgDimensions();
            });
        } catch (error) {
            console.error('Error rendering Gantt:', error);
            displayError('Rendering Error', error.message, error);
        }
    }

    // ===== SVG DIMENSION HELPER =====

    /**
     * Explicitly set SVG styles from attributes to force container scrolling.
     * Frappe Gantt calculates dimensions but sometimes only sets attributes,
     * which might not trigger the CSS overflow behavior in all browsers/contexts.
     */
    function updateSvgDimensions() {
        const svg = document.getElementById('gantt-svg');
        if (!svg) return;

        // Frappe Gantt sets these attributes based on content
        const heightAttr = svg.getAttribute('height');
        const widthAttr = svg.getAttribute('width');

        if (heightAttr) {
            // If it's a number (pixels), append 'px'. If %, keep as is.
            svg.style.height = heightAttr + (String(heightAttr).endsWith('%') ? '' : 'px');
        }
        if (widthAttr) {
            svg.style.width = widthAttr + (String(widthAttr).endsWith('%') ? '' : 'px');
        }
        
        console.log(`Updated SVG dimensions: width=${svg.style.width}, height=${svg.style.height}`);
    }

    // ===== BAR WIDTH ENFORCEMENT =====

    /**
     * Enforce minimum bar widths to ensure tasks are always visible.
     * This fixes the issue where tasks with short durations (especially same-day tasks)
     * become invisible at finer time granularities (Day, Half-Day, Hour views).
     */
    function enforceMinimumBarWidths() {
        if (!ganttInstance) return;

        // Minimum width is 1/4 of column width (ensures clickable/visible bars)
        const columnWidth = ganttInstance.config?.column_width ?? 45;
        const minWidth = Math.max(columnWidth / 4, 10); // At least 10px

        const bars = document.querySelectorAll('.gantt .bar');
        bars.forEach(bar => {
            const currentWidth = parseFloat(bar.getAttribute('width')) || 0;
            if (currentWidth < minWidth) {
                bar.setAttribute('width', minWidth);
                // Also mark short tasks for potential styling
                const wrapper = bar.closest('.bar-wrapper');
                if (wrapper) {
                    wrapper.setAttribute('data-short-task', 'true');
                }
            }
        });

        // Also enforce on progress bars
        const progressBars = document.querySelectorAll('.gantt .bar-progress');
        progressBars.forEach(bar => {
            const parentBar = bar.parentElement?.querySelector('.bar');
            if (parentBar) {
                const parentWidth = parseFloat(parentBar.getAttribute('width')) || 0;
                const progressWidth = parseFloat(bar.getAttribute('width')) || 0;
                // Progress bar should not exceed parent bar width
                if (progressWidth > parentWidth) {
                    bar.setAttribute('width', parentWidth);
                }
            }
        });
    }

    // ===== POPUP BUILDER =====

    function buildPopupHTML(task) {
        console.log('Popup task object:', task);
        
        // Handle wrapper object (some versions of Frappe Gantt pass {task: ..., chart: ...})
        if (task && task.task) {
            task = task.task;
        }

        let html = `
            <div class="gantt-popup">
                <div class="popup-title">${escapeHtml(task.name)}</div>
        `;

        // Date range - Frappe Gantt uses _start and _end internally
        // These are Date objects, need to format them
        const formatDate = (date) => {
            if (!date) return 'N/A';
            if (date instanceof Date) {
                return date.toISOString().split('T')[0];
            }
            return String(date);
        };

        // Try _start/_end first (Frappe Gantt internal), fallback to start/end
        const startDate = task._start || task.start;
        const endDate = task._end || task.end;
        html += `<div class="popup-dates">${formatDate(startDate)} to ${formatDate(endDate)}</div>`;

        // Progress (if available)
        if (task.progress !== undefined && task.progress !== null) {
            html += `<div class="popup-progress">Progress: ${task.progress}%</div>`;
        }

        // Dependencies (if any)
        if (task.dependencies) {
            const depsList = Array.isArray(task.dependencies)
                ? task.dependencies.join(', ')
                : task.dependencies;
            if (depsList) {
                html += `<div class="popup-deps">Depends on: ${escapeHtml(depsList)}</div>`;
            }
        }

        // Custom fields (user-selected tooltip columns)
        if (task.custom_fields && Array.isArray(task.custom_fields) && task.custom_fields.length > 0) {
            html += '<div class="popup-custom-fields">';
            for (const field of task.custom_fields) {
                // Handle null/undefined values gracefully
                const displayValue = (field.value === null || field.value === undefined)
                    ? '-'
                    : escapeHtml(String(field.value));
                html += `<div class="popup-field"><span class="field-label">${escapeHtml(field.label)}:</span> <span class="field-value">${displayValue}</span></div>`;
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // ===== UI HELPERS =====

    function showLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.remove('hide');
        }
    }

    function hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.classList.add('hide');
        }
    }

    function displayError(title, message, details) {
        console.error('Error:', title, message, details);

        // Use Dataiku's error display
        const errorMsg = `${title}: ${message}`;
        dataiku.webappMessages.displayFatalError(errorMsg);

        // Also display in container
        const container = document.getElementById('gantt-container');
        container.innerHTML = `
            <div class="error-container">
                <div class="error-icon">⚠️</div>
                <div class="error-title">${escapeHtml(title)}</div>
                <div class="error-message">${escapeHtml(message)}</div>
            </div>
        `;
    }

    function displayMetadata(metadata) {
        console.log('Displaying metadata:', metadata);

        // Create metadata banner
        const banner = document.createElement('div');
        banner.className = 'metadata-banner warning';

        let html = `
            <span class="close-btn" onclick="this.parentElement.remove()">×</span>
            <strong>Notice:</strong><br>
            Showing ${metadata.displayedRows} of ${metadata.totalRows} tasks
        `;

        if (metadata.skippedRows > 0) {
            html += ` (${metadata.skippedRows} skipped)`;

            // Add skip reasons if available
            if (metadata.skipReasons && Object.keys(metadata.skipReasons).length > 0) {
                html += '<br><small>';
                const reasons = [];
                for (const [reason, count] of Object.entries(metadata.skipReasons)) {
                    reasons.push(`${count} ${reason.replace(/_/g, ' ')}`);
                }
                html += reasons.join(', ');
                html += '</small>';
            }
        }

        // Add warnings if any
        if (metadata.warnings && metadata.warnings.length > 0) {
            html += '<br><small>';
            html += metadata.warnings.slice(0, 3).map(w => `⚠ ${w}`).join('<br>');
            if (metadata.warnings.length > 3) {
                html += `<br>...and ${metadata.warnings.length - 3} more warnings`;
            }
            html += '</small>';
        }

        banner.innerHTML = html;
        document.body.appendChild(banner);

        // Auto-hide after 10 seconds
        setTimeout(() => {
            banner.style.transition = 'opacity 0.5s';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 500);
        }, 10000);
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    // ===== WINDOW RESIZE HANDLER =====

    window.addEventListener('resize', function() {
        if (ganttInstance) {
            // Frappe Gantt handles resize automatically via SVG
            console.log('Window resized');
        }
    });

    console.log('Gantt Chart webapp initialized');

})();
