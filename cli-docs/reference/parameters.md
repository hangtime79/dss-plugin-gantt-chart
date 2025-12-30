# Parameters Reference

Complete reference for all parameter types available in Dataiku plugin configurations.

---

## Common Fields

All parameters share these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Internal identifier (used in code) |
| `label` | string | No | Display name in UI |
| `description` | string | No | Help text shown to users |
| `type` | string | Yes | Parameter type (see below) |
| `mandatory` | boolean | No | Whether required (default: false) |
| `defaultValue` | varies | No | Default value |
| `visibilityCondition` | string | No | JavaScript expression for conditional display |

---

## Basic Types

### STRING

Single-line text input.

```json
{
    "name": "my_string",
    "label": "Text Input",
    "type": "STRING",
    "description": "Enter some text",
    "defaultValue": "default value",
    "mandatory": true
}
```

**Reading in Python:**
```python
value = config.get('my_string', 'default')
```

---

### STRINGS

Multiple string values (list).

```json
{
    "name": "my_strings",
    "label": "Multiple Values",
    "type": "STRINGS",
    "description": "Enter multiple values",
    "defaultValue": ["value1", "value2"]
}
```

**Reading in Python:**
```python
values = config.get('my_strings', [])  # Returns list
```

---

### INT

Integer number.

```json
{
    "name": "my_int",
    "label": "Count",
    "type": "INT",
    "defaultValue": 10,
    "mandatory": true
}
```

**Reading in Python:**
```python
# Note: JSON returns floats, so cast to int
value = int(config.get('my_int', 10))
```

---

### DOUBLE

Floating-point number.

```json
{
    "name": "my_double",
    "label": "Threshold",
    "type": "DOUBLE",
    "defaultValue": 0.5
}
```

**Reading in Python:**
```python
value = float(config.get('my_double', 0.5))
```

---

### DOUBLES

Multiple numeric values (for grid search in ML algorithms).

```json
{
    "name": "learning_rates",
    "label": "Learning Rates",
    "type": "DOUBLES",
    "defaultValue": [0.01, 0.1, 1.0],
    "allowDuplicates": false,
    "gridParam": true
}
```

---

### BOOLEAN

True/False toggle.

```json
{
    "name": "my_bool",
    "label": "Enable Feature",
    "type": "BOOLEAN",
    "defaultValue": true
}
```

**Reading in Python:**
```python
value = config.get('my_bool', True)  # Returns Python bool
```

---

### TEXTAREA

Multi-line text input.

```json
{
    "name": "my_text",
    "label": "Description",
    "type": "TEXTAREA",
    "defaultValue": "Enter\nmultiple\nlines"
}
```

---

### PASSWORD

Masked text input (for secrets).

```json
{
    "name": "api_key",
    "label": "API Key",
    "type": "PASSWORD",
    "mandatory": true
}
```

---

## Selection Types

### SELECT

Single-choice dropdown.

```json
{
    "name": "method",
    "label": "Method",
    "type": "SELECT",
    "selectChoices": [
        {"value": "option_a", "label": "Option A"},
        {"value": "option_b", "label": "Option B"},
        {"value": "option_c", "label": "Option C"}
    ],
    "defaultValue": "option_a"
}
```

**Reading in Python:**
```python
method = config.get('method', 'option_a')  # Returns the value, not label
```

---

### MULTISELECT

Multiple-choice selection.

```json
{
    "name": "features",
    "label": "Features to Enable",
    "type": "MULTISELECT",
    "selectChoices": [
        {"value": "feature1", "label": "Feature 1"},
        {"value": "feature2", "label": "Feature 2"},
        {"value": "feature3", "label": "Feature 3"}
    ],
    "defaultValue": ["feature1", "feature2"]
}
```

**Reading in Python:**
```python
features = config.get('features', [])  # Returns list of selected values
```

---

## Dataiku Object Types

### DATASET

Dataset selector.

```json
{
    "name": "input_dataset",
    "label": "Input Dataset",
    "type": "DATASET",
    "description": "Select a dataset",
    "mandatory": true,
    "canSelectForeign": true
}
```

| Field | Description |
|-------|-------------|
| `canSelectForeign` | Allow selecting datasets from other projects |

**Reading in Python:**
```python
dataset_name = config.get('input_dataset')
dataset = dataiku.Dataset(dataset_name)
```

---

### DATASETS

Multiple dataset selector.

```json
{
    "name": "input_datasets",
    "label": "Input Datasets",
    "type": "DATASETS",
    "mandatory": true
}
```

**Reading in Python:**
```python
dataset_names = config.get('input_datasets', [])
for name in dataset_names:
    dataset = dataiku.Dataset(name)
```

---

### DATASET_COLUMN

Column selector from a dataset.

```json
{
    "name": "target_column",
    "label": "Target Column",
    "type": "DATASET_COLUMN",
    "datasetParamName": "input_dataset",
    "mandatory": true
}
```

| Field | Description |
|-------|-------------|
| `datasetParamName` | Name of the DATASET parameter to get columns from |

**Reading in Python:**
```python
column_name = config.get('target_column')
```

---

### DATASET_COLUMNS

Multiple column selector.

```json
{
    "name": "feature_columns",
    "label": "Feature Columns",
    "type": "DATASET_COLUMNS",
    "datasetParamName": "input_dataset"
}
```

**Reading in Python:**
```python
columns = config.get('feature_columns', [])
```

---

### COLUMN (Recipe-Specific)

Column selector in recipes (uses role, not dataset name).

```json
{
    "name": "target_column",
    "label": "Target Column",
    "type": "COLUMN",
    "columnRole": "input_role_name"
}
```

| Field | Description |
|-------|-------------|
| `columnRole` | Name of the input role (from `inputRoles`) |

---

### COLUMNS (Recipe-Specific)

Multiple columns from an input role.

```json
{
    "name": "feature_columns",
    "label": "Feature Columns",
    "type": "COLUMNS",
    "columnRole": "input_role_name"
}
```

---

### MANAGED_FOLDER

Managed folder selector.

```json
{
    "name": "output_folder",
    "label": "Output Folder",
    "type": "MANAGED_FOLDER",
    "canSelectForeign": false
}
```

**Reading in Python:**
```python
folder_id = config.get('output_folder')
folder = dataiku.Folder(folder_id)
```

---

### SAVED_MODEL

Saved model selector.

```json
{
    "name": "model",
    "label": "Prediction Model",
    "type": "SAVED_MODEL"
}
```

---

## Advanced Types

### MAP

Key-value pairs.

```json
{
    "name": "custom_headers",
    "label": "Custom Headers",
    "type": "MAP"
}
```

**Reading in Python:**
```python
headers = config.get('custom_headers', {})
# Returns dict like {"key1": "value1", "key2": "value2"}
```

---

### KEY_VALUE_LIST

List of key-value pairs.

```json
{
    "name": "parameters",
    "label": "Parameters",
    "type": "KEY_VALUE_LIST"
}
```

---

### PRESET

Reference to a parameter set preset. Allows users to select admin-defined configurations.

```json
{
    "name": "connection_preset",
    "label": "Connection Settings",
    "type": "PRESET",
    "parameterSetId": "my-connection-settings"
}
```

#### PRESET Resolution in Webapps

**Important:** Unlike recipes/connectors where Dataiku auto-resolves PRESETs to dicts, webapps receive a **raw reference**:

```python
# What you expect (works in recipes)
preset_config = config.get('customPalettePreset')
colors = preset_config.get('colors')  # Works!

# What you actually get in webapps
preset_config = config.get('customPalettePreset')
# preset_config = {"mode": "PRESET", "name": "PRESET_3"}
colors = preset_config.get('colors')  # Returns None!
```

**Solution:** Manually resolve PRESET references via API:

```python
def resolve_preset(preset_ref, parameter_set_id, plugin_id):
    """Resolve a webapp PRESET parameter to its actual values."""
    if not preset_ref:
        return None

    mode = preset_ref.get('mode')

    if mode == 'INLINE':
        # Values embedded directly
        return {k: v for k, v in preset_ref.items() if k != 'mode'}

    elif mode == 'PRESET':
        # Must resolve via API
        preset_name = preset_ref.get('name')
        if not preset_name:
            return None

        import dataiku
        client = dataiku.api_client()
        plugin = client.get_plugin(plugin_id)
        settings = plugin.get_settings()
        parameter_set = settings.get_parameter_set(parameter_set_id)
        preset = parameter_set.get_preset(preset_name)

        if preset:
            # IMPORTANT: config is a PROPERTY, not a method!
            return preset.config  # NOT preset.get_config()
        return None

    else:
        # Direct values (no mode key)
        return preset_ref
```

**Common Mistake:**

```python
# WRONG - get_config() doesn't exist
values = preset.get_config()  # AttributeError!

# CORRECT - config is a property
values = preset.config  # Returns dict
```

---

### CREDENTIAL_REQUEST

Request for credentials (OAuth, etc.).

```json
{
    "name": "oauth_credentials",
    "label": "OAuth Credentials",
    "type": "CREDENTIAL_REQUEST",
    "credentialRequestSettings": {
        "type": "OAUTH2",
        "oAuth2Type": "CLIENT_CREDENTIALS"
    }
}
```

---

## Visibility Conditions

Control when parameters are shown using JavaScript expressions.

```json
{
    "name": "advanced_mode",
    "type": "BOOLEAN",
    "defaultValue": false
},
{
    "name": "advanced_setting",
    "type": "STRING",
    "visibilityCondition": "model.advanced_mode == true"
}
```

### Common Conditions

```json
// Show when boolean is true
"visibilityCondition": "model.my_bool == true"

// Show when select has specific value
"visibilityCondition": "model.method == 'custom'"

// Show when string is not empty
"visibilityCondition": "model.my_string.length > 0"

// Combine conditions
"visibilityCondition": "model.enabled == true && model.type == 'advanced'"
```

---

## Parameter Groups (Separators)

Use SEPARATOR to organize parameters visually.

```json
{
    "name": "sep1",
    "label": "Input Settings",
    "type": "SEPARATOR"
},
{
    "name": "input_param",
    "type": "STRING"
},
{
    "name": "sep2",
    "label": "Output Settings",
    "type": "SEPARATOR"
},
{
    "name": "output_param",
    "type": "STRING"
}
```

---

## Complete Example

```json
{
    "params": [
        {
            "name": "sep_input",
            "label": "Input Configuration",
            "type": "SEPARATOR"
        },
        {
            "name": "input_dataset",
            "label": "Input Dataset",
            "type": "DATASET",
            "mandatory": true
        },
        {
            "name": "target_column",
            "label": "Target Column",
            "type": "DATASET_COLUMN",
            "datasetParamName": "input_dataset",
            "mandatory": true
        },
        {
            "name": "sep_processing",
            "label": "Processing Options",
            "type": "SEPARATOR"
        },
        {
            "name": "method",
            "label": "Method",
            "type": "SELECT",
            "selectChoices": [
                {"value": "simple", "label": "Simple"},
                {"value": "advanced", "label": "Advanced"}
            ],
            "defaultValue": "simple"
        },
        {
            "name": "threshold",
            "label": "Threshold",
            "type": "DOUBLE",
            "defaultValue": 0.5,
            "visibilityCondition": "model.method == 'advanced'"
        },
        {
            "name": "iterations",
            "label": "Iterations",
            "type": "INT",
            "defaultValue": 100,
            "visibilityCondition": "model.method == 'advanced'"
        },
        {
            "name": "sep_output",
            "label": "Output Options",
            "type": "SEPARATOR"
        },
        {
            "name": "include_stats",
            "label": "Include Statistics",
            "type": "BOOLEAN",
            "defaultValue": true
        }
    ]
}
```

---

## Reading Parameters in Python

### In Recipes

```python
from dataiku.customrecipe import get_recipe_config

config = get_recipe_config()
my_param = config.get('my_param', 'default')
my_int = int(config.get('my_int', 10))
my_bool = config.get('my_bool', False)
```

### In Webapps

```python
from dataiku.webapps import get_webapp_config

config = get_webapp_config()
dataset_name = config['input_dataset']
```

### In Macros

```python
class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.my_param = config.get('my_param', 'default')
```

### In Connectors

```python
class MyConnector(Connector):
    def __init__(self, config, plugin_config):
        self.my_param = config.get('my_param', 'default')
```

---

## Type Conversion Details

For complete type mapping (what Python types you receive for each parameter type), PRESET access patterns, and CREDENTIAL_REQUEST handling, see:

- [Type Conversions Reference](type-conversions.md) - Full type mapping table
- [Edge Cases Reference](edge-cases.md) - Handling empty/null values
