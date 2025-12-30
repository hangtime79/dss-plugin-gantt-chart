# Dataiku Plugins - Chart Specific Learnings

## Configuration (webapp.json)

### Parameter Structure
- **leftBarParams:** This array defines the configurable options in the left-hand sidebar of the chart settings.
- **Organization:** As options grow, use `{"type": "SEPARATOR", "label": "Section Name"}` to grouping parameters logically. This improves usability significantly.

### Parameter Types
- **DATASET_COLUMN:** Allows user to select a column from the input dataset.
- **SELECT:** Dropdown menu. Needs a `selectChoices` array of `{value, label}` objects.
- **BOOLEAN:** Checkbox toggle.
- **INT:** Numeric input. Important to set `minI` and `maxI` to prevent invalid values.
- **DATASET_COLUMNS:** (Plural) Provides a multi-select interface with drag-to-reorder capability out of the box. Excellent for "Group By" or "Tooltip Fields" features.

### Handling PRESETs
- **Raw Reference:** When a user selects a preset configuration, the webapp receives a raw reference object (`{"mode": "PRESET", "name": "..."}`) rather than the resolved values.
- **Resolution:** The code must check for this preset mode and manually fetch the resolved configuration from the DSS API (`client.get_plugin(...).get_settings()...`).
- **Property vs. Method:** The resolved preset object has a `.config` *property* (dict), not a `get_config()` method. This distinction is poorly documented (v0.10.1 post-mortem).

### Data Flow
- **Backend-Frontend Bridge:** The `backend.py` acts as a translation layer. It receives the raw config, can perform validation or transformation (like converting column names to data arrays), and serves JSON to the frontend. It should generally *not* contain heavy business logic if possible, but for charts, it often handles data aggregation or formatting before sending to the client.
- **Pandas Coercion:** Be aware that `NaN` values in a Pandas column will coerce integers to floats (e.g., IDs `1` -> `1.0`). This breaks string matching with non-NaN columns. Always normalize IDs to strings handling both int and float representations.

### UI behavior
- **CSS Loading:** Dataiku does NOT auto-load `style.css` from the `webapps/{name}/` folder. You must link it explicitly from the `resource/` folder in `body.html`.