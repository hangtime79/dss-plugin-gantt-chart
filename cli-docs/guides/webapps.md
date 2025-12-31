# Webapps & Charts Guide

Webapps create interactive visualizations and dashboards. Plugin webapps are reusable across projects and can be configured by users without coding.

---

## Overview

A webapp consists of files in `webapps/{webapp-name}/`:
- **webapp.json** - Configuration: parameters, UI settings
- **backend.py** - Python Flask backend for data processing
- **app.html** (optional) - Custom HTML for standard webapps

### Webapp Types

| Type | Use Case | Backend | Frontend |
|------|----------|---------|----------|
| **STANDARD** | Custom charts with Flask + JS | Flask routes | HTML/JS |
| **BOKEH** | Bokeh visualizations | Bokeh server | Auto-generated |

**Recommendation:** Use STANDARD with Plotly for offline-capable charts.

---

## Flask Backend Essentials

### The `app` is Pre-Defined

When you write a plugin webapp backend, the Flask application object is **already created for you**. You do NOT instantiate Flask yourself.

```python
# What `from dataiku.customwebapp import *` provides:
# - app: Pre-configured Flask application
# - get_webapp_config(): Access webapp parameters

from dataiku.customwebapp import *  # Provides app and get_webapp_config()
from flask import request           # For query parameters

# WRONG - Don't create your own Flask app
# app = Flask(__name__)  # ❌ Never do this

# CORRECT - Use the provided app directly
@app.route('/get_data')
def get_data():
    dataset_name = request.args.get('dataset_name')
    config = get_webapp_config()
    # ... your logic
    return json.dumps(result)
```

### Key Points

- `app` is automatically available after importing `dataiku.customwebapp`
- Use `@app.route()` decorators directly
- Import `request` from Flask for query parameters: `from flask import request`
- Access webapp config params via `get_webapp_config()`

---

## Chart Webapp Configuration (webapp.json)

### Chart-Type Webapp (Most Common)

```json
{
    "meta": {
        "label": "My Chart",
        "description": "Interactive visualization",
        "icon": "fas fa-chart-bar"
    },
    "baseType": "STANDARD",
    "hasBackend": "true",
    "standardWebAppLibraries": ["jquery", "dataiku", "bootstrap", "font_awesome"],

    "chart": {
        "datasetParamName": "dataset",
        "leftBarLabel": "Chart Parameters",
        "topBar": "STD_FORM",
        "topBarParams": [],
        "leftBarParams": [
            {
                "name": "value_column",
                "type": "DATASET_COLUMN",
                "datasetParamName": "dataset",
                "label": "Value Column",
                "description": "Column containing values to plot",
                "mandatory": true
            },
            {
                "name": "category_column",
                "type": "DATASET_COLUMN",
                "datasetParamName": "dataset",
                "label": "Category Column",
                "description": "Column for categories/labels",
                "mandatory": true
            },
            {
                "name": "color_scheme",
                "type": "SELECT",
                "label": "Color Scheme",
                "selectChoices": [
                    {"value": "blues", "label": "Blues"},
                    {"value": "reds", "label": "Reds"},
                    {"value": "viridis", "label": "Viridis"}
                ],
                "defaultValue": "blues"
            }
        ],
        "canFilter": false,
        "canFacet": false
    }
}
```

### Key Chart Configuration Fields

| Field | Description |
|-------|-------------|
| `datasetParamName` | Name of the dataset parameter (usually "dataset") |
| `leftBarLabel` | Label for the left panel |
| `leftBarParams` | Parameters shown in left panel |
| `topBarParams` | Parameters shown in top bar |
| `topBar` | Top bar type: `STD_FORM`, `NONE` |
| `canFilter` | Enable filtering (default: false) |
| `canFacet` | Enable faceting (default: false) |

---

## Backend Code (backend.py)

### Plotly Chart Example

```python
import dataiku
from flask import request
import json
import plotly.express as px
import plotly.graph_objects as go
import traceback
import logging

logger = logging.getLogger(__name__)

@app.route('/get_chart')
def get_chart():
    """Generate Plotly chart from dataset."""
    try:
        # Get parameters from request
        dataset_name = request.args.get('dataset_name')
        value_col = request.args.get('value_column')
        category_col = request.args.get('category_column')
        color_scheme = request.args.get('color_scheme', 'blues')

        # Load data
        df = dataiku.Dataset(dataset_name).get_dataframe()

        # Validate columns exist
        if value_col not in df.columns:
            return json.dumps({"error": f"Column {value_col} not found"}), 400
        if category_col not in df.columns:
            return json.dumps({"error": f"Column {category_col} not found"}), 400

        # Create Plotly figure
        fig = px.bar(
            df,
            x=category_col,
            y=value_col,
            color_discrete_sequence=px.colors.sequential.__dict__.get(color_scheme.capitalize(), px.colors.sequential.Blues)
        )

        fig.update_layout(
            title=f"{value_col} by {category_col}",
            xaxis_title=category_col,
            yaxis_title=value_col
        )

        # Return as JSON (Plotly format)
        return json.dumps(fig.to_dict())

    except Exception as e:
        logger.error(traceback.format_exc())
        return json.dumps({"error": str(e)}), 500


@app.route('/get_data')
def get_data():
    """Return raw data for custom processing."""
    try:
        dataset_name = request.args.get('dataset_name')
        columns = request.args.getlist('columns')

        df = dataiku.Dataset(dataset_name).get_dataframe()

        if columns:
            df = df[columns]

        return df.to_json(orient='records')

    except Exception as e:
        logger.error(traceback.format_exc())
        return json.dumps({"error": str(e)}), 500
```

### Hierarchical Chart Example (Sunburst/Treemap)

```python
import dataiku
from flask import request
import json
import pandas as pd
import traceback
import logging

logger = logging.getLogger(__name__)

def build_hierarchy(df, unit_column, parent_column, value_column):
    """Build hierarchical structure for Plotly treemap/sunburst."""
    df_clean = df.dropna(subset=[unit_column, parent_column]).copy()

    # Find root nodes (parents that aren't children)
    units = set(df_clean[unit_column])
    parents = set(df_clean[parent_column])
    roots = parents - units

    # Add root entries
    root_rows = pd.DataFrame({
        unit_column: list(roots),
        parent_column: [''] * len(roots),
        value_column: [0] * len(roots)
    })

    df_complete = pd.concat([df_clean, root_rows], ignore_index=True)

    return df_complete

@app.route('/get_hierarchy_data')
def get_hierarchy_data():
    try:
        dataset_name = request.args.get('dataset_name')
        unit_col = request.args.get('unit_column')
        parent_col = request.args.get('parent_column')
        value_col = request.args.get('value_column')

        df = dataiku.Dataset(dataset_name).get_dataframe(
            columns=[unit_col, parent_col, value_col]
        )

        # Validate no negative values
        if (df[value_col] < 0).any():
            return json.dumps({"error": "Value column contains negative values"}), 400

        hierarchy_df = build_hierarchy(df, unit_col, parent_col, value_col)

        result = {
            'labels': hierarchy_df[unit_col].tolist(),
            'parents': hierarchy_df[parent_col].tolist(),
            'values': hierarchy_df[value_col].tolist()
        }

        return json.dumps(result)

    except Exception as e:
        logger.error(traceback.format_exc())
        return json.dumps({"error": str(e)}), 500
```

---

## Standard Webapp (Non-Chart)

For full control over the UI, use a standard webapp without the `chart` configuration.

### webapp.json

```json
{
    "meta": {
        "label": "Custom Dashboard",
        "description": "Full custom webapp",
        "icon": "fas fa-tachometer-alt"
    },
    "baseType": "STANDARD",
    "hasBackend": "true",
    "standardWebAppLibraries": ["jquery", "dataiku", "bootstrap", "font_awesome"],

    "params": [
        {
            "name": "input_dataset",
            "type": "DATASET",
            "label": "Dataset",
            "description": "Dataset to visualize",
            "mandatory": true,
            "canSelectForeign": true
        },
        {
            "name": "title",
            "type": "STRING",
            "label": "Dashboard Title",
            "defaultValue": "My Dashboard"
        }
    ],

    "roles": [
        {"type": "DATASET", "targetParamsKey": "input_dataset"}
    ]
}
```

### backend.py

```python
import dataiku
from dataiku.webapps import get_webapp_config
from flask import render_template
import json

@app.route('/api/data')
def get_data():
    config = get_webapp_config()
    dataset_name = config['input_dataset']

    df = dataiku.Dataset(dataset_name).get_dataframe()
    return df.to_json(orient='records')

@app.route('/api/config')
def get_config():
    config = get_webapp_config()
    return json.dumps({
        'title': config.get('title', 'Dashboard'),
        'dataset': config.get('input_dataset')
    })
```

---

## Bokeh Webapp

For Bokeh-specific visualizations.

### webapp.json

```json
{
    "meta": {
        "label": "Bokeh Chart",
        "description": "Interactive Bokeh visualization",
        "icon": "fas fa-chart-bar"
    },
    "baseType": "BOKEH",
    "hasBackend": "true",
    "noJSSecurity": "true",
    "standardWebAppLibraries": null,

    "params": [
        {
            "name": "input_dataset",
            "type": "DATASET",
            "label": "Dataset",
            "mandatory": true,
            "canSelectForeign": true
        },
        {
            "name": "x_column",
            "type": "DATASET_COLUMN",
            "datasetParamName": "input_dataset",
            "label": "X Axis",
            "mandatory": true
        },
        {
            "name": "y_column",
            "type": "DATASET_COLUMN",
            "datasetParamName": "input_dataset",
            "label": "Y Axis",
            "mandatory": true
        }
    ],

    "roles": [
        {"type": "DATASET", "targetParamsKey": "input_dataset"}
    ]
}
```

### backend.py (Bokeh)

```python
import dataiku
from dataiku.webapps import get_webapp_config
from bokeh.plotting import figure
from bokeh.io import curdoc
from bokeh.models import ColumnDataSource

def create_figure():
    config = get_webapp_config()

    dataset_name = config['input_dataset']
    x_col = config['x_column']
    y_col = config['y_column']

    df = dataiku.Dataset(dataset_name).get_dataframe()

    source = ColumnDataSource(df)

    p = figure(
        title=f"{y_col} vs {x_col}",
        x_axis_label=x_col,
        y_axis_label=y_col,
        tools="pan,wheel_zoom,box_zoom,reset,save"
    )

    p.circle(x=x_col, y=y_col, source=source, size=10, alpha=0.6)

    return p

curdoc().add_root(create_figure())
```

**Note:** Add `bokeh` to requirements.txt for Bokeh webapps.

---

## Code Environment Setup

For webapps using external libraries, update `code-env/python/spec/requirements.txt`:

```
# For Plotly charts
plotly>=5.0.0

# For Bokeh charts
bokeh>=3.0.0

# Common data processing
pandas>=1.0.0
numpy>=1.20.0
```

---

## Best Practices

### 1. Use Plotly for Offline Charts

Plotly works entirely client-side once data is loaded - no internet required for rendering.

```python
import plotly.express as px

# Simple and effective
fig = px.bar(df, x='category', y='value')
fig = px.scatter(df, x='x', y='y', color='group')
fig = px.line(df, x='date', y='value')
fig = px.pie(df, values='count', names='category')
fig = px.treemap(df, path=['parent', 'child'], values='value')
fig = px.sunburst(df, path=['level1', 'level2'], values='value')
```

### 2. Handle Errors Gracefully

```python
@app.route('/get_data')
def get_data():
    try:
        # Your code
        return json.dumps(result)
    except ValueError as e:
        logger.warning(f"Validation error: {e}")
        return json.dumps({"error": str(e)}), 400
    except Exception as e:
        logger.error(traceback.format_exc())
        return json.dumps({"error": "Internal error occurred"}), 500
```

### 3. Limit Data Size

```python
@app.route('/get_data')
def get_data():
    dataset_name = request.args.get('dataset_name')
    max_rows = int(request.args.get('max_rows', 10000))

    df = dataiku.Dataset(dataset_name).get_dataframe()

    if len(df) > max_rows:
        logger.warning(f"Sampling {max_rows} rows from {len(df)}")
        df = df.sample(n=max_rows)

    return df.to_json(orient='records')
```

### 4. Column Validation

```python
def validate_columns(df, required_columns):
    """Validate that required columns exist in dataframe."""
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {', '.join(missing)}")
```

---

## Complete Example: Sunburst Chart

### webapp.json

```json
{
    "meta": {
        "label": "Sunburst",
        "description": "Visualize hierarchies using nested circles",
        "icon": "fas fa-sun"
    },
    "baseType": "STANDARD",
    "hasBackend": "true",
    "standardWebAppLibraries": ["jquery", "dataiku", "bootstrap", "font_awesome"],

    "chart": {
        "datasetParamName": "dataset",
        "leftBarLabel": "Chart parameters",
        "topBarParams": [],
        "topBar": "STD_FORM",
        "leftBarParams": [
            {
                "name": "unit",
                "type": "DATASET_COLUMN",
                "datasetParamName": "dataset",
                "label": "Unit column",
                "description": "The node identifier",
                "mandatory": true
            },
            {
                "name": "parent",
                "type": "DATASET_COLUMN",
                "datasetParamName": "dataset",
                "label": "Parent column",
                "description": "The parent node identifier",
                "mandatory": true
            },
            {
                "name": "value",
                "type": "DATASET_COLUMN",
                "datasetParamName": "dataset",
                "label": "Value column",
                "description": "The numeric value for sizing",
                "mandatory": true
            }
        ],
        "canFilter": false,
        "canFacet": false
    }
}
```

### backend.py

```python
import dataiku
from flask import request
import pandas as pd
import json
import traceback
import logging

logger = logging.getLogger(__name__)

def build_complete_df(df, unit_column, parent_column, size_column):
    """Build complete hierarchy with root node."""
    df_copy = df.dropna(how='any').copy()

    unit_set = set(df_copy[unit_column])
    parent_set = set(df_copy[parent_column])

    # Find orphan parents (need to connect to root)
    orphans = parent_set - unit_set

    # Add orphan -> root connections
    orphan_rows = pd.DataFrame({
        unit_column: list(orphans),
        parent_column: ['root'] * len(orphans),
        size_column: [0] * len(orphans)
    })

    # Add root node
    root_row = pd.DataFrame({
        unit_column: ['root'],
        parent_column: [None],
        size_column: [0]
    })

    return pd.concat([df_copy, orphan_rows, root_row], ignore_index=True)

@app.route('/reformat_data')
def reformat_data():
    try:
        dataset_name = request.args.get('dataset_name')
        unit_column = request.args.get('unit_column')
        parent_column = request.args.get('parent_column')
        size_column = request.args.get('size_column')

        df = dataiku.Dataset(dataset_name).get_dataframe(
            columns=[unit_column, parent_column, size_column]
        )

        # Validate no negative values
        if (df[size_column] < 0).any():
            raise ValueError('Value column contains negative values')

        hierarchy_df = build_complete_df(df, unit_column, parent_column, size_column)

        # Return Plotly-compatible format
        result = {
            'ids': hierarchy_df[unit_column].tolist(),
            'labels': hierarchy_df[unit_column].tolist(),
            'parents': hierarchy_df[parent_column].fillna('').tolist(),
            'values': hierarchy_df[size_column].tolist()
        }

        return json.dumps(result)

    except Exception as e:
        logger.error(traceback.format_exc())
        return str(e), 500
```

---

## Folder Structure

```
webapps/
└── sunburst-chart/
    ├── webapp.json
    └── backend.py
```

**Note:** Webapp folder names do not need to start with plugin ID (unlike recipes).

---

## JavaScript Frontend

For webapps with custom JavaScript, these patterns ensure reliable initialization and communication with the backend.

### Backend Communication Helper

Standard Dataiku JS libraries (`standardWebAppLibraries: ["dataiku"]`) provide the core `dataiku` object, but do **not** provide `dataiku.webappBackend` for convenient backend communication.

**Solution:** Create a helper file (`dku-helpers.js`) loaded before your main script:

```javascript
(function() {
    'use strict';

    if (typeof dataiku === 'undefined') {
        console.error("Dataiku standard library not loaded.");
        return;
    }

    if (!dataiku.webappBackend) {
        dataiku.webappBackend = {
            getUrl: function(path) {
                return dataiku.getWebAppBackendUrl(path);
            },
            get: function(path, params) {
                let url = this.getUrl(path);
                if (params && Object.keys(params).length > 0) {
                    const qs = Object.keys(params).map(k =>
                        encodeURIComponent(k) + '=' + encodeURIComponent(params[k])
                    ).join('&');
                    url += (url.indexOf('?') === -1 ? '?' : '&') + qs;
                }
                return fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                }).then(r => r.json());
            }
        };
    }
})();
```

**Load order in body.html:**
```html
<script src="/plugins/PLUGIN_ID/resource/webapp/dku-helpers.js"></script>
<!-- app.js is auto-loaded by Dataiku after this -->
```

### Auto-Loading Behavior

Dataiku "Standard" webapps (`"baseType": "STANDARD"`) automatically load:

| File | Auto-loaded? |
|------|--------------|
| `webapps/{id}/app.js` | **Yes** |
| `webapps/{id}/style.css` | **Not reliably** (DSS version dependent) |
| jQuery, Dataiku JS API | If in `standardWebAppLibraries` |

**Do NOT manually add `<script src="app.js">` in body.html** - it will execute twice.

### CSS Loading

For reliable CSS loading, use the `resource/` folder with explicit link:

```html
<!-- body.html -->
<link rel="stylesheet" href="/plugins/PLUGIN_ID/resource/webapp/style.css">
```

### Common Pitfall: Duplicate Scripts

If you have files in both `webapps/{id}/` and `resource/webapp/`:

**Symptoms:**
- Console logs appear twice from different line numbers
- Changes don't seem to apply (editing wrong file)
- Race conditions where UI flickers

**Solution:**
1. Decide on a single source of truth
2. Remove or sync duplicates
3. Check browser Network tab to confirm which file loads

### Filter State Initialization

`dataiku.getWebAppConfig()` does **not** include filter state. Using it causes a "flash of unfiltered content."

```javascript
// BAD - Renders with empty filters
const config = dataiku.getWebAppConfig()['webAppConfig'];
initializeChart(config, []); // Filters missing!

// GOOD - Wait for parent frame with filters
showLoading();
window.parent.postMessage("sendConfig", "*");

window.addEventListener('message', function(event) {
    const data = JSON.parse(event.data);
    initializeChart(data['webAppConfig'], data['filters']);
});
```

### External Library Rendering

Libraries like D3, Frappe Gantt perform their own DOM manipulation. To apply custom styling after library renders, use `requestAnimationFrame`:

```javascript
ganttInstance = new Gantt("#gantt", tasks, options);

// Defer custom adjustments until after library render
requestAnimationFrame(() => {
    enforceCustomStyles();
});
```

Without this, your adjustments may be overwritten by the library's render cycle.

---

## Gotchas & Common Issues

Hard-won lessons from production webapp development.

### Development Environment

#### Committed Code Only

Dataiku loads plugin code from the **committed** state in Git, not your working directory.

```bash
# Changes won't appear until committed
git add .
git commit -m "Fix bug"
# NOW refresh the webapp in DSS
```

**Symptom:** "I changed the code but nothing happened"
**Fix:** Commit changes, then reload plugin or refresh browser

#### The "Two app.js" Problem

For `STANDARD` webapps, Dataiku automatically injects `webapps/{id}/app.js`. Do NOT manually include it:

```html
<!-- body.html -->
<!-- BAD - app.js runs twice, causing race conditions -->
<script src="app.js"></script>

<!-- GOOD - Dataiku auto-loads app.js, only add helpers -->
<script src="/plugins/PLUGIN_ID/resource/webapp/dku-helpers.js"></script>
```

**Symptoms:**
- Console logs appear twice
- Event handlers fire twice
- Flickering UI

### Iframe Context

Webapps run inside an iframe:

```javascript
// document refers to the iframe, not parent
document.querySelector('.my-element')  // Searches iframe only

// Access parent window (if same origin)
window.parent.postMessage("sendConfig", "*");
```

**Implications:**
- Browser console queries from parent return empty
- Debug logging must be in your code, not browser console
- Some browser APIs may be restricted

### HTML Fragments

`body.html` is injected into Dataiku's wrapper - it's NOT a standalone document:

```html
<!-- WRONG - Triggers Quirks Mode warning -->
<!DOCTYPE html>
<html>
<body>
    <div id="chart"></div>
</body>
</html>

<!-- CORRECT - Just the fragment -->
<link rel="stylesheet" href="/plugins/PLUGIN_ID/resource/webapp/style.css">
<div id="chart"></div>
```

### Configuration Lifecycle

#### No Auto-Heartbeat

Dataiku does NOT automatically push config updates. You must request them:

```javascript
// Request config from parent frame
window.parent.postMessage("sendConfig", "*");

// Listen for response
window.addEventListener('message', function(event) {
    if (event.data) {
        const data = JSON.parse(event.data);
        handleConfig(data['webAppConfig'], data['filters']);
    }
});
```

**Note:** "Keep alive" pings every 10s don't include config - only real user changes trigger config messages.

### Icons

FontAwesome classes (`fas fa-*`) don't work in webapp context:

```html
<!-- WRONG - FontAwesome not loaded -->
<i class="fas fa-chart-bar"></i>

<!-- CORRECT - Inline SVG -->
<svg viewBox="0 0 512 512" width="16" height="16">
    <path fill="currentColor" d="M..."/>
</svg>
```

**Exception:** FontAwesome works in `plugin.json` icon field.

### File Structure

Static assets must be in `resource/` folder to be web-accessible:

```
resource/
├── webapp/
│   ├── style.css      ← Link from body.html
│   └── dku-helpers.js ← Load before app.js
```

**Path:** `/plugins/PLUGIN_ID/resource/webapp/file.css`

---

## Chart-Specific Configuration

### Parameter Organization

Use SEPARATORs to group related parameters:

```json
{
    "leftBarParams": [
        {"type": "SEPARATOR", "label": "Data Mapping"},
        {"name": "x_column", "type": "DATASET_COLUMN", ...},
        {"name": "y_column", "type": "DATASET_COLUMN", ...},

        {"type": "SEPARATOR", "label": "Appearance"},
        {"name": "color_scheme", "type": "SELECT", ...},
        {"name": "show_legend", "type": "BOOLEAN", ...}
    ]
}
```

### Multi-Column Selection

`DATASET_COLUMNS` (plural) provides drag-to-reorder multi-select:

```json
{
    "name": "tooltip_fields",
    "type": "DATASET_COLUMNS",
    "datasetParamName": "dataset",
    "label": "Tooltip Fields",
    "description": "Columns to show in tooltips (drag to reorder)"
}
```

### Pandas Type Coercion

NaN values in Pandas columns coerce integers to floats:

```python
# ID column with NaN: [1, 2, NaN] becomes [1.0, 2.0, NaN]
# String matching "1" vs "1.0" fails!

# Fix: Normalize IDs to strings
df['id'] = df['id'].apply(lambda x: str(int(x)) if pd.notna(x) and x == int(x) else str(x))
```

### CSS Auto-Loading

Dataiku does NOT reliably auto-load `style.css` from `webapps/{id}/`:

```html
<!-- body.html - Always link explicitly from resource/ -->
<link rel="stylesheet" href="/plugins/PLUGIN_ID/resource/webapp/style.css">
```

---

## Related

- [Parameters Reference](../reference/parameters.md) - All parameter types including PRESET
- [Plugin Overview](plugin-overview.md) - General plugin architecture
- [Frappe Gantt Reference](../reference/frappe-gantt.md) - Library-specific patterns
