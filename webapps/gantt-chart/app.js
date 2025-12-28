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
    const ZOOM_STEP = 5;            // Increment size in pixels
    const ABSOLUTE_FLOOR = 25;      // Never render columns below this width
    const COLUMN_WIDTH_BASELINE = 75; // 100% zoom reference point

    // Zoom stops that MUST be passed through (column widths in pixels)
    // 25% = 19px, 50% = 38px, 75% = 56px, 100% = 75px, 150% = 113px, 200% = 150px
    const ZOOM_STOPS = [19, 38, 56, 75, 113, 150];

    // ===== VIEW MODE PERSISTENCE =====

    // Valid view modes for validation (frappe-gantt modes)
    const VALID_VIEW_MODES = ['Hour', 'Quarter Day', 'Half Day', 'Day', 'Week', 'Month', 'Year'];

    // Per-view zoom state: user's preferred column width for each view mode
    let columnWidthByViewMode = {
        'Hour': COLUMN_WIDTH_BASELINE,
        'Quarter Day': COLUMN_WIDTH_BASELINE,
        'Half Day': COLUMN_WIDTH_BASELINE,
        'Day': COLUMN_WIDTH_BASELINE,
        'Week': COLUMN_WIDTH_BASELINE,
        'Month': COLUMN_WIDTH_BASELINE,
        'Year': COLUMN_WIDTH_BASELINE
    };

    // Per-view floor: minimum column width to fill viewport (calculated after render)
    let minColumnWidthByViewMode = {
        'Hour': ABSOLUTE_FLOOR,
        'Quarter Day': ABSOLUTE_FLOOR,
        'Half Day': ABSOLUTE_FLOOR,
        'Day': ABSOLUTE_FLOOR,
        'Week': ABSOLUTE_FLOOR,
        'Month': ABSOLUTE_FLOOR,
        'Year': ABSOLUTE_FLOOR
    };

    // Track current view mode for zoom operations
    let currentViewMode = 'Week';

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

        // Ensure year is visible in upper headers (#12)
        ensureYearInUpperHeaders(viewMode);

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
     * Format Year mode labels (#14).
     * Upper headers: Show decade format (2020s, 2030s)
     * Lower headers: Show individual years, responsive abbreviation
     */
    function formatYearLabels(columnWidth) {
        const upperTexts = document.querySelectorAll('.upper-text');
        const lowerTexts = document.querySelectorAll('.lower-text');

        // Track which decades we've seen to show label only once per decade
        const seenDecades = new Set();

        // Process upper-text: Convert to decade format (#14)
        upperTexts.forEach(text => {
            const original = text.textContent.trim();

            // Match 4-digit year
            const yearMatch = original.match(/(\d{4})/);
            if (!yearMatch) return;

            // Store original text for scroll handler matching
            text.setAttribute('data-original-text', original);

            const year = parseInt(yearMatch[1]);
            const decade = Math.floor(year / 10) * 10;

            if (!seenDecades.has(decade)) {
                // First occurrence of this decade - show decade label
                seenDecades.add(decade);
                text.textContent = `${decade}s`;
            } else {
                // Subsequent years in same decade - hide label to avoid clutter
                text.textContent = '';
            }
        });

        // Ensure scroll tracking works after we modified text
        fixCurrentUpperScrollTracking();

        // Process lower-text: Show individual years with responsive abbreviation
        lowerTexts.forEach(text => {
            const original = text.textContent.trim();
            const yearMatch = original.match(/(\d{4})/);
            if (!yearMatch) return;

            const fullYear = yearMatch[1];

            if (columnWidth < 34) {
                // 2-digit year for narrow columns
                text.textContent = fullYear.slice(-2);
            } else {
                // Full year
                text.textContent = fullYear;
            }
        });
    }

    /**
     * Ensure year is visible in upper headers across all view modes (#12).
     * Frappe Gantt may show only month names in upper-text for Day/Week views
     * when all visible dates are in the same year. This adds year context.
     * Uses abbreviated format at narrow column widths for better fit.
     */
    function ensureYearInUpperHeaders(viewMode) {
        const upperTexts = document.querySelectorAll('.upper-text');
        if (!upperTexts.length) return;

        // Always set up scroll tracking (fixes current-upper updates for all views)
        fixCurrentUpperScrollTracking();

        // Year and Month views already handled by formatYearLabels/formatMonthLabels
        // Focus on Day, Week, Hour, Quarter Day, Half Day views
        if (viewMode === 'Year' || viewMode === 'Month') return;

        const columnWidth = ganttInstance?.options?.column_width ?? 45;

        // Get current year from gantt dates for reference
        const currentYear = ganttInstance?.dates?.[0]?.getFullYear() ||
            new Date().getFullYear();

        // Month name mappings for responsive formatting
        const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        upperTexts.forEach((text) => {
            const content = text.textContent.trim();

            // Skip if already contains a 4-digit year
            if (/\d{4}/.test(content)) return;

            // Skip if empty
            if (!content) return;

            // Check if this looks like a month name without year
            // Frappe Gantt typically shows "December" or "Dec" for upper headers
            const monthPattern = /^(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i;
            if (monthPattern.test(content)) {
                // Store original text for library scroll handler matching
                // Library uses textContent matching to find current element on scroll
                text.setAttribute('data-original-text', content);

                // Look up date by position → index (fixes wrong year bug)
                // Element's X position / column_width = index in dates array
                const elementX = parseFloat(text.style.left) || 0;
                const dateIndex = Math.round(elementX / columnWidth);

                let inferredYear = currentYear;
                if (ganttInstance?.dates && dateIndex >= 0 && dateIndex < ganttInstance.dates.length) {
                    const elementDate = ganttInstance.dates[dateIndex];
                    inferredYear = elementDate.getFullYear();
                }

                // Use abbreviated month at narrow widths (<100px), full at wider
                // Threshold chosen to fit "Dec 2025" comfortably
                if (columnWidth < 100) {
                    const shortMonth = content.slice(0, 3);
                    text.textContent = `${shortMonth} ${inferredYear}`;
                } else {
                    text.textContent = `${content} ${inferredYear}`;
                }
            }
        });
    }

    /**
     * Fix the current-upper scroll tracking after we modify textContent.
     * The library's scroll handler uses textContent matching, but we modify textContent.
     * This adds our own scroll handler using position-based element finding.
     */
    function fixCurrentUpperScrollTracking() {
        if (!ganttInstance) return;

        const container = document.querySelector('.gantt-container');
        if (!container) return;

        // Only add once per container instance
        if (container._currentUpperScrollFixed) return;
        container._currentUpperScrollFixed = true;

        container.addEventListener('scroll', () => {
            if (!ganttInstance || !ganttInstance.config) return;

            const scrollLeft = container.scrollLeft;
            const upperTexts = document.querySelectorAll('.gantt-container .upper-text');
            if (!upperTexts.length) return;

            // Find the rightmost upper-text element that starts at or before scrollLeft
            // This is the element that should be "current" (sticky in top-left)
            let currentEl = null;
            let currentElLeft = -Infinity;

            upperTexts.forEach(el => {
                // Skip empty/hidden elements
                if (!el.textContent.trim()) return;

                // Get element's left position
                const elLeft = parseFloat(el.style.left) || el.offsetLeft || 0;

                // Find the rightmost element that's still to the left of (or at) scroll position
                if (elLeft <= scrollLeft && elLeft > currentElLeft) {
                    currentElLeft = elLeft;
                    currentEl = el;
                }
            });

            // If no element found to the left, use the first visible one
            if (!currentEl) {
                currentEl = Array.from(upperTexts).find(el => el.textContent.trim());
            }

            if (currentEl) {
                // Only update if changed
                const existingCurrent = document.querySelector('.gantt-container .upper-text.current-upper');
                if (existingCurrent !== currentEl) {
                    upperTexts.forEach(el => el.classList.remove('current-upper'));
                    currentEl.classList.add('current-upper');
                    ganttInstance.$current = currentEl;
                }
            }
        });

        console.log('Current-upper scroll tracking fixed (position-based)');
    }

    /**
     * Add subtle vertical separator lines between lower header elements (#50).
     * Creates small dividers in the lower-text area only.
     */
    function addHeaderSeparators() {
        // The grid-header is an HTML div, not an SVG group
        const headerDiv = document.querySelector('.gantt-container .grid-header');
        if (!headerDiv || !ganttInstance) {
            console.warn('addHeaderSeparators: headerDiv or ganttInstance not found');
            return;
        }

        const columnWidth = ganttInstance.options?.column_width ?? 45;
        const columnCount = ganttInstance.dates?.length ?? 0;

        // Remove any existing separators
        headerDiv.querySelectorAll('.header-separator').forEach(el => el.remove());

        // Get lower-text position and size to center separators vertically
        const lowerText = headerDiv.querySelector('.lower-text');
        const separatorHeight = 12; // Small height for subtle appearance

        // Calculate vertical center of lower-text area
        let separatorTop = 20; // fallback
        if (lowerText) {
            const lowerTop = parseInt(lowerText.style.top) || 20;
            const lowerHeight = lowerText.getBoundingClientRect().height || 14;
            // Center separator with lower-text: lowerTop + (lowerHeight/2) - (separatorHeight/2)
            separatorTop = lowerTop + (lowerHeight / 2) - (separatorHeight / 2);
        }

        // Add subtle vertical separators at column boundaries (centered with lower-text)
        for (let i = 1; i < columnCount; i++) {
            const x = i * columnWidth;
            const sep = document.createElement('div');
            sep.className = 'header-separator';
            sep.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${separatorTop}px;
                width: 1px;
                height: ${separatorHeight}px;
                background-color: #dfe6e9;
                pointer-events: none;
            `;
            headerDiv.appendChild(sep);
        }

        console.log(`Header separators: added ${columnCount - 1} subtle separators at lower-text level`);
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
     * - If user changes 'columnWidth' in the panel, reset ALL views to that value.
     * - If user changes OTHER settings, preserve per-view zoom state.
     * - Shows feedback if configured value is below current view's floor.
     */
    function buildGanttConfig(webAppConfig) {
        // Load persisted view mode (localStorage, per-chart)
        const persistedViewMode = loadPersistedViewMode(webAppConfig.dataset);
        const effectiveViewMode = persistedViewMode || webAppConfig.viewMode || 'Week';

        // Update currentViewMode to match
        currentViewMode = effectiveViewMode;

        // Detect if columnWidth setting changed in the panel
        const configWidth = parseInt(webAppConfig.columnWidth) || COLUMN_WIDTH_BASELINE;

        if (lastConfiguredColumnWidth === null) {
            // First load - initialize all views to config value
            lastConfiguredColumnWidth = configWidth;
            for (const mode in columnWidthByViewMode) {
                columnWidthByViewMode[mode] = configWidth;
            }
        } else if (configWidth !== lastConfiguredColumnWidth) {
            // User explicitly changed setting in panel
            console.log('User changed Column Width setting to', configWidth);

            // Check if new value is below current view's floor
            const viewFloor = minColumnWidthByViewMode[currentViewMode] || ABSOLUTE_FLOOR;

            if (configWidth < viewFloor) {
                // Show feedback - value too low for current view
                showZoomLimitMessage(
                    currentViewMode + ' view requires minimum ' + viewFloor +
                    'px column width. Set to ' + (viewFloor + 1) + ' or higher to change.'
                );
                // Don't update - keep existing zoom (don't set lastConfiguredColumnWidth)
            } else {
                // Valid value - reset all views to new value
                lastConfiguredColumnWidth = configWidth;
                for (const mode in columnWidthByViewMode) {
                    columnWidthByViewMode[mode] = configWidth;
                }
                updateZoomIndicator();
            }
        }
        // Else: configWidth is same, preserve per-view zoom state

        // Get current view's column width
        const currentWidth = columnWidthByViewMode[currentViewMode] || COLUMN_WIDTH_BASELINE;

        const ganttConfig = {
            // View settings
            view_mode: effectiveViewMode,
            view_mode_select: webAppConfig.viewModeSelect !== false,

            // Appearance
            bar_height: parseInt(webAppConfig.barHeight) || 35,
            bar_corner_radius: parseInt(webAppConfig.barCornerRadius) || 3,
            column_width: currentWidth, // Use this view's width
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

        console.log('Built ganttConfig:', JSON.stringify(ganttConfig, null, 2));
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

                // Track view mode change for per-view zoom
                const previousViewMode = currentViewMode;
                if (viewModeName !== currentViewMode) {
                    // Switching to a different view - load that view's zoom
                    currentViewMode = viewModeName;
                    const newZoom = columnWidthByViewMode[viewModeName] || COLUMN_WIDTH_BASELINE;
                    ganttInstance.options.column_width = newZoom;
                    console.log('View switch:', previousViewMode, '->', viewModeName, 'zoom:', newZoom);
                }

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
                    updateStickyHeaderTheme();  // Ensure header theme is reapplied (#31)
                    addHeaderSeparators();  // Add column separators (#50)
                    setupStickyHeader();  // Re-setup after view change recreates DOM
                    applyGridSettings();  // Re-apply grid settings (#34)
                    // addPillBackgrounds();  // Disabled - deferred to v0.9.4 (#47)
                    addExpectedProgressMarkers();  // Re-add markers after DOM recreated
                    forceRightAlignedLabels();  // Force all labels to right of bars (#62)
                    addCompletionIndicators();  // Add checkmarks to 100% tasks (#31)
                    ensureStackingOrder();  // Ensure today line and markers on top (#57)
                    ensureEdgeToEdgeContent();  // Check edge-to-edge, zoom if needed (#21)
                    updateZoomIndicator();  // Update indicator for new view's zoom
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
                initTheme();  // Apply theme before visual adjustments (#31)
                enforceMinimumBarWidths();
                fixProgressBarRadius();
                updateSvgDimensions();
                adjustHeaderLabels();
                addHeaderSeparators();  // Add column separators (#50)
                setupStickyHeader();
                applyGridSettings();  // Apply grid line visibility/opacity (#34)
                // addPillBackgrounds();  // Disabled - deferred to v0.9.4 (#47)
                addExpectedProgressMarkers();
                forceRightAlignedLabels();  // Force all labels to right of bars (#62)
                addCompletionIndicators();  // Add checkmarks to 100% tasks (#31)
                ensureStackingOrder();  // Ensure today line and markers on top (#57)
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
        // Use CSS variable for theme-aware background color (#31)
        header.style.backgroundColor = 'var(--color-surface)';

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

    // ===== EDGE-TO-EDGE CONTENT (Issue #21) =====

    // Guard to prevent re-render loop
    let edgeToEdgeInProgress = false;
    // Track expected view mode for race condition detection (#54)
    let edgeToEdgeExpectedViewMode = null;

    /**
     * Calculate and enforce minimum column width to fill viewport.
     * Each view mode has its own floor based on column count.
     *
     * Formula: viewFloor = MAX(containerWidth / dates.length, ABSOLUTE_FLOOR)
     * Render at: MAX(currentColumnWidth, viewFloor)
     *
     * Also detects when SVG was rendered with wrong column width (e.g., after
     * view switch where previous view's width was used).
     *
     * Issue #21: When SVG doesn't fill container, browser paint/composite
     * behavior during scroll transform causes visual jank.
     *
     * Issue #54: Added view mode mismatch guard to prevent zoom carryover
     * during rapid view switching.
     */
    function ensureEdgeToEdgeContent() {
        if (!ganttInstance) return;
        if (edgeToEdgeInProgress) return;

        // Capture expected view mode at call time for race detection (#54)
        edgeToEdgeExpectedViewMode = currentViewMode;

        const container = document.getElementById('gantt-container');
        const svg = document.getElementById('gantt-svg');
        if (!container || !svg) return;

        const containerWidth = container.offsetWidth;
        const columnCount = ganttInstance.dates ? ganttInstance.dates.length : 0;
        const svgWidth = parseFloat(svg.getAttribute('width')) || 0;

        if (columnCount <= 0 || containerWidth <= 0) return;

        // Calculate this view's floor: minimum to fill viewport or absolute floor
        const viewFloor = Math.max(Math.ceil(containerWidth / columnCount), ABSOLUTE_FLOOR);

        // Store the floor for this view mode (used by adjustZoom)
        minColumnWidthByViewMode[currentViewMode] = viewFloor;

        // Get stored column width for this view
        const storedWidth = columnWidthByViewMode[currentViewMode] || COLUMN_WIDTH_BASELINE;

        // Calculate what was actually rendered (SVG width / columns)
        const renderedWidth = svgWidth > 0 ? Math.round(svgWidth / columnCount) : storedWidth;

        // Formula: render at MAX(stored, viewFloor)
        const neededWidth = Math.max(storedWidth, viewFloor);

        console.log('Edge-to-edge:', {
            viewMode: currentViewMode,
            containerWidth,
            columnCount,
            svgWidth,
            viewFloor,
            storedWidth,
            renderedWidth,
            neededWidth
        });

        // Re-render if:
        // 1. Stored width is below floor (need to bump up for edge-to-edge)
        // 2. OR rendered width doesn't match needed (wrong width used, e.g. after view switch)
        const needsRerender = storedWidth < neededWidth || Math.abs(renderedWidth - neededWidth) > 2;

        if (needsRerender) {
            // Guard: Check if view mode changed during calculations (#54)
            // This prevents zoom carryover when user switches views rapidly
            const actualViewMode = ganttInstance?.options?.view_mode;
            if (actualViewMode !== edgeToEdgeExpectedViewMode) {
                console.log('Edge-to-edge: View mode changed during calculation, aborting',
                    '(expected:', edgeToEdgeExpectedViewMode, 'actual:', actualViewMode, ')');
                return;
            }

            console.log('Edge-to-edge: Re-rendering at', neededWidth, '(was', renderedWidth, ')');

            // If stored width was below floor, show feedback to user
            if (storedWidth < viewFloor) {
                showZoomLimitMessage(
                    currentViewMode + ' view requires minimum ' + viewFloor +
                    'px column width to fill viewport.'
                );
            }

            columnWidthByViewMode[currentViewMode] = neededWidth;
            ganttInstance.options.column_width = neededWidth;
            updateZoomIndicator();

            // Re-render with new width (guard prevents recursion)
            edgeToEdgeInProgress = true;
            ganttInstance.change_view_mode(currentViewMode);
            // Clear guard after 2 frames (covers callback cycle)
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    edgeToEdgeInProgress = false;
                });
            });
        } else {
            // Just update indicator to reflect current state
            updateZoomIndicator();
        }
    }

    // ===== DARK MODE SUPPORT (#31) =====

    // Track system preference listener for cleanup
    let systemThemeListener = null;
    // Track current theme setting for sticky header updates
    let currentThemeSetting = 'light';

    /**
     * Get localStorage key for theme persistence.
     * Uses same hash function as view mode for consistency.
     */
    function getThemeStorageKey(datasetName) {
        return `gantt-theme-${hashString(datasetName || 'default')}`;
    }

    /**
     * Load persisted theme from localStorage.
     */
    function loadPersistedTheme(datasetName) {
        try {
            const key = getThemeStorageKey(datasetName);
            const saved = localStorage.getItem(key);
            return ['light', 'dark', 'auto'].includes(saved) ? saved : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Save theme to localStorage.
     */
    function saveTheme(datasetName, theme) {
        try {
            const key = getThemeStorageKey(datasetName);
            localStorage.setItem(key, theme);
            console.log('Theme saved:', theme);
        } catch (e) {
            console.warn('Failed to save theme:', e);
        }
    }

    /**
     * Initialize theme based on persisted setting or config.
     * Called during initial render.
     */
    function initTheme() {
        // Priority: localStorage > config > default
        const persisted = loadPersistedTheme(webAppConfig?.dataset);
        const themeSetting = persisted || webAppConfig?.theme || 'light';
        applyTheme(themeSetting);
        updateThemeDropdown(themeSetting);
        setupThemeToggle();
    }

    /**
     * Update theme dropdown to reflect current theme.
     */
    function updateThemeDropdown(theme) {
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = theme;
        }
    }

    /**
     * Setup theme dropdown change handler.
     */
    function setupThemeToggle() {
        const themeSelect = document.getElementById('theme-select');
        if (!themeSelect) return;

        themeSelect.addEventListener('change', (e) => {
            const theme = e.target.value;
            applyTheme(theme);
            saveTheme(webAppConfig?.dataset, theme);
        });
    }

    /**
     * Apply theme to the document.
     * Supports 'light', 'dark', and 'auto' (system preference).
     */
    function applyTheme(setting) {
        const body = document.body;
        currentThemeSetting = setting;

        // Remove existing theme class
        body.classList.remove('dark-theme');

        // Clean up previous system listener if exists
        if (systemThemeListener) {
            window.matchMedia('(prefers-color-scheme: dark)')
                .removeEventListener('change', systemThemeListener);
            systemThemeListener = null;
        }

        let useDark = false;

        if (setting === 'auto') {
            // Detect system preference
            useDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

            // Listen for system changes
            systemThemeListener = (e) => {
                body.classList.toggle('dark-theme', e.matches);
                updateStickyHeaderTheme();  // Update header when system theme changes
                console.log('System theme changed:', e.matches ? 'dark' : 'light');
            };
            window.matchMedia('(prefers-color-scheme: dark)')
                .addEventListener('change', systemThemeListener);
        } else {
            useDark = setting === 'dark';
        }

        if (useDark) {
            body.classList.add('dark-theme');
        }

        // Update sticky header background to match theme
        updateStickyHeaderTheme();

        console.log('Theme applied:', setting, '(dark:', useDark, ')');
    }

    /**
     * Update sticky header background color to match current theme.
     * Uses CSS variable for automatic theme response (#31).
     */
    function updateStickyHeaderTheme() {
        const header = document.querySelector('.gantt .grid-header');
        if (header) {
            header.style.backgroundColor = 'var(--color-surface)';
        }
    }

    // ===== GRID LINES CONFIGURATION (#34) =====

    /**
     * Apply grid line visibility and opacity settings.
     * Controlled by showVerticalGridLines, showHorizontalGridLines, and gridLineOpacity.
     *
     * Called after render and view changes.
     */
    function applyGridSettings() {
        const showVertical = webAppConfig?.showVerticalGridLines ?? true;
        const showHorizontal = webAppConfig?.showHorizontalGridLines ?? true;
        const opacity = (webAppConfig?.gridLineOpacity ?? 100) / 100;

        // Vertical lines (column ticks)
        document.querySelectorAll('.gantt .tick').forEach(el => {
            el.style.display = showVertical ? '' : 'none';
            el.style.opacity = opacity;
        });

        // Horizontal lines (row separators)
        document.querySelectorAll('.gantt .row-line').forEach(el => {
            el.style.display = showHorizontal ? '' : 'none';
            el.style.opacity = opacity;
        });

        // Also apply to grid rows stroke (alternate approach for row lines)
        document.querySelectorAll('.gantt .grid-row').forEach(el => {
            el.style.strokeOpacity = showHorizontal ? opacity : 0;
        });

        console.log('Grid settings applied:', { showVertical, showHorizontal, opacity });
    }

    // ===== PILL BOX LABELS (#47) =====

    /**
     * Add pill background rectangles behind bar labels.
     * SVG text elements don't support CSS background/padding, so we insert
     * rect elements behind each label for contrast.
     *
     * Called after render and view changes.
     */
    function addPillBackgrounds() {
        console.log('addPillBackgrounds: Starting...');
        const svg = document.getElementById('gantt-svg');
        if (!svg) {
            console.warn('addPillBackgrounds: No SVG found');
            return;
        }

        // Remove existing pills first (handles re-render)
        const existingPills = svg.querySelectorAll('.bar-label-pill');
        console.log('addPillBackgrounds: Removing', existingPills.length, 'existing pills');
        existingPills.forEach(p => p.remove());

        const barWrappers = svg.querySelectorAll('.bar-wrapper');
        console.log('addPillBackgrounds: Found', barWrappers.length, 'bar-wrappers');

        // Constants at top for easy tweaking (#47)
        const PADDING_X = 6;
        const PADDING_Y = 2;
        const FILL_INTERNAL = 'rgba(255, 255, 255, 0.85)';
        const FILL_EXTERNAL = 'rgba(255, 255, 255, 0.95)';

        // PASS 1: Read all bboxes (batch reads to avoid layout thrashing)
        const measurements = [];
        barWrappers.forEach(wrapper => {
            const label = wrapper.querySelector('.bar-label');
            if (!label) return;

            try {
                const bbox = label.getBBox();
                if (!bbox || bbox.width === 0) return;
                measurements.push({
                    wrapper,
                    label,
                    bbox,
                    isBig: label.classList.contains('big')
                });
            } catch (e) {
                // getBBox can throw if element not rendered
                console.warn('Could not get bbox for label:', e);
            }
        });

        // PASS 2: Create and insert pills (batch writes)
        let pillsAdded = 0;
        measurements.forEach(({ wrapper, label, bbox, isBig }) => {
            if (isBig) wrapper.classList.add('has-big-label');

            const pill = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            pill.setAttribute('class', 'bar-label-pill');
            pill.setAttribute('x', String(bbox.x - PADDING_X));
            pill.setAttribute('y', String(bbox.y - PADDING_Y));
            pill.setAttribute('width', String(bbox.width + (PADDING_X * 2)));
            pill.setAttribute('height', String(bbox.height + (PADDING_Y * 2)));
            pill.setAttribute('rx', '3');
            pill.setAttribute('ry', '3');

            // CRITICAL: Set fill directly as attribute to ensure visibility (#47)
            pill.setAttribute('fill', isBig ? FILL_EXTERNAL : FILL_INTERNAL);
            pill.setAttribute('opacity', '1');

            // Insert BEFORE label so pill renders underneath text
            try {
                label.parentNode.insertBefore(pill, label);
                pillsAdded++;
            } catch (e) {
                console.warn('addPillBackgrounds: Failed to insert pill:', e);
            }
        });

        console.log('addPillBackgrounds: Created', pillsAdded, 'pills for', barWrappers.length, 'bars');

        // Verify pills were actually added to DOM
        const verifyPills = svg.querySelectorAll('.bar-label-pill');
        console.log('addPillBackgrounds: Verification - found', verifyPills.length, 'pills in DOM');
    }

    // ===== VISUAL STACKING ORDER (#57) =====

    /**
     * Ensure proper visual stacking order for SVG elements.
     * SVG doesn't support z-index - elements render in DOM order (later = on top).
     *
     * Desired order (bottom to top):
     * 1. Grid rows and lines (background)
     * 2. Task bars
     * 3. Today line
     * 4. Expected progress markers
     *
     * Called after render and view changes to maintain proper layering.
     */
    function ensureStackingOrder() {
        const svg = document.getElementById('gantt-svg');
        if (!svg) return;

        // Find the today highlight element (frappe-gantt uses 'today-highlight' class)
        const todayHighlight = svg.querySelector('.today-highlight');

        // Find all bar wrappers (task bars)
        const barWrappers = svg.querySelectorAll('.bar-wrapper');
        if (barWrappers.length === 0) return;

        // Get the parent of bar wrappers (the bars layer)
        const barsLayer = barWrappers[0].parentElement;
        if (!barsLayer) return;

        // Move today highlight after all bars (renders on top of bars, but below markers)
        if (todayHighlight && barsLayer) {
            barsLayer.appendChild(todayHighlight);
            console.log('Stacking order: Moved today-highlight above bars');
        }

        // Markers are now created directly in markers-layer by addExpectedProgressMarkers()
        // Just ensure markers-layer is at end of SVG for proper z-order
        const markersLayer = svg.querySelector('.markers-layer');
        if (markersLayer) {
            svg.appendChild(markersLayer);  // Move to end = topmost
            console.log('Stacking order: Ensured markers-layer is topmost');
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

        // Get SVG and create/get markers layer at TOP of stacking order (#57)
        const svg = document.getElementById('gantt-svg');
        if (!svg) {
            console.warn('Expected progress markers: no SVG found');
            return;
        }

        // Create or reuse markers layer - appended to SVG so it renders on top of everything
        let markersLayer = svg.querySelector('.markers-layer');
        if (!markersLayer) {
            markersLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            markersLayer.setAttribute('class', 'markers-layer');
            svg.appendChild(markersLayer);
        }

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
            // Check if task spans today (use Python's _expected_progress as indicator)
            if (task._expected_progress === undefined || task._expected_progress === null) {
                return;  // Task not in progress - no marker needed
            }

            // Get the bar-group (child of bar-wrapper) and bar element
            const barGroup = wrapper.querySelector('.bar-group');
            const bar = wrapper.querySelector('.bar');
            if (!bar || !barGroup) return;

            // Get bar dimensions
            const barHeight = parseFloat(bar.getAttribute('height')) || 0;
            const barY = parseFloat(bar.getAttribute('y')) || 0;

            // Use the Today line's X position - guarantees alignment with library's date math
            const todayLine = document.querySelector('.current-highlight');
            if (!todayLine) {
                return;  // No today line visible
            }

            // Get the today line's X position from its 'left' style
            const todayX = parseFloat(todayLine.style.left) || 0;
            const markerX = todayX;

            // Create SVG line for marker
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            marker.setAttribute('class', 'expected-progress-marker');
            marker.setAttribute('x1', markerX);
            marker.setAttribute('y1', barY);
            marker.setAttribute('x2', markerX);
            marker.setAttribute('y2', barY + barHeight);
            marker.setAttribute('stroke', '#e74c3c');
            marker.setAttribute('stroke-width', '3');  // Increased from 2 for visibility (#57)
            marker.setAttribute('stroke-dasharray', '4,2');  // Slightly larger dash

            // Create small triangle indicator at top
            const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            triangle.setAttribute('class', 'expected-progress-marker');
            const triSize = 8;  // Increased from 5 for visibility (#57)
            const triPoints = `${markerX - triSize},${barY - triSize} ${markerX + triSize},${barY - triSize} ${markerX},${barY}`;
            triangle.setAttribute('points', triPoints);
            triangle.setAttribute('fill', '#e74c3c');

            // Insert markers into top-layer group (not bar group) for proper z-order (#57)
            markersLayer.appendChild(marker);
            markersLayer.appendChild(triangle);
            markersAdded++;
        });

        console.log('Expected progress markers added:', markersAdded);
    }

    // ===== COMPLETION INDICATORS (#31) =====

    /**
     * Determine if a color is light or dark based on luminance.
     * Used to choose contrasting checkmark color (black on light, white on dark).
     */
    function isLightColor(colorStr) {
        // Parse rgb(r, g, b) or rgba(r, g, b, a) format
        const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return true;  // Default to light if can't parse

        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);

        // Calculate relative luminance (ITU-R BT.709)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5;
    }

    // ===== LABEL POSITIONING (#62) =====

    /**
     * Force all task labels to be right-aligned (positioned to the right of bars).
     * Overrides frappe-gantt's adaptive logic that places labels inside or outside
     * bars based on text width. All labels are positioned 45px from bar end.
     * #62: Standardize Task Label Positioning
     */
    function forceRightAlignedLabels() {
        const LABEL_OFFSET = 45; // 45px right of bar end

        document.querySelectorAll('.gantt .bar-wrapper').forEach(wrapper => {
            const bar = wrapper.querySelector('.bar');
            const label = wrapper.querySelector('.bar-label');
            if (!bar || !label) return;

            const barX = parseFloat(bar.getAttribute('x')) || 0;
            const barWidth = parseFloat(bar.getAttribute('width')) || 0;
            const barEndX = barX + barWidth;

            // Force right-aligned positioning
            label.setAttribute('x', barEndX + LABEL_OFFSET);
            label.classList.add('big');  // Ensures correct text color (external label styling)
        });
    }

    // ===== COMPLETION INDICATORS (#63) =====

    /**
     * Add checkmark indicators to 100% complete tasks.
     * Uses _is_complete flag from Python backend for detection.
     * Checkmark is centered in bar (horizontally and vertically).
     * Color adapts to bar background (black on light, white on dark).
     */
    function addCompletionIndicators() {
        if (!currentTasks || currentTasks.length === 0) return;

        // Remove existing indicators (handles re-render/view change)
        document.querySelectorAll('.completion-indicator').forEach(el => el.remove());

        const barWrappers = document.querySelectorAll('.gantt .bar-wrapper');
        let indicatorsAdded = 0;

        barWrappers.forEach(wrapper => {
            const taskId = wrapper.getAttribute('data-id');
            if (!taskId) return;

            // Use _is_complete flag from Python backend
            const task = currentTasks.find(t => t.id === taskId);
            if (!task || !task._is_complete) return;

            const bar = wrapper.querySelector('.bar');
            const label = wrapper.querySelector('.bar-label');
            if (!bar) return;

            const x = parseFloat(bar.getAttribute('x')) || 0;
            const y = parseFloat(bar.getAttribute('y')) || 0;
            const width = parseFloat(bar.getAttribute('width')) || 0;
            const height = parseFloat(bar.getAttribute('height')) || 0;

            // Determine checkmark color based on bar background
            const barFill = window.getComputedStyle(bar).fill;
            const checkColor = isLightColor(barFill) ? '#000000' : '#ffffff';

            // Center checkmark in bar (16x16 icon, scaled 1.5x)
            const iconSize = 16;
            const scale = 1.5;
            const scaledSize = iconSize * scale;
            const centerX = x + (width / 2) - (scaledSize / 2);  // True horizontal center (#63)
            const centerY = y + (height / 2) - (scaledSize / 2);

            // Create checkmark using SVG path (cross-browser compatible)
            const checkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            checkGroup.setAttribute('class', 'completion-indicator');
            checkGroup.setAttribute('transform', `translate(${centerX}, ${centerY}) scale(${scale})`);

            const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            // Checkmark path (16x16 viewbox)
            checkPath.setAttribute('d', 'M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z');
            checkPath.setAttribute('fill', checkColor);

            checkGroup.appendChild(checkPath);
            wrapper.appendChild(checkGroup);

            // Note: Label shifting removed - #62 forceRightAlignedLabels() handles all label positioning

            indicatorsAdded++;
        });

        console.log('Completion indicators added:', indicatorsAdded);
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

            // #64: Width extension removed - it caused progress to appear overstated.
            // The clipPath alone handles corner containment correctly.
        });

        console.log(`Created ${defs.children.length} clipPath definitions`);
    }

    // ===== DATE FORMATTING (#35) =====

    /**
     * Format a date according to user's selected format preference.
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date string
     */
    function formatDateForDisplay(date) {
        if (!date) return 'N/A';

        // Ensure Date object
        let d = date;
        if (!(date instanceof Date)) {
            d = new Date(date);
        }
        if (isNaN(d.getTime())) return 'N/A';

        const year = d.getFullYear();
        const month = d.getMonth();
        const day = d.getDate();

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const pad = (n) => n.toString().padStart(2, '0');
        const format = webAppConfig?.dateFormat || 'ISO';

        switch (format) {
            case 'US':
                return `${pad(month + 1)}/${pad(day)}/${year}`;
            case 'EU':
                return `${pad(day)}/${pad(month + 1)}/${year}`;
            case 'LONG':
                return `${monthNames[month]} ${day}, ${year}`;
            case 'SHORT':
                return `${monthNamesShort[month]} ${day}`;
            case 'ISO':
            default:
                return `${year}-${pad(month + 1)}-${pad(day)}`;
        }
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
        // Try _start/_end first (Frappe Gantt internal), fallback to start/end
        const startDate = task._start || task.start;
        const endDate = task._end || task.end;
        html += `<div class="popup-dates">${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}</div>`;

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

        // Get this view's floor and current width
        const viewFloor = minColumnWidthByViewMode[currentViewMode] || ABSOLUTE_FLOOR;
        const currentWidth = columnWidthByViewMode[currentViewMode] || COLUMN_WIDTH_BASELINE;

        let newWidth;

        if (delta > 0) {
            // ZOOMING IN
            // Check if there's a stop between current and current + step that we must hit
            const nextStop = ZOOM_STOPS.find(stop => stop > currentWidth && stop <= currentWidth + ZOOM_STEP);
            if (nextStop) {
                // Must land on this stop
                newWidth = nextStop;
            } else {
                // Normal increment
                newWidth = currentWidth + ZOOM_STEP;
            }
        } else {
            // ZOOMING OUT
            // Check if there's a stop between current - step and current that we must hit
            const prevStop = [...ZOOM_STOPS].reverse().find(stop => stop < currentWidth && stop >= currentWidth - ZOOM_STEP);
            if (prevStop) {
                // Must land on this stop
                newWidth = prevStop;
            } else {
                // Normal decrement
                newWidth = currentWidth - ZOOM_STEP;
            }

            // Enforce view's floor
            if (newWidth < viewFloor) {
                if (currentWidth <= viewFloor) {
                    showZoomLimitMessage('Maximum zoom out reached for ' + currentViewMode + ' view');
                    return;
                }
                newWidth = viewFloor;
            }
        }

        if (newWidth === currentWidth) return;

        columnWidthByViewMode[currentViewMode] = newWidth;
        ganttInstance.options.column_width = newWidth;

        // Force refresh
        ganttInstance.change_view_mode(currentViewMode);
        updateZoomIndicator();
        console.log('Zoom to:', newWidth, '(' + Math.round((newWidth / COLUMN_WIDTH_BASELINE) * 100) + '%) for', currentViewMode);
    }

    function updateZoomIndicator() {
        const indicator = document.getElementById('zoom-level-indicator');
        if (indicator) {
            // Base is 75px (100%)
            const currentWidth = columnWidthByViewMode[currentViewMode] || COLUMN_WIDTH_BASELINE;
            const pct = Math.round((currentWidth / COLUMN_WIDTH_BASELINE) * 100);
            indicator.textContent = `${pct}%`;
        }
    }

    /**
     * Show a temporary message when zoom limits are reached.
     * Auto-dismisses after 5 seconds.
     *
     * Note: Inserted BEFORE gantt-container (not inside) so it survives
     * container.innerHTML = '' during render.
     */
    function showZoomLimitMessage(message) {
        // Remove any existing zoom message
        const existing = document.getElementById('zoom-limit-message');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'zoom-limit-message';
        banner.className = 'info-banner zoom-limit-banner';
        banner.innerHTML = `
            <i class="icon-info-sign"></i>
            <span>${message}</span>
            <button class="dismiss-btn" onclick="this.parentElement.remove()">&times;</button>
        `;

        // Insert BEFORE gantt-container (not inside) so render doesn't clear it
        const container = document.getElementById('gantt-container');
        if (container && container.parentElement) {
            container.parentElement.insertBefore(banner, container);
        }

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (banner.parentElement) banner.remove();
        }, 5000);
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
            // Update current view's column width
            columnWidthByViewMode[currentViewMode] = config.column_width;
        }
        updateZoomIndicator();
    }

    console.log('Gantt Chart webapp initialized');

})();
