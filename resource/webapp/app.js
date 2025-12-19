(function() {
    'use strict';

    // ===== STATE =====
    let webAppConfig = {};
    let currentTasks = [];
    let currentGanttConfig = {};
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
        // 1. Try to initialize immediately with synchronous config
        if (webAppConfig && Object.keys(webAppConfig).length > 0) {
            console.log('Found synchronous config, initializing...', webAppConfig);
            try {
                validateConfig(webAppConfig);
                initializeChart(webAppConfig, []); 
            } catch (e) {
                console.warn('Initial config validation failed:', e);
            }
        }

        // 2. Request config from parent frame
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

        // Fetch data and config
        Promise.all([
            fetchTasks(config, filters),
            fetchGanttConfig()
        ])
        .then(([tasksResponse, ganttConfig]) => {
            hideLoading();

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

    function fetchGanttConfig() {
        return dataiku.webappBackend.get('get-config', {});
    }

    // ===== GANTT RENDERING =====

    function renderGantt(tasks, config) {
        console.log(`Rendering Gantt with ${tasks.length} tasks`);
        
        // Update state for resize handling
        currentTasks = tasks;
        currentGanttConfig = config;
        
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

        // Feature 4: Always Fit to Screen
        // Calculate dynamic column width based on viewport
        let columnWidth = config.column_width || 45; // This is now minColumnWidth
        try {
            const viewportWidth = container.clientWidth;
            const dateRange = calculateDateRange(tasks, config.view_mode);
            // Ensure we have at least 1 unit to divide by
            const timeUnits = Math.max(1, dateRange);
            
            // Calculate width to fill screen, respecting minimum
            const autoWidth = Math.floor(viewportWidth / timeUnits);
            columnWidth = Math.max(columnWidth, autoWidth);
            
            console.log(`Auto-fit: Viewport=${viewportWidth}px, Units=${timeUnits}, CalcWidth=${autoWidth}px, Final=${columnWidth}px`);
        } catch (e) {
            console.warn('Auto-fit calculation failed, using default:', e);
        }

        // Initialize Frappe Gantt
        try {
            ganttInstance = new Gantt('#gantt-svg', tasks, {
                // View settings
                view_mode: config.view_mode || 'Week',
                view_mode_select: config.view_mode_select !== false,

                // Appearance
                bar_height: config.bar_height || 30,
                bar_corner_radius: config.bar_corner_radius || 3,
                column_width: columnWidth,
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

        // Custom fields (Feature 2)
        if (task.custom_fields) {
            html += '<div class="popup-custom-fields">';
            for (const [key, value] of Object.entries(task.custom_fields)) {
                html += `<div class="custom-field"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}</div>`;
            }
            html += '</div>';
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
        hideLoading();
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

    function calculateDateRange(tasks, viewMode) {
        if (!tasks || tasks.length === 0) return 1;

        let minDate = new Date(tasks[0].start);
        let maxDate = new Date(tasks[0].end);

        tasks.forEach(task => {
            const start = new Date(task.start);
            const end = new Date(task.end);
            if (start < minDate) minDate = start;
            if (end > maxDate) maxDate = end;
        });

        // Add some buffer (e.g., 1 unit before and after)
        // Calculating duration in milliseconds
        const diffTime = Math.abs(maxDate - minDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        // Convert based on viewMode
        // Frappe Gantt column units:
        // Quarter Day, Half Day, Day -> 1 day per column approx (actually sub-day)
        // Week -> 1 week
        // Month -> 1 month
        // Year -> 1 year
        
        // Refined estimation based on Frappe Gantt logic
        switch (viewMode) {
            case 'Hour':
                return diffDays * 24;
            case 'Quarter Day':
                return diffDays * 4;
            case 'Half Day':
                return diffDays * 2;
            case 'Day':
                return diffDays;
            case 'Week':
                return diffDays / 7;
            case 'Month':
                return diffDays / 30;
            case 'Year':
                return diffDays / 365;
            default:
                return diffDays / 7; // Default to Week
        }
    }

    // ===== WINDOW RESIZE HANDLER =====

    let resizeTimeout;
    window.addEventListener('resize', function() {
        // Debounce resize
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (currentTasks.length > 0 && currentGanttConfig) {
                console.log('Window resized, re-rendering...');
                renderGantt(currentTasks, currentGanttConfig);
            }
        }, 200);
    });

    console.log('Gantt Chart webapp initialized');

})();
