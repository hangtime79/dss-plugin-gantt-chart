# Custom Recipes Guide

Custom recipes extend Dataiku's data processing capabilities. They appear in the Flow alongside built-in recipes and can process datasets, managed folders, or saved models.

---

## Overview

A custom recipe consists of two files in `custom-recipes/{plugin-id}-{recipe-name}/`:
- **recipe.json** - Configuration: inputs, outputs, parameters, UI metadata
- **recipe.py** - Python code that performs the processing

---

## Recipe Configuration (recipe.json)

### Complete Structure

```json
{
    "meta": {
        "label": "Your Recipe Label",
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
            "acceptsDataset": true,
            "acceptsManagedFolder": false,
            "acceptsSavedModel": false
        }
    ],
    "selectableFromDataset": "input_dataset",
    "outputRoles": [
        {
            "name": "output_dataset",
            "label": "Output Dataset",
            "description": "The result dataset",
            "arity": "UNARY",
            "required": true,
            "acceptsDataset": true
        }
    ],
    "params": [
        {
            "name": "my_string_param",
            "label": "String Parameter",
            "type": "STRING",
            "description": "A text parameter",
            "mandatory": false,
            "defaultValue": "default"
        },
        {
            "name": "my_int_param",
            "label": "Integer Parameter",
            "type": "INT",
            "defaultValue": 10
        },
        {
            "name": "my_select_param",
            "label": "Select Option",
            "type": "SELECT",
            "selectChoices": [
                {"value": "option_a", "label": "Option A"},
                {"value": "option_b", "label": "Option B"}
            ],
            "defaultValue": "option_a"
        },
        {
            "name": "column_param",
            "label": "Column to Process",
            "type": "COLUMN",
            "columnRole": "input_dataset"
        }
    ],
    "resourceKeys": []
}
```

### Meta Section

| Field | Description | Required |
|-------|-------------|----------|
| `label` | Recipe name in UI (keep short) | Yes |
| `description` | Help text for users | Yes |
| `icon` | [FontAwesome 5.15.4 icon](../reference/fontawesome-5.15.4.md) | Yes |

### Input/Output Roles

| Field | Description | Values |
|-------|-------------|--------|
| `name` | Variable name in code | Any valid identifier |
| `label` | UI display name | Any text |
| `description` | Help text | Any text |
| `arity` | Single or multiple | `UNARY` or `NARY` |
| `required` | Must be provided | `true` or `false` |
| `acceptsDataset` | Can use datasets | `true` (default) or `false` |
| `acceptsManagedFolder` | Can use folders | `true` or `false` (default) |
| `acceptsSavedModel` | Can use models | `true` or `false` (default) |

### Making Recipe Selectable from Flow

Add one of these fields to make the recipe appear when selecting an item:

```json
"selectableFromDataset": "input_role_name",
"selectableFromFolder": "folder_role_name",
"selectableFromSavedModel": "model_role_name"
```

---

## Recipe Code (recipe.py)

### Basic Template

```python
import dataiku
from dataiku.customrecipe import get_input_names_for_role
from dataiku.customrecipe import get_output_names_for_role
from dataiku.customrecipe import get_recipe_config

# ============================================================
# READ PARAMETERS
# ============================================================
config = get_recipe_config()
my_string_param = config.get('my_string_param', 'default')
my_int_param = int(config.get('my_int_param', 10))
my_select_param = config.get('my_select_param', 'option_a')
column_param = config.get('column_param')

# ============================================================
# GET INPUT DATASETS
# ============================================================
input_names = get_input_names_for_role('input_dataset')
input_dataset = dataiku.Dataset(input_names[0])

# ============================================================
# GET OUTPUT DATASETS
# ============================================================
output_names = get_output_names_for_role('output_dataset')
output_dataset = dataiku.Dataset(output_names[0])

# ============================================================
# PROCESSING
# ============================================================
# Read input data
df = input_dataset.get_dataframe()

# Your processing logic here
result_df = df.copy()

# Example: Apply processing based on parameters
if column_param and column_param in result_df.columns:
    result_df[column_param] = result_df[column_param].apply(lambda x: x * my_int_param)

# ============================================================
# WRITE OUTPUT
# ============================================================
output_dataset.write_with_schema(result_df)
```

### Multiple Inputs (NARY)

```python
# For NARY inputs, you get a list of dataset names
input_names = get_input_names_for_role('input_datasets')  # Returns list

for name in input_names:
    dataset = dataiku.Dataset(name)
    df = dataset.get_dataframe()
    # Process each dataset...
```

### Working with Managed Folders

```python
import dataiku
from dataiku.customrecipe import get_input_names_for_role

# Get folder
folder_names = get_input_names_for_role('input_folder')
folder = dataiku.Folder(folder_names[0])

# List files
files = folder.list_paths_in_partition()

# Read a file
with folder.get_download_stream('path/to/file.csv') as f:
    content = f.read()

# Write a file
with folder.get_writer('output/file.csv') as w:
    w.write(b'some content')
```

### Working with Saved Models

```python
import dataiku
from dataiku.customrecipe import get_input_names_for_role

# Get saved model
model_names = get_input_names_for_role('input_model')
model = dataiku.Model(model_names[0])

# Get predictor for scoring
predictor = model.get_predictor()

# Make predictions
predictions = predictor.predict(df)
```

---

## Parameter Types

See [Parameters Reference](../reference/parameters.md) for complete list.

### Common Parameter Types

```json
// String
{"name": "text", "type": "STRING", "defaultValue": "hello"}

// Integer (Note: comes as float in Python, cast with int())
{"name": "count", "type": "INT", "defaultValue": 10}

// Float
{"name": "threshold", "type": "DOUBLE", "defaultValue": 0.5}

// Boolean
{"name": "enabled", "type": "BOOLEAN", "defaultValue": true}

// Dropdown
{
    "name": "method",
    "type": "SELECT",
    "selectChoices": [
        {"value": "mean", "label": "Mean"},
        {"value": "median", "label": "Median"}
    ]
}

// Multi-select
{
    "name": "columns",
    "type": "MULTISELECT",
    "selectChoices": [...]
}

// Column from input dataset
{
    "name": "target_column",
    "type": "COLUMN",
    "columnRole": "input_dataset"
}

// Multiple columns
{
    "name": "feature_columns",
    "type": "COLUMNS",
    "columnRole": "input_dataset"
}

// Dataset selector
{"name": "lookup_dataset", "type": "DATASET"}

// Large text area
{"name": "sql_query", "type": "TEXTAREA"}

// Key-value pairs
{"name": "options", "type": "MAP"}
```

---

## Best Practices

### 1. Validate Parameters Early

```python
# Validate ALL parameters before processing
config = get_recipe_config()

# Required parameters
column = config.get('column')
if not column:
    raise ValueError("Column parameter is required")

threshold = float(config.get('threshold', 0.5))
if not 0 <= threshold <= 1:
    raise ValueError("Threshold must be between 0 and 1")

# Then start processing...
```

### 2. Keep Recipe Code Short

Move business logic to `python-lib/`:

```python
# recipe.py - Keep this short!
import dataiku
from dataiku.customrecipe import get_input_names_for_role, get_output_names_for_role, get_recipe_config
from my_plugin_lib.processing import process_data  # Import from python-lib

config = get_recipe_config()
input_dataset = dataiku.Dataset(get_input_names_for_role('input')[0])
output_dataset = dataiku.Dataset(get_output_names_for_role('output')[0])

df = input_dataset.get_dataframe()
result = process_data(df, config)  # All logic in library
output_dataset.write_with_schema(result)
```

### 3. Use Logging, Not Print

```python
import logging
logging.basicConfig(level=logging.INFO, format='my-plugin %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

logger.info("Processing started")
logger.warning("Missing values detected")
logger.error("Failed to process row")
```

### 4. Handle Large Datasets

```python
# For large datasets, use chunked reading
for chunk_df in input_dataset.iter_dataframes(chunksize=10000):
    # Process chunk
    result_chunk = process(chunk_df)
    # Write incrementally
    output_dataset.write_dataframe(result_chunk)
```

---

## Complete Example: Data Clipping Recipe

This recipe clips numeric values to a specified range.

### recipe.json

```json
{
    "meta": {
        "label": "Clip Values",
        "description": "Clip numeric column values to a specified range",
        "icon": "fas fa-cut"
    },
    "kind": "PYTHON",
    "inputRoles": [
        {
            "name": "input_dataset",
            "label": "Input Dataset",
            "description": "Dataset containing values to clip",
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
            "description": "Dataset with clipped values",
            "arity": "UNARY",
            "required": true,
            "acceptsDataset": true
        }
    ],
    "params": [
        {
            "name": "column",
            "label": "Column to Clip",
            "type": "COLUMN",
            "columnRole": "input_dataset",
            "mandatory": true
        },
        {
            "name": "min_value",
            "label": "Minimum Value",
            "type": "DOUBLE",
            "description": "Values below this will be set to this value",
            "mandatory": true
        },
        {
            "name": "max_value",
            "label": "Maximum Value",
            "type": "DOUBLE",
            "description": "Values above this will be set to this value",
            "mandatory": true
        }
    ],
    "resourceKeys": []
}
```

### recipe.py

```python
import dataiku
from dataiku.customrecipe import get_input_names_for_role
from dataiku.customrecipe import get_output_names_for_role
from dataiku.customrecipe import get_recipe_config
import logging

logging.basicConfig(level=logging.INFO, format='clip-values %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Get configuration
config = get_recipe_config()
column = config.get('column')
min_value = float(config.get('min_value'))
max_value = float(config.get('max_value'))

# Validate
if not column:
    raise ValueError("Column parameter is required")
if min_value >= max_value:
    raise ValueError("Minimum value must be less than maximum value")

# Get datasets
input_dataset = dataiku.Dataset(get_input_names_for_role('input_dataset')[0])
output_dataset = dataiku.Dataset(get_output_names_for_role('output_dataset')[0])

# Process
logger.info(f"Clipping column '{column}' to range [{min_value}, {max_value}]")
df = input_dataset.get_dataframe()

if column not in df.columns:
    raise ValueError(f"Column '{column}' not found in dataset")

original_min = df[column].min()
original_max = df[column].max()
logger.info(f"Original range: [{original_min}, {original_max}]")

df[column] = df[column].clip(lower=min_value, upper=max_value)

clipped_count = ((df[column] == min_value) | (df[column] == max_value)).sum()
logger.info(f"Clipped {clipped_count} values")

# Write output
output_dataset.write_with_schema(df)
logger.info("Processing complete")
```

---

## Folder Structure

```
custom-recipes/
└── your-plugin-id-clip-values/
    ├── recipe.json
    └── recipe.py
```

**Naming Rule:** Recipe folder name MUST start with plugin ID.
