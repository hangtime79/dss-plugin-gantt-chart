# Feature v0.10.1 Specification: Global Custom Palettes (#79)

## Branch
`feature/v0.10.1-custom-palettes`

## Linked Issues
- Fixes #79

## Overview
Add admin-defined custom color palettes via Dataiku's parameter set (PRESET) mechanism. Users select "Custom (Preset)" from palette dropdown, then pick an admin-defined preset.

---

## Architecture

```
Admin creates presets in Dataiku Settings
        │
        ▼
User selects "Custom (Preset)" in Color Palette dropdown
        │
        ▼
PRESET selector appears → User picks admin-defined palette
        │
        ▼
backend.py reads preset config → Parses colors JSON array
        │
        ▼
color_mapper.py generates bar-custom-N classes
        │
        ▼
app.js injects CSS at runtime (auto text contrast via luminance)
```

---

## Implementation Summary

### Step 1: Parameter Set
**File:** `parameter-sets/custom-palette/parameter-set.json` (NEW)

Defines the preset structure with:
- `palette_name`: STRING - Display name for the palette
- `colors`: TEXTAREA - JSON array of hex colors (min 6, max 12)

### Step 2: webapp.json
**File:** `webapps/gantt-chart/webapp.json`

- Added "custom" option to colorPalette SELECT
- Added PRESET param `customPalettePreset` with visibilityCondition

### Step 3: backend.py
**File:** `webapps/gantt-chart/backend.py`

- Parse custom preset when `colorPalette == 'custom'`
- Validate and pass custom_colors to TaskTransformer
- Include customPaletteColors in response for frontend CSS injection

### Step 4: task_transformer.py
**File:** `python-lib/ganttchart/task_transformer.py`

- Added `custom_colors` field to TaskTransformerConfig
- Pass to create_color_mapping()

### Step 5: color_mapper.py
**File:** `python-lib/ganttchart/color_mapper.py`

- Added `validate_custom_colors()` function for hex validation
- Extended `create_color_mapping()` to handle custom palette
- Generates `bar-custom-1` through `bar-custom-12` CSS classes

### Step 6: app.js
**File:** `webapps/gantt-chart/app.js`

- Added `getLuminance()` for WCAG-compliant contrast calculation
- Added `injectCustomPaletteCSS()` to create dynamic CSS rules
- Added `removeCustomPaletteCSS()` for cleanup when switching palettes
- Auto-selects white or dark text based on color luminance

### Step 7: Version Bump
**File:** `plugin.json`

Version: 0.10.0 → 0.10.1

---

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `parameter-sets/custom-palette/parameter-set.json` | CREATE | Define custom palette preset structure |
| `webapps/gantt-chart/webapp.json` | MODIFY | Add "custom" option + PRESET param |
| `webapps/gantt-chart/backend.py` | MODIFY | Read preset, pass custom_colors |
| `python-lib/ganttchart/task_transformer.py` | MODIFY | Add custom_colors to config |
| `python-lib/ganttchart/color_mapper.py` | MODIFY | Handle custom palette, add validation |
| `webapps/gantt-chart/app.js` | MODIFY | Add luminance calc + CSS injection |
| `plugin.json` | MODIFY | Version bump to 0.10.1 |

---

## Testing Checklist

- [ ] Built-in palettes still work (classic, pastel, dark, dataiku)
- [ ] "Custom (Preset)" option appears in dropdown
- [ ] PRESET selector appears when "Custom (Preset)" selected
- [ ] PRESET selector hidden when other palettes selected
- [ ] Admin can create custom palette presets in Dataiku settings
- [ ] Custom colors apply correctly to task bars
- [ ] Text contrast is readable (auto light/dark)
- [ ] Minimum 6 colors enforced (fallback to classic if <6)
- [ ] Maximum 12 colors enforced (excess truncated)
- [ ] Invalid hex format rejected with fallback
- [ ] Empty/missing preset handled gracefully
- [ ] Works in both light and dark theme
- [ ] Switching palettes removes/replaces CSS correctly

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

**Pre-QA Commit Process:**
1. After implementing the fix, commit with message format:
   ```
   feat(v0.10.1): Add global custom color palettes (#79)
   ```
2. Verify commit: `git log --oneline -1`
3. Notify user code is committed and ready for QA

**QA Script for User:**
```
1. Reload plugin in Dataiku (Actions → Reload)
2. Go to plugin settings, create a custom palette preset:
   - Name: "Test Palette"
   - Colors: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"]
3. Open a Gantt chart webapp
4. Select "Custom (Preset)" in Color Palette dropdown
5. Select your "Test Palette" preset
6. Verify task bars use the custom colors
7. Verify text is readable (dark text on light bars, white on dark)
8. Switch to "Classic" palette, verify custom CSS is removed
9. Test with invalid colors JSON - should fallback to Classic
```

---

## Rollback Plan

1. Revert commit: `git revert HEAD`
2. Remove `parameter-sets/custom-palette/` directory
3. Reload plugin

---

## Watch Out For

1. **PRESET in webapps** - Verify PRESET param type works in webapp.json (tested in recipes, not webapps)
2. **visibilityCondition** - Syntax `model.colorPalette == 'custom'` needs verification
3. **CSS injection timing** - Must inject before Gantt renders
4. **Dark theme** - Custom colors may need different text colors based on background
