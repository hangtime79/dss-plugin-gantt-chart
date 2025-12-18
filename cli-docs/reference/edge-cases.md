# Edge Cases and Error Handling

Reference for handling empty inputs, validation, and error display in plugins.

---

## Empty Input Handling

| Situation | What You Get | Check Pattern |
|-----------|--------------|---------------|
| No input dataset selected | `[]` | `if not input_names:` |
| Empty COLUMNS parameter | `[]` | `if not columns:` |
| Empty STRINGS parameter | `[]` | `if not values:` |
| Optional param not set | `None` | `if param is None:` |
| DataFrame has no rows | Empty DataFrame | `if df.empty:` |
| Column doesn't exist | KeyError on access | `if col not in df.columns:` |

---

## Validation Patterns

### Recipe Input Validation

```python
import dataiku
from dataiku.customrecipe import get_input_names_for_role, get_recipe_config

# 1. Check input dataset exists
input_names = get_input_names_for_role('input_dataset')
if not input_names:
    raise ValueError("No input dataset selected")

# 2. Read data
input_ds = dataiku.Dataset(input_names[0])
df = input_ds.get_dataframe()

# 3. Check DataFrame isn't empty
if df.empty:
    raise ValueError("Input dataset is empty")

# 4. Check required column exists
config = get_recipe_config()
column = config.get('target_column')
if column and column not in df.columns:
    raise ValueError(f"Column '{column}' not found in dataset")

# 5. Validate parameter values
threshold = config.get('threshold', 0.5)
if not 0 <= threshold <= 1:
    raise ValueError("Threshold must be between 0 and 1")
```

### Macro Validation (in __init__)

```python
class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.config = config

        # Validate required params early
        if not config.get('required_param'):
            raise ValueError("required_param is mandatory")

        # Validate PRESET is selected
        preset = config.get('connection_preset')
        if not preset:
            raise ValueError("Please select a connection preset")

        # Store validated values
        self.endpoint = preset.get('endpoint')
        if not self.endpoint:
            raise ValueError("Preset is missing endpoint configuration")
```

### Webapp Validation

```python
@app.route('/get_data')
def get_data():
    dataset_name = request.args.get('dataset_name')
    if not dataset_name:
        return json.dumps({"error": "dataset_name required"}), 400

    column = request.args.get('column')
    df = dataiku.Dataset(dataset_name).get_dataframe()

    if column and column not in df.columns:
        return json.dumps({"error": f"Column {column} not found"}), 400

    # Process...
```

---

## Error Display Behavior

### How Users See Errors

| Location | What Users See |
|----------|----------------|
| DSS UI | "Code failed, check the logs" |
| Job Logs | Full Python traceback (error highlighted red) |
| Webapp | Depends on your error handling (500 error or custom) |

### Best Practices

```python
# Good - descriptive message
raise ValueError(f"Column '{column}' not found. Available columns: {list(df.columns)}")

# Good - actionable message
raise ValueError("No credentials configured. Go to Profile > Credentials to add them.")

# Bad - generic message
raise Exception("Error occurred")
```

### Logging for Debugging

```python
import logging
logger = logging.getLogger(__name__)

logger.info(f"Processing {len(df)} rows")
logger.warning(f"Missing values in column {column}: {df[column].isna().sum()}")
logger.error(f"Failed to connect: {e}")
```

---

## Null/NaN Handling

| Pandas Value | Check | Notes |
|--------------|-------|-------|
| `NaN` | `pd.isna(value)` | Numeric null |
| `None` | `value is None` | Python None |
| `NaT` | `pd.isna(value)` | Datetime null |
| Empty string | `value == ""` | Not null, but empty |

```python
# Check for any nulls in column
if df['column'].isna().any():
    logger.warning("Column contains null values")

# Fill nulls before processing
df['column'] = df['column'].fillna(default_value)

# Drop rows with nulls
df = df.dropna(subset=['required_column'])
```

---

## Common Patterns Summary

```python
# Safe parameter access with defaults
value = config.get('param', default_value)

# Safe nested access (PRESET)
preset = config.get('preset', {})
nested = preset.get('key', default)

# Check empty list/None
if not items:  # Works for [], None, ""
    raise ValueError("No items selected")

# Validate before use
if column not in df.columns:
    raise ValueError(f"Column '{column}' not found")
```

---

See also: [Type Conversions](type-conversions.md) for parameter type details.
