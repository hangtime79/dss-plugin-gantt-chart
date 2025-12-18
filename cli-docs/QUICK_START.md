# Quick Start - Build Your First Plugin Component

This guide gets you from zero to a working plugin component in minutes.

---

## Prerequisites

- Dataiku DSS >= 12.0
- "Develop plugins" permission
- Access to a project with "Read/Write project content" permissions

> **Recommendation:** Use a dedicated development instance to avoid affecting production.

---

## Step 1: Configure Your Plugin Identity

Edit `plugin.json` in the root folder:

```json
{
    "id": "your-plugin-id",
    "version": "0.1.0",
    "meta": {
        "label": "Your Plugin Label",
        "category": "Your category (optional)",
        "description": "Brief description of what your plugin does",
        "author": "Organization (firstName LASTNAME)",
        "icon": "fas fa-puzzle-piece",
        "licenseInfo": "Apache Software License",
        "url": "https://www.dataiku.com/product/plugins/your-plugin-id/",
        "tags": ["YourTag"],
        "supportLevel": "NOT_SUPPORTED"
    }
}
```

### Key Fields:
- **id**: Lowercase, hyphen-separated. No "plugin" or "custom" in name.
- **label**: Human-readable name shown in UI
- **icon**: FontAwesome 5.15.4 icon (see [icon list](reference/fontawesome-5.15.4.md))
- **supportLevel**: `NOT_SUPPORTED`, `TIER2_SUPPORT`, or `SUPPORTED`

---

## Step 2: Choose Your Component Type

### Option A: Custom Recipe (Most Common)

Create folder: `custom-recipes/your-plugin-id-your-recipe/`

**recipe.json:**
```json
{
    "meta": {
        "label": "Your Recipe Name",
        "description": "What this recipe does",
        "icon": "fas fa-code"
    },
    "kind": "PYTHON",
    "inputRoles": [
        {
            "name": "input_dataset",
            "label": "Input Dataset",
            "description": "The dataset to process",
            "arity": "UNARY",
            "required": true,
            "acceptsDataset": true
        }
    ],
    "selectableFromDataset": "input_dataset",
    "outputRoles": [
        {
            "name": "output_dataset",
            "label": "Output Dataset",
            "description": "The processed result",
            "arity": "UNARY",
            "required": true,
            "acceptsDataset": true
        }
    ],
    "params": [],
    "resourceKeys": []
}
```

**recipe.py:**
```python
import dataiku
from dataiku.customrecipe import get_input_names_for_role
from dataiku.customrecipe import get_output_names_for_role
from dataiku.customrecipe import get_recipe_config

# Get input/output datasets
input_names = get_input_names_for_role('input_dataset')
input_dataset = dataiku.Dataset(input_names[0])

output_names = get_output_names_for_role('output_dataset')
output_dataset = dataiku.Dataset(output_names[0])

# Read input
df = input_dataset.get_dataframe()

# Your processing logic here
result_df = df  # Replace with actual processing

# Write output
output_dataset.write_with_schema(result_df)
```

---

### Option B: Webapp Chart (Plotly Example)

Create folder: `webapps/your-chart-name/`

**webapp.json:**
```json
{
    "meta": {
        "label": "Your Chart Name",
        "description": "Interactive visualization",
        "icon": "fas fa-chart-bar"
    },
    "baseType": "STANDARD",
    "hasBackend": "true",
    "standardWebAppLibraries": ["jquery", "dataiku", "bootstrap", "font_awesome"],
    "chart": {
        "datasetParamName": "dataset",
        "leftBarLabel": "Chart parameters",
        "topBar": "STD_FORM",
        "topBarParams": [],
        "leftBarParams": [
            {
                "name": "value_column",
                "type": "DATASET_COLUMN",
                "datasetParamName": "dataset",
                "label": "Value Column",
                "mandatory": true
            },
            {
                "name": "category_column",
                "type": "DATASET_COLUMN",
                "datasetParamName": "dataset",
                "label": "Category Column",
                "mandatory": true
            }
        ],
        "canFilter": false,
        "canFacet": false
    }
}
```

**backend.py:**
```python
import dataiku
from flask import request
import json
import plotly.express as px
import traceback
import logging

logger = logging.getLogger(__name__)

@app.route('/get_chart_data')
def get_chart_data():
    try:
        dataset_name = request.args.get('dataset_name')
        value_col = request.args.get('value_column')
        category_col = request.args.get('category_column')

        df = dataiku.Dataset(dataset_name).get_dataframe()

        fig = px.bar(df, x=category_col, y=value_col)
        return json.dumps(fig.to_dict())
    except:
        logger.error(traceback.format_exc())
        return traceback.format_exc(), 500
```

**Add to code-env/python/spec/requirements.txt:**
```
plotly
```

---

## Step 3: Add Dependencies (If Needed)

Edit `code-env/python/spec/requirements.txt`:
```
plotly
pandas>=1.0.0
requests
```

Edit `code-env/python/desc.json` if needed:
```json
{
    "acceptedPythonInterpreters": ["PYTHON310", "PYTHON311", "PYTHON312"],
    "forceConda": false,
    "installCorePackages": true,
    "installJupyterSupport": false
}
```

---

## Step 4: Install and Test

### In Dataiku DSS:

1. Go to **Application Menu > Plugins**
2. Click **Add Plugin > Development > Upload**
3. Upload your plugin folder as a zip, OR use git integration
4. Click **Build New Environment** if you have dependencies

### For Development:
1. Create plugin directly in DSS: **Add Plugin > Write your own**
2. Use the built-in plugin editor
3. Click **Reload this plugin** after changes (Actions menu)

---

## Step 5: Use Your Component

### For Recipes:
1. Go to a project Flow
2. Select a dataset
3. Find your recipe in the Actions panel under "Plugin recipes"

### For Webapps:
1. Go to a project
2. Select a dataset
3. Find your webapp in the Actions panel

---

## Next Steps

- [Custom Recipes Guide](guides/custom-recipes.md) - Add parameters, multiple inputs/outputs
- [Webapps Guide](guides/webapps.md) - Advanced charts and interactivity
- [Parameters Reference](reference/parameters.md) - All parameter types
- [Testing Guide](guides/testing.md) - Add unit and integration tests

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Component not appearing | Reload plugin, refresh browser (Ctrl+R) |
| Import errors | Check requirements.txt, rebuild code environment |
| JSON parse error | Validate JSON syntax (no trailing commas, proper quotes) |
| Recipe not in dataset menu | Add `"selectableFromDataset"` field |
