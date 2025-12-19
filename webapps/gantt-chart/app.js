(function() {
    'use strict';

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
    let taskDataMap = {}; // Store original task data by ID before Frappe mutates it

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

        // Retry mechanism for library loading
        let attempts = 0;
        const maxAttempts = 20; // 2 seconds approx
        
        function checkLibrary() {
            if (typeof Gantt !== 'undefined') {
                proceedWithInit();
            } else {
                attempts++;
                if (attempts < maxAttempts) {
                    console.log(`Waiting for Frappe Gantt library... (${attempts})`);
                    setTimeout(checkLibrary, 100);
                } else {
                    hideLoading();
                    displayError('Library Error', 'Frappe Gantt library failed to load after multiple attempts.');
                }
            }
        }

        checkLibrary();

        function proceedWithInit() {
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
        container.appendChild(svg);

        // Store original task data before Frappe mutates it
        taskDataMap = {};
        tasks.forEach(task => {
            taskDataMap[task.id] = {
                name: task.name,
                start: task.start,
                end: task.end,
                custom_fields: task.custom_fields || {}
            };
        });

        // Initialize Frappe Gantt
        try {
            const options = {
                // View settings
                view_mode: config.view_mode || 'Week',
                view_mode_select: config.view_mode_select !== false,

                // Appearance
                bar_height: config.bar_height || 30,
                bar_corner_radius: config.bar_corner_radius || 3,
                column_width: config.column_width || 45, // This is minColumnWidth
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
                    updateSvgDimensions();
                }
            };

            ganttInstance = new Gantt('#gantt-svg', tasks, options);

            // Auto-fit Logic: Scale column width to fill screen if content is smaller than viewport
            if (ganttInstance.dates && ganttInstance.dates.length > 0) {
                 const viewportWidth = container.clientWidth;
                 const minColumnWidth = config.column_width || 45;
                 const dateCount = ganttInstance.dates.length;
                 
                 // Calculate width to fit screen (subtracting padding)
                 const calculatedWidth = Math.floor((viewportWidth - 20) / dateCount);
                 const finalWidth = Math.max(minColumnWidth, calculatedWidth);
                 
                 if (finalWidth > minColumnWidth) {
                     console.log(`Auto-fitting: scaling column width from ${minColumnWidth} to ${finalWidth}px`);
                     ganttInstance.options.column_width = finalWidth;
                     ganttInstance.refresh(tasks); 
                 }
            }

            console.log(`Gantt chart rendered successfully with ${tasks.length} tasks`);
            
            // Force SVG to explicit pixel width for horizontal scrolling
            setTimeout(updateSvgDimensions, 200);

            // Setup date navigation
            setupDateNavigation();
            
            // Expose for debugging
            window.ganttInstance = ganttInstance;

        } catch (error) {
            console.error('Error rendering Gantt:', error);
            displayError('Rendering Error', error.message, error);
        }
    }

    function updateSvgDimensions() {
        const svg = document.getElementById('gantt-svg');
        const container = document.getElementById('gantt-container');
        
        if (svg && ganttInstance && ganttInstance.dates && ganttInstance.options) {
            const totalWidth = ganttInstance.dates.length * ganttInstance.options.column_width;
            
            // Frappe sets the height attribute based on rows. We must enforce it as style.
            const frappeHeight = svg.getAttribute('height'); 
            const totalHeight = frappeHeight ? parseInt(frappeHeight) : (svg.clientHeight || 600);

            // Force explicit pixel dimensions to trigger scrollbar
            svg.style.width = totalWidth + 'px';
            svg.setAttribute('width', totalWidth);
            
            if (frappeHeight) {
                svg.style.height = totalHeight + 'px';
            }
            
            // Log for debugging
            console.log(`[Dimensions] SVG: ${totalWidth}x${totalHeight}px, Container: ${container.clientWidth}x${container.clientHeight}px`);
            
            if (totalWidth > container.clientWidth) console.log('[Dimensions] Horizontal Scrollbar should be visible.');
            if (totalHeight > container.clientHeight) console.log('[Dimensions] Vertical Scrollbar should be visible.');
        }
    }

    // ===== DATE NAVIGATION =====

    function setupDateNavigation() {
        const gotoBtn = document.getElementById('goto-btn');
        const gotoDate = document.getElementById('goto-date');

        if (!gotoBtn || !gotoDate) {
            return;
        }

        // Set input date range based on chart data
        if (ganttInstance && ganttInstance.dates && ganttInstance.dates.length > 0) {
            const minDate = ganttInstance.dates[0];
            const maxDate = ganttInstance.dates[ganttInstance.dates.length - 1];
            gotoDate.min = formatDateToISO(minDate);
            gotoDate.max = formatDateToISO(maxDate);
        }

        gotoBtn.onclick = function() {
            const selectedDate = gotoDate.value;
            if (selectedDate) {
                scrollToDate(selectedDate);
            }
        };

        // Allow Enter key to trigger navigation
        gotoDate.onkeypress = function(e) {
            if (e.key === 'Enter') {
                gotoBtn.click();
            }
        };
    }

    function scrollToDate(dateStr) {
        if (!ganttInstance || !ganttInstance.dates) {
            console.error('Gantt instance or dates not available');
            return;
        }

        try {
            const targetDate = new Date(dateStr);
            targetDate.setHours(0, 0, 0, 0);

            if (isNaN(targetDate.getTime())) return;

            // Find closest date column index
            let closestIndex = 0;
            let minDiff = Math.abs(ganttInstance.dates[0] - targetDate);

            for (let i = 1; i < ganttInstance.dates.length; i++) {
                const diff = Math.abs(ganttInstance.dates[i] - targetDate);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            }

            // Calculate pixel offset
            const columnWidth = ganttInstance.options.column_width || 45;
            const scrollOffset = closestIndex * columnWidth;
            
            // Scroll container
            const container = document.getElementById('gantt-container');
            const centerOffset = Math.max(0, scrollOffset - (container.clientWidth / 2));
            
            console.log(`Scrolling to ${dateStr} (offset: ${centerOffset}px)`);
            
            container.scrollTo({
                left: centerOffset,
                behavior: 'smooth'
            });

        } catch (error) {
            console.error('Error scrolling to date:', error);
        }
    }

    // ===== POPUP BUILDER =====

    function buildPopupHTML(task) {
        // Get original data from storage
        const originalData = taskDataMap[task.id] || {};

        // Use stored values or Frappe's converted values
        const taskName = originalData.name || task.name || task.id || 'Untitled Task';
        const startDate = originalData.start || (task._start ? formatDateToISO(task._start) : 'N/A');
        const endDate = originalData.end || (task._end ? formatDateToISO(task._end) : 'N/A');
        const customFields = originalData.custom_fields || task.custom_fields || {};

        // Build subtitle with dates
        let subtitle = `${startDate} to ${endDate}`;

        // Build details with progress, dependencies, and custom fields
        let details = '';

        if (task.progress !== undefined && task.progress !== null) {
            details += `Progress: ${task.progress}%<br>`;
        }

        if (task.dependencies && task.dependencies.length > 0) {
            const depsList = Array.isArray(task.dependencies)
                ? task.dependencies.join(', ')
                : task.dependencies;
            if (depsList) {
                details += `Depends on: ${escapeHtml(depsList)}<br>`;
            }
        }

        // Add custom fields (sorted alphabetically)
        if (customFields && typeof customFields === 'object') {
            const sortedKeys = Object.keys(customFields).sort();
            if (sortedKeys.length > 0) {
                if (details) details += '<br>';
                for (const key of sortedKeys) {
                    const value = customFields[key];
                    details += `<strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}<br>`;
                }
            }
        }

        // Return simple HTML (Frappe Gantt will wrap it)
        return `
            <div class="popup-title">${escapeHtml(taskName)}</div>
            <div class="popup-subtitle">${subtitle}</div>
            <div class="popup-details">${details}</div>
        `;
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
        if (dataiku && dataiku.webappMessages) {
             dataiku.webappMessages.displayFatalError(`${title}: ${message}`);
        }

        // Also display in container
        const container = document.getElementById('gantt-container');
        if (container) {
            container.innerHTML = `
                <div class="error-container">
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">${escapeHtml(title)}</div>
                    <div class="error-message">${escapeHtml(message)}</div>
                </div>
            `;
        }
    }

    function displayMetadata(metadata) {
        console.log('Displaying metadata:', metadata);
        // Clean up existing banner
        const existing = document.querySelector('.metadata-banner');
        if (existing) existing.remove();

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
            if (banner && banner.parentNode) {
                banner.style.transition = 'opacity 0.5s';
                banner.style.opacity = '0';
                setTimeout(() => {
                    if (banner.parentNode) banner.remove();
                }, 500);
            }
        }, 10000);
    }

    function escapeHtml(text) {
        if (!text && text !== 0) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatDateToISO(date) {
        if (!date) return 'N/A';
        if (typeof date === 'string') return date;
        if (date instanceof Date) {
            return date.toISOString().split('T')[0];
        }
        return 'N/A';
    }

    // ===== WINDOW RESIZE HANDLER =====

    window.addEventListener('resize', function() {
        if (ganttInstance) {
            // Re-render or update dimensions? 
            // Frappe might handle some, but we need to enforce our Auto-Fit and SVG sizing
            // Simplest is to just update dimensions for now, but auto-fit might need re-calc.
            // Let's reload logic for simplicity or just update SVG
            updateSvgDimensions();
        }
    });

})();