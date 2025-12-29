# Feature v0.10.0 Specification: i18n Language Support

## Branch
`feature/v0.10.0-i18n`

## Linked Issues
- Fixes #32

## Overview
Add multi-language support for date/month formatting in the Gantt chart. Frappe Gantt already supports localization via the Intl API - we just need to expose the language parameter.

---

## Feature: Language Localization Support

### Current State
- `language: 'en'` is hardcoded in `app.js:853` (`buildGanttConfig()`)
- `language: 'en'` is also hardcoded in `backend.py:209` (unused endpoint)
- No language parameter exists in `webapp.json`

### What Gets Localized
- Month names (full and short) in date headers
- Month names in popup dates
- Date formatting respects locale conventions

### What Does NOT Get Localized (v0.10.0)
- View mode buttons (Hour, Day, Week, etc.)
- UI labels (Reset Zoom, filter buttons)
- Task names/descriptions (from data)

### Future Localization (Stubs Added)
UI strings will be centralized in a `UI_STRINGS` object for future translation:
- View mode labels: Hour, Quarter Day, Day, Week, Month, Year
- Filter buttons: All, Completed, Overdue, In Progress, Not Started
- Control buttons: Reset Zoom
- Scroll labels: Today, First task, Last task
- Empty state message

---

## Implementation Plan

### Step 1: Add Language Parameter to webapp.json
**File:** `webapps/gantt-chart/webapp.json`

Add after the `theme` parameter (around line 234) in the Appearance section:

```json
{
    "name": "language",
    "type": "SELECT",
    "label": "Language",
    "description": "Language for date/month formatting",
    "defaultValue": "en",
    "selectChoices": [
        {"value": "en", "label": "English"},
        {"value": "es", "label": "Español"},
        {"value": "de", "label": "Deutsch"},
        {"value": "fr", "label": "Français"},
        {"value": "pt", "label": "Português"},
        {"value": "ru", "label": "Русский"},
        {"value": "tr", "label": "Türkçe"},
        {"value": "zh", "label": "中文"},
        {"value": "ja", "label": "日本語"},
        {"value": "ko", "label": "한국어"},
        {"value": "it", "label": "Italiano"}
    ]
}
```

### Step 2: Update buildGanttConfig() in app.js
**File:** `webapps/gantt-chart/app.js`

Change line 853 from:
```javascript
language: 'en'
```
To:
```javascript
language: webAppConfig.language || 'en'
```

### Step 3: Add UI_STRINGS Stub Object in app.js
**File:** `webapps/gantt-chart/app.js`

Add near the top of the file (after constants, before functions) a centralized UI strings object for future localization:

```javascript
// =============================================================================
// UI STRINGS (Future i18n stub - currently English only)
// =============================================================================
// These strings are centralized here for future localization.
// To add translations: replace string values based on webAppConfig.language
const UI_STRINGS = {
    // View mode labels (displayed in view mode selector)
    viewModes: {
        'Hour': 'Hour',
        'Quarter Day': 'Quarter Day',
        'Day': 'Day',
        'Week': 'Week',
        'Month': 'Month',
        'Year': 'Year'
    },
    // Filter button labels
    filters: {
        all: 'All',
        completed: 'Completed',
        overdue: 'Overdue',
        inProgress: 'In Progress',
        notStarted: 'Not Started'
    },
    // Control buttons
    controls: {
        resetZoom: 'Reset Zoom'
    },
    // Empty state
    emptyState: {
        noTasks: 'No tasks to display',
        noMatchingTasks: 'No tasks match the selected filters'
    }
};
```

Then update these UI elements to use `UI_STRINGS`:
- Filter buttons in `createFilterButtons()` or equivalent
- Reset Zoom button label
- Empty state messages

### Step 4: Update backend.py (consistency)
**File:** `webapps/gantt-chart/backend.py`

Change line 209 from:
```python
'language': 'en'
```
To:
```python
'language': config.get('language', 'en')
```

### Step 5: Version Bump
**File:** `plugin.json`

Change version from `"0.9.8"` to `"0.10.0"`

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `webapps/gantt-chart/webapp.json` | Add | Language SELECT parameter in left bar |
| `webapps/gantt-chart/app.js` | Modify | Use config language + add UI_STRINGS stub |
| `webapps/gantt-chart/backend.py` | Modify | Use config language in get_config() |
| `plugin.json` | Modify | Version bump to 0.10.0 |

---

## Testing Checklist
- [ ] Language dropdown appears in Appearance section of config panel
- [ ] All 11 languages are available in dropdown
- [ ] Default is English when no selection made
- [ ] Selecting French shows French month names (e.g., "Janvier", "Février")
- [ ] Selecting Japanese shows Japanese month names (e.g., "1月", "2月")
- [ ] Popup dates show localized month names
- [ ] View mode changes preserve selected language
- [ ] Language persists with chart configuration

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. Commit with message format:
   ```
   feat(v0.10.0): Add language localization support (#32)
   ```
2. Verify commit: `git log --oneline -1`
3. Notify user code is ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions menu → Reload)
2. Open existing Gantt chart or create new one
3. Go to Settings panel → Appearance section
4. Verify "Language" dropdown appears after Theme
5. Test language changes:
   a. Select "Français" - month headers should show French (Janvier, Février...)
   b. Select "日本語" - month headers should show Japanese (1月, 2月...)
   c. Select "Español" - month headers should show Spanish (Enero, Febrero...)
6. Click a task bar to open popup - verify dates use selected language
7. Change view mode (Day/Week/Month) - verify language persists
8. Confirm default is "English" on fresh chart
```

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan
Revert the 4 file changes and set version back to 0.9.8.

---

## Watch Out For
- Frappe Gantt uses Intl.DateTimeFormat - all BCP 47 codes work, but we limit to 11 tested languages
- Language only affects date/month formatting, not UI labels (v0.10.0 scope)
- The `/get-config` endpoint in backend.py is currently unused but updated for consistency
- UI_STRINGS is a stub for future work - ensure all hardcoded UI text uses this object
- View mode strings in Frappe Gantt config are NOT localized (library limitation)

---

## Future Work (Beyond v0.10.0)
To fully localize UI labels, a future version would:
1. Add translation dictionaries per language to UI_STRINGS
2. Create `getUIString(key, lang)` helper function
3. Update body.html button labels to use data attributes + JS population
4. Consider view mode translation (requires Frappe Gantt changes)
