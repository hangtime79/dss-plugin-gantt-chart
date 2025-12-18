(function() {
    'use strict';

    // ===== STATE =====
    let webAppConfig = dataiku.getWebAppConfig()['webAppConfig'];
    let ganttInstance = null;

    // ===== INITIALIZATION =====

    console.log('[Gantt Debug] Gantt Chart webapp initializing...');

    try {
        // Request config from parent frame
        console.log('[Gantt Debug] Sending "sendConfig" to parent...');
        window.parent.postMessage("sendConfig", "*");
    } catch (e) {
        console.error('[Gantt Debug] Failed to send postMessage:', e);
    }

    // Listen for config updates
    window.addEventListener('message', function(event) {
        console.log('[Gantt Debug] Received message event', {
            origin: event.origin,
            dataType: typeof event.data,
            data: event.data
        });

        if (event.data) {
            try {
                const eventData = JSON.parse(event.data);
                webAppConfig = eventData['webAppConfig'];
                const filters = eventData['filters'] || [];

                console.log('[Gantt Debug] Parsed config:', webAppConfig);
                console.log('[Gantt Debug] Parsed filters:', filters);

                // Validate required parameters
                console.log('[Gantt Debug] Validating config...');
                validateConfig(webAppConfig);
                console.log('[Gantt Debug] Config valid.');

                // Initialize chart
                initializeChart(webAppConfig, filters);

            } catch (error) {
                console.error('[Gantt Debug] Configuration processing error:', error);
                displayError('Configuration Error', error.message);
            }
        } else {
            console.warn('[Gantt Debug] Received empty message data');
        }
    });

    // ===== VALIDATION =====

    function validateConfig(config) {
        console.log('[Gantt Debug] inside validateConfig', config);
        const required = ['dataset', 'idColumn', 'startColumn', 'endColumn'];
        const missing = required.filter(param => !config[param]);

        if (missing.length > 0) {
            const msg = `Missing required parameters: ${missing.join(', ')}. Please configure all required columns.`;
            console.error('[Gantt Debug] Validation failed:', msg);
            throw new Error(msg);
        }
    }

    // ===== CHART INITIALIZATION =====

    function initializeChart(config, filters) {
        console.log('[Gantt Debug] initializeChart started');
        showLoading();

        // Check if Frappe Gantt library loaded
        if (typeof Gantt === 'undefined') {
            console.error('[Gantt Debug] Gantt library is undefined');
            hideLoading();
            displayError(
                'Library Error',
                'Frappe Gantt library failed to load. Please refresh the page.'
            );
            return;
        }

        console.log('[Gantt Debug] Fetching tasks and config...');
        // Fetch data and config in parallel
        Promise.all([
            fetchTasks(config, filters),
            fetchGanttConfig()
        ])
        .then(([tasksResponse, ganttConfig]) => {
            console.log('[Gantt Debug] Promises resolved. Tasks:', tasksResponse, 'Config:', ganttConfig);
            hideLoading();

            // Check for errors
            if (tasksResponse.error) {
                console.error('[Gantt Debug] Backend returned error:', tasksResponse.error);
                displayError(
                    tasksResponse.error.code,
                    tasksResponse.error.message,
                    tasksResponse.error.details
                );
                return;
            }

            // Check if we have tasks
            if (!tasksResponse.tasks || tasksResponse.tasks.length === 0) {
                console.warn('[Gantt Debug] No tasks returned');
                displayError(
                    'No Tasks',
                    'No valid tasks to display. Check your data and column selections.'
                );
                return;
            }

            // Display metadata if tasks were skipped
            if (tasksResponse.metadata && tasksResponse.metadata.skippedRows > 0) {
                displayMetadata(tasksResponse.metadata);
            }

            // Render Gantt chart
            renderGantt(tasksResponse.tasks, ganttConfig);

        })
        .catch(error => {
            console.error('[Gantt Debug] Promise.all failed:', error);
            hideLoading();
            displayError(
                'Failed to load chart',
                error.message || error,
                error
            );
        });
    }

    // ===== DATA FETCHING =====

    function fetchTasks(config, filters) {
        const params = {
            config: JSON.stringify(config),
            filters: JSON.stringify(filters)
        };

        console.log('[Gantt Debug] fetchTasks calling backend get-tasks with:', params);

        return dataiku.webappBackend.get('get-tasks', params)
            .then(response => {
                console.log('[Gantt Debug] get-tasks response received');
                return response;
            })
            .catch(error => {
                console.error('[Gantt Debug] get-tasks failed:', error);
                throw error;
            });
    }

    function fetchGanttConfig() {
        console.log('Fetching Gantt config');

        return dataiku.webappBackend.get('get-config', {})
            .then(response => {
                console.log('Config response:', response);
                return response;
            })
            .catch(error => {
                console.error('Error fetching config:', error);
                throw error;
            });
    }

    // ===== GANTT RENDERING =====

    function renderGantt(tasks, config) {
        console.log(`Rendering Gantt with ${tasks.length} tasks`);
        const container = document.getElementById('gantt-container');

        // Clear previous instance
        if (ganttInstance) {
            container.innerHTML = '';
            ganttInstance = null;
        }

        // Create SVG element for Gantt
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'gantt-svg';
        svg.style.width = '100%';
        svg.style.height = '100%';
        container.appendChild(svg);

        // Initialize Frappe Gantt
        try {
            ganttInstance = new Gantt('#gantt-svg', tasks, {
                // View settings
                view_mode: config.view_mode || 'Week',
                view_mode_select: config.view_mode_select !== false,

                // Appearance
                bar_height: config.bar_height || 30,
                bar_corner_radius: config.bar_corner_radius || 3,
                column_width: config.column_width || 45,
                padding: config.padding || 18,

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
                }
            });

            console.log(`Gantt chart rendered successfully with ${tasks.length} tasks`);

        } catch (error) {
            console.error('Error rendering Gantt:', error);
            displayError('Rendering Error', error.message, error);
        }
    }

    // ===== POPUP BUILDER =====

    function buildPopupHTML(task) {
        let html = `
            <div class="gantt-popup">
                <div class="popup-title">${escapeHtml(task.name)}</div>
        `;

        // Date range
        html += `<div class="popup-dates">${task.start} to ${task.end}</div>`;

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
