# Naming Conventions & Best Practices

Mandatory naming rules and coding best practices for Dataiku plugins.

---

## Naming Rules (MUST Follow for Plugin Store)

These rules are enforced for plugins published to the Dataiku Plugin Store.

### Plugin ID

| Rule | Example |
|------|---------|
| MUST be lowercase | `my-plugin` ✓ |
| Words MUST be separated by hyphens | `my-awesome-plugin` ✓ |
| MUST NOT contain "plugin" | `my-plugin-plugin` ✗ |
| MUST NOT contain "custom" | `custom-my-plugin` ✗ |
| Word order MUST be valid English | `plugin-my` ✗ |

**Good examples:**
- `time-series-preparation`
- `geospatial-toolkit`
- `hierarchical-charts`
- `api-connector`

**Bad examples:**
- `MyPlugin` (not lowercase)
- `my_plugin` (underscores instead of hyphens)
- `custom-data-plugin` (contains "custom" and "plugin")

### Component Names (Recipes, Datasets)

| Rule | Requirement |
|------|-------------|
| MUST be lowercase | `my-plugin-compute` ✓ |
| MUST be hyphen-separated | `my-plugin-compute` ✓ |
| MUST start with plugin ID | `my-plugin-compute` ✓ |
| MUST NOT contain "recipe/dataset" | `my-plugin-recipe` ✗ |
| MUST NOT contain "custom" | `my-plugin-custom-compute` ✗ |

**Why start with plugin ID?** DSS uses the component name as the fully qualified identifier. Without the plugin prefix, component names could collide across plugins.

**Good examples:**
- `geospatial-toolkit-buffer`
- `api-connector-fetch-users`
- `time-series-preparation-resample`

**Bad examples:**
- `buffer` (missing plugin prefix)
- `geospatial-toolkit-custom-recipe` (contains "custom" and "recipe")

### Component Labels

| Rule | Requirement |
|------|-------------|
| MUST NOT contain "plugin" | ✓ |
| MUST NOT contain "custom" | ✓ |
| MUST NOT contain component type | "dataset", "recipe", etc. ✗ |
| SHOULD be as short as possible | ✓ |
| SHOULD be descriptive | ✓ |

**Good examples:**
- "Buffer Zone" (for a geospatial buffer recipe)
- "Fetch Users" (for an API recipe)
- "Resample" (for a time series recipe)

**Bad examples:**
- "Custom Buffer Recipe"
- "Geospatial Plugin Buffer"

### Tags

- DON'T use single-use tags (e.g., your company name if it's unique to your plugin)
- DO use generic, reusable tags: `API`, `Open Data`, `Productivity`, `Machine Learning`, `Visualization`

### Author Field

For Dataiku-authored plugins:
```
"author": "Dataiku (Firstname LASTNAME)"
```

For others:
```
"author": "Organization (Firstname LASTNAME)"
"author": "Your Name"
```

---

## Coding Best Practices

### Code Structure

1. **Keep recipe/webapp code SHORT**
   - Recipe code should be ~15-30 lines
   - Business logic belongs in `python-lib/`

```python
# recipe.py - GOOD (short, delegates to library)
import dataiku
from dataiku.customrecipe import *
from my_plugin_lib.processing import process_data

config = get_recipe_config()
input_ds = dataiku.Dataset(get_input_names_for_role('input')[0])
output_ds = dataiku.Dataset(get_output_names_for_role('output')[0])

df = input_ds.get_dataframe()
result = process_data(df, config)  # Logic in library
output_ds.write_with_schema(result)
```

2. **Never import dataiku in libraries**
   - Libraries in `python-lib/` should be DSS-independent
   - Makes code testable without a DSS instance

```python
# python-lib/my_plugin_lib/processing.py - GOOD
import pandas as pd

def process_data(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    """Process data - no dataiku import."""
    # Pure Python/pandas logic
    return df
```

3. **Separation of Concerns**
   - Separate data classes from processing classes
   - `MyProcessorParams` (data) + `MyProcessor` (logic)

```python
# Params class - just holds configuration
class ProcessorParams:
    def __init__(self, config):
        self.column = config.get('column')
        self.threshold = float(config.get('threshold', 0.5))

    def validate(self):
        if not self.column:
            raise ValueError("Column is required")
        if not 0 <= self.threshold <= 1:
            raise ValueError("Threshold must be between 0 and 1")

# Processor class - does the work
class Processor:
    def __init__(self, params: ProcessorParams):
        self.params = params

    def process(self, df):
        # Processing logic here
        return df
```

### Validation

1. **Validate ALL parameters before processing**

```python
# GOOD - validate early, fail fast
config = get_recipe_config()

# Validate required params
column = config.get('column')
if not column:
    raise ValueError("'column' parameter is required")

threshold = float(config.get('threshold', 0.5))
if not 0 <= threshold <= 1:
    raise ValueError("'threshold' must be between 0 and 1")

method = config.get('method', 'mean')
valid_methods = ['mean', 'median', 'mode']
if method not in valid_methods:
    raise ValueError(f"'method' must be one of: {valid_methods}")

# All validated - now start processing
df = input_dataset.get_dataframe()
# ...
```

2. **Use asserts for invariants**

```python
def process_chunk(df, params):
    assert params is not None, "params must be provided"
    assert 'column' in df.columns, f"Expected column '{params.column}'"
    # ...
```

### Naming in Code

1. **Be explicit and consistent**

```python
# GOOD
def calculate_moving_average(df, window_size, column_name):
    ...

# BAD - unclear names
def calc(d, w, c):
    ...
```

2. **Use consistent conventions**

```python
# Classes: CamelCase
class DataProcessor:
    pass

# Functions/variables: snake_case
def process_data():
    my_variable = 1

# Constants: UPPER_CASE
MAX_ROWS = 10000
DEFAULT_TIMEOUT = 30

# Private methods: leading underscore
def _internal_helper():
    pass
```

3. **Match UI and code naming**
   - If UI shows "Target Column", use `target_column` in code
   - If param is `method`, don't call variable `algorithm`

### Logging

1. **Use logging module, never print()**

```python
import logging
logging.basicConfig(
    level=logging.INFO,
    format='my-plugin %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

logger.info("Processing started")
logger.warning("Missing values detected")
logger.error("Failed to process: %s", error_msg)
logger.debug("Detailed info: %s", data)  # Only in debug mode
```

2. **Never log sensitive data**

```python
# BAD
logger.info(f"API key: {api_key}")
logger.info(f"User data: {user_data}")

# GOOD
logger.info("API connection established")
logger.info(f"Processing {len(user_data)} records")
```

### Error Handling

1. **Use specific exceptions with helpful messages**

```python
# GOOD
if column not in df.columns:
    raise ValueError(
        f"Column '{column}' not found in dataset. "
        f"Available columns: {list(df.columns)}"
    )

# BAD
if column not in df.columns:
    raise Exception("Error")
```

2. **Don't swallow exceptions silently**

```python
# BAD
try:
    result = risky_operation()
except:
    pass  # Silent failure!

# GOOD
try:
    result = risky_operation()
except SpecificException as e:
    logger.error(f"Operation failed: {e}")
    raise  # Re-raise or handle appropriately
```

### Safety

1. **Never generate code by string concatenation**

```python
# BAD - SQL injection risk
query = f"SELECT * FROM {table_name} WHERE id = {user_id}"

# GOOD - parameterized queries
query = "SELECT * FROM %s WHERE id = %%s" % table_name
cursor.execute(query, (user_id,))
```

2. **Use random seeds for reproducibility**

```python
import numpy as np

# GOOD - reproducible
np.random.seed(42)
random_values = np.random.random(100)

# Or let user configure
seed = config.get('random_seed', None)
if seed:
    np.random.seed(seed)
```

3. **Handle timezones explicitly**

```python
from datetime import datetime, timezone

# GOOD - explicit timezone
now = datetime.now(timezone.utc)

# BAD - ambiguous
now = datetime.now()
```

### Don't Reinvent DSS Features

Don't implement functionality that DSS already provides:
- SQL generation
- Partitioning
- Logging to job logs
- Metrics collection

If you need DSS-level functionality, talk to Dataiku about proper APIs.

---

## File Naming

### Plugin Files

| File | Naming |
|------|--------|
| Plugin root | `your-plugin-id/` |
| Recipe folder | `custom-recipes/your-plugin-id-recipe-name/` |
| Webapp folder | `webapps/chart-name/` |
| Macro folder | `python-runnables/macro-name/` |
| Connector folder | `python-connectors/your-plugin-id-connector-name/` |

### Python Files

- Use snake_case: `my_module.py`, `data_processing.py`
- Test files: `test_*.py`

---

## Documentation

### README.md

Every plugin should have a README with:
- Plugin description
- Features list
- Requirements
- Installation instructions
- Usage examples
- Configuration reference

### Code Comments

```python
# GOOD - explains WHY, not WHAT
# We process in chunks to handle datasets larger than memory
for chunk in dataset.iter_dataframes(chunksize=10000):
    process(chunk)

# BAD - just restates the code
# Increment counter by 1
counter += 1

# GOOD - documents complex logic
def calculate_weighted_score(values, weights):
    """
    Calculate weighted average score.

    Uses inverse distance weighting to give more importance
    to closer data points. Empty values are excluded.

    Args:
        values: List of numeric values
        weights: List of weights (same length as values)

    Returns:
        Weighted average as float, or None if no valid values
    """
    ...
```

---

## Quick Reference Checklist

### Before Publishing

- [ ] Plugin ID is lowercase, hyphen-separated, no "plugin"/"custom"
- [ ] All component names start with plugin ID
- [ ] No component type words in labels
- [ ] Tags are generic/reusable
- [ ] All parameters validated before processing
- [ ] Business logic in `python-lib/`, not in recipes
- [ ] No `print()` statements - using logging
- [ ] No hardcoded secrets
- [ ] README.md complete
- [ ] CHANGELOG.md up to date
- [ ] Unit tests passing
- [ ] Code reviewed
