(function () {
    'use strict';

    // ===== BACKEND HELPERS =====
    // Provides robust backend communication wrappers (formerly dku-helpers.js)
    if (typeof dataiku !== 'undefined' && !dataiku.webappBackend) {
        console.log("Initializing dataiku.webappBackend helper...");
        dataiku.webappBackend = {
            getUrl: function (path) {
                return dataiku.getWebAppBackendUrl(path);
            },
            get: function (path, params) {
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
                                } catch (e) { }
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
    let configDebounceTimer = null;  // Debounce timer for config updates
    let renderInProgress = false;    // Prevent overlapping renders
    const CONFIG_DEBOUNCE_MS = 300;  // 300ms debounce delay
    let currentTasks = [];           // Store tasks for expected progress markers

    // Zoom State
    let currentColumnWidth = 45;
    const ZOOM_STEP = 5;
    const MIN_ZOOM = 15;
    const MAX_ZOOM = 150;

    // ===== VIEW MODE PERSISTENCE =====

    // Valid view modes for validation (frappe-gantt modes)
    const VALID_VIEW_MODES = ['Hour', 'Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'];

    /**
     * Simple hash function for localStorage key generation.
     * Hashes dataset name to prevent information leakage in browser storage.
     * Uses djb2 algorithm - fast, deterministic, not reversible.
     */
    function hashString(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        }
        return (hash >>> 0).toString(16);
    }

    /**
     * Get localStorage key for view mode persistence.
     * Key is opaque (hashed) to protect dataset name privacy.
     */
    function getViewModeStorageKey(datasetName) {
        return `gantt-vm-${hashString(datasetName || 'default')}`;
    }

    /**
     * Load persisted view mode from localStorage.
     * Self-healing: removes invalid entries automatically.
     */
    function loadPersistedViewMode(datasetName) {
        try {
            const key = getViewModeStorageKey(datasetName);
            const saved = localStorage.getItem(key);
            if (!saved) return null;
            if (VALID_VIEW_MODES.includes(saved)) {
                return saved;
            }
            // Invalid - remove and return null (self-healing)
            localStorage.removeItem(key);
            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Save view mode to localStorage.
     */
    function saveViewMode(datasetName, viewMode) {
        try {
            const key = getViewModeStorageKey(datasetName);
            localStorage.setItem(key, viewMode);
        } catch (e) {
            console.warn('Failed to save view mode:', e);
        }
    }

    // ===== DATE BOUNDARY CONSTRAINTS =====
    // Monkey-patch Gantt.prototype.setup_gantt_dates to apply user-defined date boundaries
    // This must happen before any Gantt instance is created
    let originalSetupGanttDates = null;

    function applyDateBoundaryPatch() {
        if (typeof Gantt === 'undefined') return;
        if (originalSetupGanttDates) return; // Already patched

        originalSetupGanttDates = Gantt.prototype.setup_gantt_dates;

        Gantt.prototype.setup_gantt_dates = function (forceRecalc) {
            // Run original calculation first
            originalSetupGanttDates.apply(this, arguments);

            // Store calculated boundaries (before user constraints)
            const calculatedStart = new Date(this.gantt_start);
            const calculatedEnd = new Date(this.gantt_end);

            // Apply user constraints from webAppConfig
            // User dates can only NARROW the range, not EXPAND it
            if (webAppConfig.chartStartDate) {
                const userStart = new Date(webAppConfig.chartStartDate);
                if (!isNaN(userStart.getTime())) {
                    // Only apply if user start is AFTER calculated start (narrowing)
                    if (userStart > calculatedStart) {
                        this.gantt_start = userStart;
                        console.log('Applied fixed start date:', webAppConfig.chartStartDate);
                    } else {
                        console.warn('Start date', webAppConfig.chartStartDate,
                            'is before calculated start. Using calculated start to prevent expanding range.');
                    }
                } else {
                    console.warn('Invalid chartStartDate format:', webAppConfig.chartStartDate);
                }
            }

            if (webAppConfig.chartEndDate) {
                const userEnd = new Date(webAppConfig.chartEndDate);
                if (!isNaN(userEnd.getTime())) {
                    // Only apply if user end is BEFORE calculated end (narrowing)
                    if (userEnd < calculatedEnd) {
                        this.gantt_end = userEnd;
                        console.log('Applied fixed end date:', webAppConfig.chartEndDate);
                    } else {
                        console.warn('End date', webAppConfig.chartEndDate,
                            'is after calculated end. Using calculated end to prevent expanding range.');
                    }
                } else {
                    console.warn('Invalid chartEndDate format:', webAppConfig.chartEndDate);
                }
            }

            // Safety check: ensure start < end
            if (this.gantt_start >= this.gantt_end) {
                console.warn('Chart boundary error: Start >= End. Auto-adjusting end date.');
                this.gantt_end = new Date(this.gantt_start);
                this.gantt_end.setMonth(this.gantt_end.getMonth() + 1);
            }
        };

        console.log('Date boundary patch applied');
    }

    /**
     * Validate date boundaries before rendering.
     * Returns error message if invalid, null if valid.
     */
    function validateDateBoundaries() {
        const startDate = webAppConfig.chartStartDate;
        const endDate = webAppConfig.chartEndDate;

        // If both dates are set, validate start < end
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);

            if (isNaN(start.getTime())) {
                return 'Invalid Fixed Start Date format. Use YYYY-MM-DD.';
            }
            if (isNaN(end.getTime())) {
                return 'Invalid Fixed End Date format. Use YYYY-MM-DD.';
            }
            if (start >= end) {
                return 'Fixed Start Date cannot be on or after Fixed End Date.';
            }
        }

        return null; // Valid
    }

    // ===== HEADER LABEL ADJUSTMENT =====

    // Month name mappings for responsive formatting
    const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const MONTH_NAMES_3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const MONTH_NAMES_1 = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

    /**
     * Adjust header labels based on view mode and column width.
     * Implements responsive abbreviations:
     * - Week: >= 50 → "03 - 10", < 50 → "03"
     * - Month: >= 72 → "January", >= 39 → "Jan", < 39 → "J"
     * - Year: >= 34 → "2024", < 34 → "24"
     */
    function adjustHeaderLabels() {
        if (!ganttInstance) return;

        const columnWidth = ganttInstance.options?.column_width ?? 45;
        const viewMode = ganttInstance.options?.view_mode ?? 'Week';
        const container = document.querySelector('.gantt-container');

        if (!container) return;

        // Handle narrow view marker for CSS
        if (columnWidth < 30) {
            container.setAttribute('data-narrow-view', 'true');
        } else {
            container.removeAttribute('data-narrow-view');
        }

        // Apply view-mode specific formatting
        switch (viewMode) {
            case 'Week':
                formatWeekLabels(columnWidth);
                break;
            case 'Month':
                formatMonthLabels(columnWidth);
                break;
            case 'Year':
                formatYearLabels(columnWidth);
                break;
            default:
                // Hour, Quarter Day, Half Day, Day - no special formatting needed
                break;
        }

        // For very narrow views, hide every other lower-text label
        // EXCEPTION: Month view uses single-letter abbreviations which fit without skipping
        if (columnWidth < 30 && viewMode !== 'Month') {
            const lowerTexts = document.querySelectorAll('.lower-text');
            lowerTexts.forEach((text, i) => {
                text.style.visibility = (i % 2 === 0) ? 'visible' : 'hidden';
            });
        } else {
            const lowerTexts = document.querySelectorAll('.lower-text');
            lowerTexts.forEach(text => {
                text.style.visibility = 'visible';
            });
        }
    }

    /**
     * Format Week mode labels.
     * >= 50: "03 - 10" (day range, no months)
     * < 50: "03" (first day only)
     */
    function formatWeekLabels(columnWidth) {
        const lowerTexts = document.querySelectorAll('.lower-text');

        lowerTexts.forEach((text) => {
            const original = text.textContent.trim();
            // Frappe Gantt Week labels can be "11 Dec - 17" or "03 - 10" format

            if (columnWidth < 50) {
                // Extract just the first day number
                const match = original.match(/^(\d{1,2})/);
                if (match) {
                    text.textContent = match[1].padStart(2, '0');
                }
            } else {
                // >= 50: Show day range without month names ("11 - 17" not "11 Dec - 17")
                // Match patterns like "11 Dec - 17" or "28 Dec - 03" (cross-month)
                const rangeMatch = original.match(/^(\d{1,2})\s*[A-Za-z]*\s*-\s*(\d{1,2})/);
                if (rangeMatch) {
                    const startDay = rangeMatch[1].padStart(2, '0');
                    const endDay = rangeMatch[2].padStart(2, '0');
                    text.textContent = `${startDay} - ${endDay}`;
                }
            }
        });
    }

    /**
     * Format Month mode labels.
     * >= 75: Full month "January"
     * >= 39: 3-letter "Jan"
     * < 39: 1-letter "J"
     */
    function formatMonthLabels(columnWidth) {
        // In Month view: .upper-text = years, .lower-text = month names
        const lowerTexts = document.querySelectorAll('.lower-text');

        lowerTexts.forEach((text) => {
            const original = text.textContent.trim();

            // Try to find which month this represents
            let monthIndex = -1;

            // Check if it's a full month name
            for (let i = 0; i < MONTH_NAMES_FULL.length; i++) {
                if (original.toLowerCase().includes(MONTH_NAMES_FULL[i].toLowerCase())) {
                    monthIndex = i;
                    break;
                }
            }

            // If not found, check 3-letter abbreviations
            if (monthIndex === -1) {
                for (let i = 0; i < MONTH_NAMES_3.length; i++) {
                    if (original.toLowerCase().startsWith(MONTH_NAMES_3[i].toLowerCase())) {
                        monthIndex = i;
                        break;
                    }
                }
            }

            if (monthIndex === -1) return; // Not a month label

            // Apply formatting based on column width
            if (columnWidth >= 75) {
                text.textContent = MONTH_NAMES_FULL[monthIndex];
            } else if (columnWidth >= 39) {
                text.textContent = MONTH_NAMES_3[monthIndex];
            } else {
                text.textContent = MONTH_NAMES_1[monthIndex];
            }
        });
    }

    /**
     * Format Year mode labels.
     * >= 34: Full year "2024"
     * < 34: 2-digit "24"
     */
    function formatYearLabels(columnWidth) {
        const upperTexts = document.querySelectorAll('.upper-text');

        upperTexts.forEach(text => {
            const original = text.textContent.trim();

            // Match 4-digit year
            const yearMatch = original.match(/(\d{4})/);
            if (!yearMatch) return;

            const fullYear = yearMatch[1];

            if (columnWidth >= 34) {
                // Full year
                text.textContent = fullYear;
            } else {
                // 2-digit year
                text.textContent = fullYear.slice(-2);
            }
        });

        // Also format lower-text year labels if present
        const lowerTexts = document.querySelectorAll('.lower-text');
        lowerTexts.forEach(text => {
            const original = text.textContent.trim();
            const yearMatch = original.match(/(\d{4})/);
            if (!yearMatch) return;

            const fullYear = yearMatch[1];

            if (columnWidth < 34) {
                text.textContent = fullYear.slice(-2);
            }
        });
    }

    // ===== INITIALIZATION =====

    console.log('Gantt Chart webapp initializing...');

    try {
        // Request config from parent frame - this includes filter state
        // We deliberately do NOT render with synchronous config because it
        // lacks the current filter state. The parent frame response includes
        // both webAppConfig AND filters, ensuring filters are applied on first render.
        showLoading();
        window.parent.postMessage("sendConfig", "*");

        // Initialize Control Bar Events
        setupControls();
    } catch (e) {
        console.error('Initialization error:', e);
    }

    // Listen for config updates
    window.addEventListener('message', function (event) {
        if (event.data) {
            try {
                const eventData = JSON.parse(event.data);
                webAppConfig = eventData['webAppConfig'];
                const filters = eventData['filters'] || [];

                console.log('Received updated config:', webAppConfig);

                validateConfig(webAppConfig);

                // Validate date boundaries - block rendering if invalid
                const dateBoundaryError = validateDateBoundaries();
                if (dateBoundaryError) {
                    displayError('Date Boundary Error', dateBoundaryError);
                    return; // Don't render chart
                }

                // Debounce config updates to prevent excessive re-renders
                // when user is rapidly adjusting numeric inputs (spinners)
                if (configDebounceTimer) {
                    clearTimeout(configDebounceTimer);
                }
                configDebounceTimer = setTimeout(() => {
                    // Skip if a render is already in progress - just wait for next debounce
                    if (renderInProgress) {
                        console.log('Render in progress, skipping this update');
                        return;
                    }

                    // Save current view state before re-init
                    let savedViewMode = null;
                    let savedScrollLeft = 0;
                    let savedScrollTop = 0;

                    if (ganttInstance) {
                        savedViewMode = ganttInstance.options.view_mode;
                        const container = document.getElementById('gantt-container');
                        if (container) {
                            savedScrollLeft = container.scrollLeft;
                            savedScrollTop = container.scrollTop;
                        }
                        console.log('Saving view state:', { savedViewMode, savedScrollLeft, savedScrollTop });
                    }

                    // Store state to restore after render
                    window._ganttRestoreState = {
                        viewMode: savedViewMode,
                        scrollLeft: savedScrollLeft,
                        scrollTop: savedScrollTop
                    };

                    renderInProgress = true;
                    initializeChart(webAppConfig, filters);
                }, CONFIG_DEBOUNCE_MS);

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

                if (tasksResponse.error) {
                    displayError(tasksResponse.error.code, tasksResponse.error.message, tasksResponse.error.details);
                    return;
                }

                if (!tasksResponse.tasks || tasksResponse.tasks.length === 0) {
                    displayError('No Tasks', 'No valid tasks to display.');
                    return;
                }

                if (tasksResponse.metadata && (tasksResponse.metadata.skippedRows > 0 || tasksResponse.metadata.rowLimitHit)) {
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

    // Track the last width received from panel to detect explicit changes
    let lastConfiguredColumnWidth = null;

    /**
     * Build Gantt configuration from webapp config.
     *
     * Smartly handles Zoom persistence:
     * - If user changes 'columnWidth' in the panel, we reset to that value.
     * - If user changes OTHER settings, we preserve our local 'currentColumnWidth'.
     */
    function buildGanttConfig(webAppConfig) {
        // Load persisted view mode (localStorage, per-chart)
        const persistedViewMode = loadPersistedViewMode(webAppConfig.dataset);
        const effectiveViewMode = persistedViewMode || webAppConfig.viewMode || 'Week';

        // Detect if columnWidth setting changed in the panel
        const configWidth = parseInt(webAppConfig.columnWidth) || 45;

        if (lastConfiguredColumnWidth === null) {
            // First load
            lastConfiguredColumnWidth = configWidth;
            currentColumnWidth = configWidth;
        } else if (configWidth !== lastConfiguredColumnWidth) {
            // User explicitly changed setting -> Reset local zoom
            console.log('User changed Column Width setting. Resetting zoom.');
            lastConfiguredColumnWidth = configWidth;
            currentColumnWidth = configWidth;
        }
        // Else: configWidth is same, preserve 'currentColumnWidth' (manual zoom)

        const ganttConfig = {
            // View settings
            view_mode: effectiveViewMode,
            view_mode_select: webAppConfig.viewModeSelect !== false,

            // Appearance
            bar_height: parseInt(webAppConfig.barHeight) || 35,
            bar_corner_radius: parseInt(webAppConfig.barCornerRadius) || 3,
            column_width: currentColumnWidth, // Use our smart local width
            padding: parseInt(webAppConfig.padding) || 18,

            // Behavior (editing always disabled - no write-back in Dataiku)
            readonly: true,
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

        console.log('Built ganttConfig (Zoom Preserved):', JSON.stringify(ganttConfig, null, 2));
        return ganttConfig;
    }

    // ===== GANTT RENDERING =====

    function renderGantt(tasks, config) {
        console.log(`Rendering Gantt with ${tasks.length} tasks`);
        // console.log('Gantt config:', JSON.stringify(config, null, 2));

        // Store tasks for expected progress markers
        currentTasks = tasks;

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
            view_mode_select: false, // Custom control used

            // Appearance - use nullish coalescing to allow 0 values
            bar_height: config.bar_height ?? 30,
            bar_corner_radius: config.bar_corner_radius ?? 3,
            column_width: config.column_width ?? 45,
            padding: config.padding ?? 18,

            // Behavior (editing always disabled - no write-back in Dataiku)
            readonly: true,
            popup_on: config.popup_on || 'click',
            today_button: false,
            scroll_to: config.scroll_to || 'today',

            // Holidays (weekends)
            holidays: config.holidays || {},

            // Language
            language: config.language || 'en',

            // Custom popup content
            popup: function (task) {
                return buildPopupHTML(task);
            },

            // Event handlers
            on_click: function (task) {
                console.log('Task clicked:', task);
            },

            on_date_change: function (task, start, end) {
                console.log('Date changed:', task.id, start, end);
            },

            on_progress_change: function (task, progress) {
                console.log('Progress changed:', task.id, progress);
            },

            on_view_change: function (mode) {
                const viewModeName = typeof mode === 'string' ? mode : mode.name;
                console.log('View changed:', viewModeName);

                // Update our custom dropdown to match
                const viewModeSelect = document.getElementById('view-mode-select');
                if (viewModeSelect && viewModeSelect.value !== viewModeName) {
                    viewModeSelect.value = viewModeName;
                }

                // Persist view mode to localStorage
                saveViewMode(webAppConfig.dataset, viewModeName);

                // Re-enforce minimum bar widths and adjust labels after view mode change
                requestAnimationFrame(() => {
                    enforceMinimumBarWidths();
                    fixProgressBarRadius();
                    updateSvgDimensions();
                    adjustHeaderLabels();
                    setupStickyHeader();  // Re-setup after view change recreates DOM
                    addExpectedProgressMarkers();  // Re-add markers after DOM recreated
                    ensureEdgeToEdgeContent();  // Check edge-to-edge, zoom if needed (#21)
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

        // Apply date boundary patch before creating Gantt instance
        applyDateBoundaryPatch();

        // Initialize Frappe Gantt
        try {
            ganttInstance = new Gantt('#gantt-svg', tasks, ganttOptions);
            console.log(`Gantt chart created successfully with ${tasks.length} tasks`);

            // Debug: Log gantt instance date boundaries
            console.log('Gantt date debug:', {
                gantt_start: ganttInstance.gantt_start,
                gantt_end: ganttInstance.gantt_end,
                config_unit: ganttInstance.config?.unit,
                config_step: ganttInstance.config?.step,
                column_width: ganttInstance.config?.column_width,
                view_mode: ganttInstance.options?.view_mode
            });

            // Sync controls
            updateControlsState(ganttOptions);

            // Post-render adjustments
            requestAnimationFrame(() => {
                enforceMinimumBarWidths();
                fixProgressBarRadius();
                updateSvgDimensions();
                adjustHeaderLabels();
                setupStickyHeader();
                addExpectedProgressMarkers();
                ensureEdgeToEdgeContent();  // Zoom if needed to fill viewport (#21)

                // Restore view state if we have saved state from config update
                if (window._ganttRestoreState) {
                    const state = window._ganttRestoreState;
                    console.log('Restoring view state:', state);

                    // Restore view mode if different from current
                    if (state.viewMode && ganttInstance && state.viewMode !== ganttInstance.options.view_mode) {
                        ganttInstance.change_view_mode(state.viewMode);
                    }

                    // Restore scroll position
                    const container = document.getElementById('gantt-container');
                    if (container) {
                        container.scrollLeft = state.scrollLeft;
                        container.scrollTop = state.scrollTop;
                    }

                    // Clear the restore state
                    window._ganttRestoreState = null;
                }

                // Mark render as complete
                renderInProgress = false;
            });
        } catch (error) {
            console.error('Error rendering Gantt:', error);
            displayError('Rendering Error', error.message, error);
            renderInProgress = false;  // Reset on error too
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

    // ===== STICKY HEADER VIA JS SCROLL SYNC =====

    // Track scroll handler for cleanup
    let stickyScrollHandler = null;

    /**
     * Set up JavaScript-based sticky header behavior.
     * CSS position:sticky fails in nested scroll containers (Dataiku's iframe structure).
     * This manually syncs the header position during vertical scroll.
     *
     * IMPORTANT: Always fully re-initializes on every call.
     * Do NOT optimize by skipping based on element reference - Year view's
     * narrow content can corrupt sticky state without creating a new element.
     */
    function setupStickyHeader() {
        const container = document.getElementById('gantt-container');
        const header = document.querySelector('.gantt-container .grid-header');

        if (!container || !header) {
            console.warn('Sticky header setup failed: container or header not found');
            return;
        }

        // ALWAYS clean up previous state (fixes Year view state corruption)
        if (stickyScrollHandler) {
            container.removeEventListener('scroll', stickyScrollHandler);
            stickyScrollHandler = null;
        }

        // Reset transform to prevent stale state from previous view
        header.style.transform = '';

        // Apply base styles for JS-controlled sticky
        header.style.position = 'relative';
        header.style.zIndex = '1001';
        header.style.backgroundColor = '#ffffff';

        // Force header to span full container width (fixes jank when content is narrow)
        header.style.minWidth = container.offsetWidth + 'px';

        // Create scroll handler with GPU-accelerated 3D transform
        stickyScrollHandler = function () {
            header.style.transform = `translate3d(0, ${container.scrollTop}px, 0)`;
        };

        // Attach scroll listener
        container.addEventListener('scroll', stickyScrollHandler, { passive: true });

        // Apply initial position
        stickyScrollHandler();

        console.log('Sticky header initialized');
    }

    // ===== MINIMUM COLUMN WIDTH FOR EDGE-TO-EDGE CONTENT (Issue #21) =====

    // Minimum column width needed to fill viewport (calculated after render)
    let minColumnWidthForViewport = 0;

    // Guard to prevent re-render loop
    let edgeToEdgeInProgress = false;

    /**
     * Calculate and enforce minimum column width to fill viewport.
     * Fixes sticky header jank that occurs when SVG is narrower than container.
     *
     * Issue #21: When SVG doesn't fill container, browser paint/composite
     * behavior during scroll transform causes visual jank.
     */
    function ensureEdgeToEdgeContent() {
        if (!ganttInstance) return;
        if (edgeToEdgeInProgress) return;

        const container = document.getElementById('gantt-container');
        const svg = document.getElementById('gantt-svg');

        if (!container || !svg) return;

        const containerWidth = container.offsetWidth;
        const svgWidth = parseFloat(svg.getAttribute('width')) || 0;
        const currentColWidth = ganttInstance.options.column_width || 45;

        if (svgWidth <= 0 || containerWidth <= 0) return;

        // If SVG already fills viewport, just record current as minimum
        if (svgWidth >= containerWidth) {
            minColumnWidthForViewport = currentColWidth;
            console.log('Edge-to-edge: SVG fills viewport, min =', currentColWidth);
            return;
        }

        // Calculate minimum column width needed to fill viewport
        const neededColWidth = Math.ceil(currentColWidth * (containerWidth / svgWidth) * 1.02);
        minColumnWidthForViewport = neededColWidth;

        console.log('Edge-to-edge: Calculated minimum column width', {
            containerWidth,
            svgWidth,
            currentColWidth,
            minColumnWidthForViewport,
            allowRerender
        });

        // Apply if current is below minimum
        if (currentColWidth < minColumnWidthForViewport) {
            console.log('Edge-to-edge: Applying minimum', minColumnWidthForViewport);
            currentColumnWidth = minColumnWidthForViewport;
            ganttInstance.options.column_width = minColumnWidthForViewport;
            updateZoomIndicator();

            // Re-render with new width (guard prevents recursion)
            edgeToEdgeInProgress = true;
            ganttInstance.change_view_mode(ganttInstance.options.view_mode);
            // Clear guard after next frame (after re-render's callbacks complete)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    edgeToEdgeInProgress = false;
                });
            });
        }
    }

    // ===== EXPECTED PROGRESS MARKERS =====

    /**
     * Add expected progress markers to task bars.
     * Shows where progress *should* be based on current date vs task dates.
     * Only visible when showExpectedProgress is enabled in config.
     */
    function addExpectedProgressMarkers() {
        // Check if feature is enabled
        if (!webAppConfig.showExpectedProgress) {
            console.log('Expected progress markers: feature disabled');
            return;
        }

        if (!currentTasks || currentTasks.length === 0) {
            console.log('Expected progress markers: no tasks');
            return;
        }

        console.log('Adding expected progress markers for', currentTasks.length, 'tasks');
        console.log('Tasks with _expected_progress:', currentTasks.filter(t => t._expected_progress !== undefined).length);

        // Remove existing markers first (handles re-render/view change)
        document.querySelectorAll('.expected-progress-marker').forEach(m => m.remove());

        // Get all bar wrappers
        const barWrappers = document.querySelectorAll('.gantt .bar-wrapper');
        console.log('Found bar wrappers:', barWrappers.length);

        let markersAdded = 0;
        barWrappers.forEach((wrapper) => {
            // Get task ID from bar-wrapper's data-id attribute
            const taskId = wrapper.getAttribute('data-id');
            if (!taskId) {
                console.log('No taskId for wrapper');
                return;
            }

            const task = currentTasks.find(t => t.id === taskId);
            if (!task) {
                console.log('Task not found for id:', taskId);
                return;
            }
            if (task._expected_progress === undefined || task._expected_progress === null) {
                return;  // Expected - task not in progress
            }

            // Get the bar-group (child of bar-wrapper) and bar element
            const barGroup = wrapper.querySelector('.bar-group');
            const bar = wrapper.querySelector('.bar');
            if (!bar || !barGroup) return;

            // Get bar dimensions
            const barWidth = parseFloat(bar.getAttribute('width')) || 0;
            const barHeight = parseFloat(bar.getAttribute('height')) || 0;
            const barX = parseFloat(bar.getAttribute('x')) || 0;
            const barY = parseFloat(bar.getAttribute('y')) || 0;

            if (barWidth <= 0) return;

            // Calculate marker position
            const markerX = barX + (task._expected_progress / 100) * barWidth;

            // Debug: log positioning details
            console.log('Expected progress marker:', {
                taskName: task.name,
                expectedProgress: task._expected_progress,
                barX: barX,
                barWidth: barWidth,
                markerX: markerX,
                start: task.start,
                end: task.end
            });

            // Create SVG line for marker
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            marker.setAttribute('class', 'expected-progress-marker');
            marker.setAttribute('x1', markerX);
            marker.setAttribute('y1', barY);
            marker.setAttribute('x2', markerX);
            marker.setAttribute('y2', barY + barHeight);
            marker.setAttribute('stroke', '#e74c3c');
            marker.setAttribute('stroke-width', '2');
            marker.setAttribute('stroke-dasharray', '3,2');

            // Create small triangle indicator at top
            const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            triangle.setAttribute('class', 'expected-progress-marker');
            const triSize = 5;
            const triPoints = `${markerX - triSize},${barY - triSize} ${markerX + triSize},${barY - triSize} ${markerX},${barY}`;
            triangle.setAttribute('points', triPoints);
            triangle.setAttribute('fill', '#e74c3c');

            // Insert markers into the bar group
            barGroup.appendChild(marker);
            barGroup.appendChild(triangle);
            markersAdded++;
        });

        console.log('Expected progress markers added:', markersAdded);
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

    /**
     * Fix progress bar to fit within task bar bounds (#28).
     *
     * Problem: With large corner radii, the scaled progress bar bleeds outside
     * the task bar's rounded corners. scaleY(0.6) only affects height, not the
     * corner geometry relative to the task bar's curve.
     *
     * Solution: Use SVG clipPath to clip each progress bar to its task bar shape.
     */
    function fixProgressBarRadius() {
        if (!ganttInstance) return;

        const svg = document.querySelector('.gantt');
        if (!svg) return;

        // Ensure we have a defs element for clipPaths
        // Use id instead of class (classList doesn't work reliably on SVG elements)
        const defsId = 'gantt-progress-clips';
        let defs = document.getElementById(defsId);
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defs.setAttribute('id', defsId);
            svg.insertBefore(defs, svg.firstChild);
            console.log('Created defs element for progress bar clips');
        } else {
            // Clear old clipPaths on re-render
            defs.innerHTML = '';
        }

        const barWrappers = document.querySelectorAll('.gantt .bar-wrapper');
        console.log(`Fixing progress bar radius for ${barWrappers.length} bars`);

        barWrappers.forEach((wrapper, index) => {
            const taskBar = wrapper.querySelector('.bar');
            const progressBar = wrapper.querySelector('.bar-progress');

            if (!taskBar || !progressBar) return;

            // Create a clipPath using the task bar's shape
            const clipId = `progress-clip-${index}`;
            const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
            clipPath.setAttribute('id', clipId);

            // ClipPath matches task bar shape (including rounded corners)
            const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            clipRect.setAttribute('x', taskBar.getAttribute('x'));
            clipRect.setAttribute('y', taskBar.getAttribute('y'));
            clipRect.setAttribute('width', taskBar.getAttribute('width'));
            clipRect.setAttribute('height', taskBar.getAttribute('height'));
            clipRect.setAttribute('rx', taskBar.getAttribute('rx'));
            clipRect.setAttribute('ry', taskBar.getAttribute('ry'));

            clipPath.appendChild(clipRect);
            defs.appendChild(clipPath);

            // Apply clipPath to progress bar
            progressBar.setAttribute('clip-path', `url(#${clipId})`);

            // Reset progress bar to sharp corners - clipPath handles the shaping
            progressBar.setAttribute('rx', 0);
            progressBar.setAttribute('ry', 0);

            // Extend progress bar beyond task bar bounds to fill corner pixels
            // The clipPath will clip it to the correct shape
            const cornerRadius = parseFloat(taskBar.getAttribute('rx')) || 0;
            const originalX = parseFloat(progressBar.getAttribute('x')) || 0;
            const originalWidth = parseFloat(progressBar.getAttribute('width')) || 0;

            if (cornerRadius > 0 && originalWidth > 0) {
                // Extend left by corner radius
                progressBar.setAttribute('x', originalX - cornerRadius);
                // Extend width to cover both left extension and right corner
                progressBar.setAttribute('width', originalWidth + cornerRadius * 2);
            }
        });

        console.log(`Created ${defs.children.length} clipPath definitions`);
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

        // Dependencies (if any) - use display version for human-readable values
        const displayDeps = task._display_dependencies || (
            Array.isArray(task.dependencies) ? task.dependencies.join(', ') : task.dependencies
        );
        if (displayDeps) {
            html += `<div class="popup-deps">Depends on: ${escapeHtml(displayDeps)}</div>`;
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
                <div class="error-icon"><i class="icon-warning-sign"></i></div>
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
        `;

        // Show row limit message if limit was hit
        if (metadata.rowLimitHit) {
            html += `Showing first ${metadata.rowLimit} tasks (dataset limit reached). Increase Max Tasks to see more.`;
        } else {
            html += `Showing ${metadata.displayedRows} of ${metadata.totalRows} tasks`;
        }

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

    window.addEventListener('resize', function () {
        if (ganttInstance) {
            // Frappe Gantt handles resize automatically via SVG
            console.log('Window resized');
        }
    });

    // ===== CONTROLS =====

    function setupControls() {
        const viewModeSelect = document.getElementById('view-mode-select');
        const zoomInBtn = document.getElementById('btn-zoom-in');
        const zoomOutBtn = document.getElementById('btn-zoom-out');
        const todayBtn = document.getElementById('btn-today');

        if (viewModeSelect) {
            viewModeSelect.addEventListener('change', (e) => {
                const mode = e.target.value;
                if (ganttInstance) {
                    ganttInstance.change_view_mode(mode);
                }
            });
        }

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => adjustZoom(ZOOM_STEP));
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => adjustZoom(-ZOOM_STEP));
        }

        // Init indicator
        updateZoomIndicator();

        if (todayBtn) {
            todayBtn.addEventListener('click', () => {
                if (ganttInstance) {
                    const currentMode = ganttInstance.options.view_mode;
                    ganttInstance.change_view_mode(currentMode); // Triggers re-center on today
                }
            });
        }
    }

    function adjustZoom(delta) {
        if (!ganttInstance) return;

        let newWidth = currentColumnWidth + delta;
        if (newWidth < MIN_ZOOM) newWidth = MIN_ZOOM;
        if (newWidth > MAX_ZOOM) newWidth = MAX_ZOOM;

        if (newWidth === currentColumnWidth) return;

        currentColumnWidth = newWidth;
        ganttInstance.options.column_width = currentColumnWidth;

        // Force refresh
        ganttInstance.change_view_mode(ganttInstance.options.view_mode);
        updateZoomIndicator();
        console.log('Zoom adjusted to:', currentColumnWidth);
    }

    function updateZoomIndicator() {
        const indicator = document.getElementById('zoom-level-indicator');
        if (indicator) {
            // Base is 45px (100%)
            const pct = Math.round((currentColumnWidth / 45) * 100);
            indicator.textContent = `${pct}%`;
        }
    }

    function updateControlsState(config) {
        const viewModeSelect = document.getElementById('view-mode-select');
        if (viewModeSelect && config.view_mode) {
            viewModeSelect.value = config.view_mode;
            if (viewModeSelect.value !== config.view_mode) {
                viewModeSelect.value = 'Week';
            }
        }
        if (config.column_width) {
            currentColumnWidth = config.column_width;
        }
    }

    console.log('Gantt Chart webapp initialized');

})();
