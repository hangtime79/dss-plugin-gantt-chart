# Release v1.0.0-rc Specification

## Branch
`release/v1.0.0-rc`

## Linked Issues
- Fixes #75 - Reorganize Left Bar configuration parameters
- Fixes #97 - Remove debug code before public release

## Overview
Final release candidate preparation: remove debug code and clean up configuration parameters for public release.

---

## Issue #75: Reorganize Left Bar Configuration

### Status: ✅ webapp.json COMPLETE (User modified directly)

**Parameters removed (hardcode in app.js):**
- ~~viewModeSelect~~ → Always true
- ~~todayButton~~ → Always true
- ~~theme~~ → Toolbar dropdown + localStorage

### Remaining Work
- `webapps/gantt-chart/app.js` - Hardcode the 3 removed params

---

## Issue #97: Remove Debug Code

### JavaScript (app.js) - HIGH PRIORITY
**~79 logging statements to remove/review:**
- Remove all `console.log()` except critical errors
- Keep `console.warn()` only for actual warnings
- Keep `console.error()` for error handling

### Python Backend (backend.py) - MEDIUM PRIORITY
**~28 debug lines to remove:**
- Issue tracker tags `[#79]`, `[#76]` logging
- Entry point logging ("ENTER /get-tasks")
- Preset resolution debugging
- Keep only error-level logging

### Python Libraries - NO CHANGES NEEDED
- Libraries use appropriate log levels already

---

## Files to Modify

| File | Change |
|------|--------|
| `webapps/gantt-chart/app.js` | Hardcode 3 params + Remove console.log |
| `webapps/gantt-chart/backend.py` | Remove debug logs |
| `webapps/gantt-chart/webapp.json` | ✅ DONE by user |
| `plugin.json` | Version bump to 1.0.0-rc |

---

## Testing Checklist

### #97 - Debug Code Removal
- [ ] No console.log in production (except error handlers)
- [ ] Python logging uses appropriate levels only
- [ ] Chart still renders correctly
- [ ] All features still work (filters, zoom, tooltips, etc.)

### #75 - Parameter Reorganization
- [ ] All parameters still accessible in UI
- [ ] Default values preserved
- [ ] Conditional visibility still works (Custom Palette)
- [ ] Settings save and load correctly

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**QA Script for User:**
```
=== DEBUG CODE REMOVAL (#97) ===
1. Reload plugin (Actions → Reload)
2. Open browser Developer Tools → Console
3. Load Gantt chart with data
4. Verify NO excessive console.log output
5. Change view modes, zoom, filters
6. Verify console stays clean (only errors if any)

=== PARAMETER REORGANIZATION (#75) ===
7. Open Gantt chart settings panel
8. Verify all settings are accessible
9. Verify logical grouping makes sense
10. Change settings in each section
11. Verify changes apply correctly
12. Reload and verify settings persisted
```

**Do not proceed to PR/merge until user confirms all features work.**

---

## Rollback Plan
Revert changes to:
- `app.js`
- `backend.py`
- `webapp.json`
- `plugin.json`

Reset version to 0.11.0.
