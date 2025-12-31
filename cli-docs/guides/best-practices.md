# Best Practices Guide

Comprehensive guide to writing high-quality, maintainable Dataiku plugins.

---

## Architecture Principles

### 1. Think of Your Plugin as a Library First

Even if you only need one recipe, structure your code as a library:

```
python-lib/
└── my_plugin_lib/
    ├── __init__.py
    ├── core.py          # Core algorithms
    ├── validation.py    # Input validation
    └── utils.py         # Helper functions

custom-recipes/
└── my-plugin-process/
    ├── recipe.json
    └── recipe.py        # Thin wrapper around library
```

**Benefits:**
- Library functions are testable without DSS
- Code is reusable across multiple components
- Clear separation of concerns

### 2. Keep DSS Components Thin

Recipe code should be ~15-30 lines:

```python
# recipe.py - The ideal recipe structure
import dataiku
from dataiku.customrecipe import *
from my_plugin_lib import process_data, validate_params

# 1. Read configuration
config = get_recipe_config()
validate_params(config)  # Validate early

# 2. Get inputs/outputs
input_ds = dataiku.Dataset(get_input_names_for_role('input')[0])
output_ds = dataiku.Dataset(get_output_names_for_role('output')[0])

# 3. Process
df = input_ds.get_dataframe()
result = process_data(df, config)  # All logic in library

# 4. Write output
output_ds.write_with_schema(result)
```

### 3. Never Import Dataiku in Libraries

```python
# python-lib/my_plugin_lib/core.py

# BAD
import dataiku  # Don't do this!

def process(config):
    ds = dataiku.Dataset(config['dataset'])  # Library depends on DSS

# GOOD
import pandas as pd

def process(df: pd.DataFrame, config: dict) -> pd.DataFrame:
    # Pure Python - testable without DSS
    return df.apply(...)
```

---

## Python & Data Handling

### Plugin python-lib Auto-Pathing

Dataiku automatically includes `python-lib/` in PYTHONPATH for plugins. Don't manually modify sys.path:

```python
# BAD - Unnecessary and error-prone
import sys
sys.path.append(dataiku.get_datadir() + '/python-lib')  # Invalid API!

# GOOD - Just import directly
from my_plugin_lib import process_data  # Works automatically
```

### ID Normalization Pattern

External data often has type mismatches (Pandas NaN coercion, float IDs, etc.). Create a central normalizer:

```python
def _normalize_id(value):
    """Normalize ID to string, handling float-integers safely."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, float) and value == int(value):
        return str(int(value))  # 277.0 → "277"
    return str(value)
```

**Why this matters:** Without normalization:
- ID column (no NaN): `277` → `"277"`
- Dependency column (with NaN): `276.0` → `"276.0"`
- IDs don't match, dependencies break silently!

### Pandas NaN Type Coercion

When a column contains NaN values, Pandas reads it as float64 even if all non-NaN values are integers:

```python
# DataFrame with NaN in one column
df = pd.DataFrame({
    'id': [1, 2, 3],           # int64 (no NaN)
    'parent': [1, 2, None]     # float64 (has NaN) → [1.0, 2.0, NaN]
})

# String conversion differs!
str(df['id'][0])      # "1"
str(df['parent'][0])  # "1.0"  ← Mismatch!
```

**Fix:** Always normalize IDs before comparison (see pattern above).

---

## Code Quality

### Use Type Hints

```python
from typing import Dict, List, Optional
import pandas as pd


def process_data(
    df: pd.DataFrame,
    column: str,
    threshold: float = 0.5,
    columns_to_keep: Optional[List[str]] = None
) -> pd.DataFrame:
    """
    Process data with specified parameters.

    Args:
        df: Input dataframe
        column: Column to process
        threshold: Cutoff value (0-1)
        columns_to_keep: Columns to retain in output

    Returns:
        Processed dataframe
    """
    ...
```

### Validate Early, Fail Fast

```python
def validate_config(config: dict) -> None:
    """Validate all configuration before processing."""
    # Required fields
    if 'column' not in config:
        raise ValueError("'column' is required")

    # Type validation
    threshold = config.get('threshold', 0.5)
    if not isinstance(threshold, (int, float)):
        raise TypeError(f"'threshold' must be numeric, got {type(threshold)}")

    # Range validation
    if not 0 <= threshold <= 1:
        raise ValueError(f"'threshold' must be 0-1, got {threshold}")

    # Cross-field validation
    if config.get('method') == 'custom' and not config.get('custom_value'):
        raise ValueError("'custom_value' required when method is 'custom'")
```

### Use Logging Properly

```python
import logging

# Configure once at module level
logging.basicConfig(
    level=logging.INFO,
    format='%(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('my-plugin')


def process(df, config):
    logger.info(f"Processing {len(df)} rows")
    logger.debug(f"Config: {config}")  # Detailed info only in debug

    try:
        result = transform(df)
        logger.info(f"Produced {len(result)} output rows")
        return result
    except Exception as e:
        logger.error(f"Processing failed: {e}")
        raise
```

**Logging Levels:**
- `DEBUG` - Detailed diagnostic info
- `INFO` - Normal operation progress
- `WARNING` - Something unexpected but handled
- `ERROR` - Something failed

### Handle Errors Gracefully

```python
class ProcessingError(Exception):
    """Custom exception for processing errors."""
    pass


def process(df, column):
    # Check preconditions
    if column not in df.columns:
        available = ', '.join(df.columns[:5])
        raise ProcessingError(
            f"Column '{column}' not found. Available: {available}..."
        )

    try:
        return transform(df[column])
    except ValueError as e:
        raise ProcessingError(f"Transform failed: {e}") from e
```

---

## Performance

### Handle Large Datasets

```python
# For large datasets, process in chunks
def process_large_dataset(input_ds, output_ds, config):
    # First chunk gets schema
    first_chunk = True

    for chunk_df in input_ds.iter_dataframes(chunksize=50000):
        result_chunk = process(chunk_df, config)

        if first_chunk:
            output_ds.write_with_schema(result_chunk)
            first_chunk = False
        else:
            output_ds.write_dataframe(result_chunk)
```

### Avoid Repeated Computations

```python
# BAD - recomputes expensive_operation for each row
def process(df):
    return df.apply(lambda row: expensive_operation(row))

# GOOD - vectorized operations
def process(df):
    return expensive_operation_vectorized(df)

# GOOD - cache repeated calculations
def process(df, lookup_df):
    lookup_dict = lookup_df.set_index('key')['value'].to_dict()  # Compute once
    return df['key'].map(lookup_dict)  # Fast lookup
```

### Limit API Calls

```python
# BAD - one API call per row
def process(df):
    results = []
    for _, row in df.iterrows():
        result = api_call(row['id'])  # N API calls
        results.append(result)
    return results

# GOOD - batch API calls
def process(df, batch_size=100):
    results = []
    for i in range(0, len(df), batch_size):
        batch = df.iloc[i:i+batch_size]
        batch_results = api_batch_call(batch['id'].tolist())  # 1 call per batch
        results.extend(batch_results)
    return results
```

---

## Security

### Never Log Secrets

```python
# BAD
logger.info(f"Connecting with API key: {api_key}")

# GOOD
logger.info("Connecting to API...")
```

### Avoid Code Injection

```python
# BAD - SQL injection
query = f"SELECT * FROM {table} WHERE id = {user_input}"

# GOOD - parameterized
query = "SELECT * FROM table WHERE id = %s"
cursor.execute(query, (user_input,))

# BAD - command injection
os.system(f"process {user_filename}")

# GOOD - use subprocess with list
import subprocess
subprocess.run(['process', user_filename], check=True)
```

### Validate External Input

```python
def validate_filename(filename):
    """Validate filename is safe."""
    import re
    if not re.match(r'^[\w\-. ]+$', filename):
        raise ValueError(f"Invalid filename: {filename}")
    if '..' in filename:
        raise ValueError("Path traversal not allowed")
    return filename
```

---

## Testing

### Structure Tests Well

```
tests/python/unit/
├── conftest.py           # Shared fixtures
├── test_processing.py    # Test core logic
├── test_validation.py    # Test validation
└── test_utils.py         # Test helpers
```

### Use Fixtures

```python
# conftest.py
import pytest
import pandas as pd


@pytest.fixture
def sample_df():
    """Standard test dataframe."""
    return pd.DataFrame({
        'id': [1, 2, 3],
        'value': [10.0, 20.0, 30.0],
        'category': ['A', 'B', 'A']
    })


@pytest.fixture
def config():
    """Standard configuration."""
    return {
        'column': 'value',
        'threshold': 0.5,
        'method': 'mean'
    }
```

### Test Edge Cases

```python
def test_empty_dataframe(sample_df):
    """Test with empty input."""
    empty = sample_df.head(0)
    result = process(empty)
    assert len(result) == 0


def test_null_values(sample_df):
    """Test handling of null values."""
    sample_df.loc[0, 'value'] = None
    result = process(sample_df)
    # Assert expected behavior


def test_invalid_input():
    """Test that invalid input raises appropriate error."""
    with pytest.raises(ValueError, match="Column .* not found"):
        process(pd.DataFrame(), column='nonexistent')
```

---

## Documentation

### Write Good Docstrings

```python
def calculate_score(
    df: pd.DataFrame,
    value_column: str,
    weight_column: str = None,
    normalize: bool = True
) -> pd.Series:
    """
    Calculate weighted scores for each row.

    Uses a weighted average formula. If no weight column is provided,
    all rows are weighted equally.

    Args:
        df: Input dataframe with numeric data
        value_column: Column containing values to score
        weight_column: Optional column with weights (default: equal weights)
        normalize: Whether to normalize scores to 0-1 range

    Returns:
        Series of calculated scores

    Raises:
        ValueError: If value_column doesn't exist or contains non-numeric data

    Example:
        >>> df = pd.DataFrame({'value': [1, 2, 3], 'weight': [0.5, 0.3, 0.2]})
        >>> calculate_score(df, 'value', 'weight')
        0    0.333
        1    0.400
        2    0.267
    """
```

### Document Configuration

```json
// recipe.json - Use descriptions
{
    "params": [
        {
            "name": "threshold",
            "label": "Detection Threshold",
            "type": "DOUBLE",
            "description": "Values below this threshold are flagged as anomalies. Higher values detect more anomalies. Recommended: 0.1-0.3 for most datasets.",
            "defaultValue": 0.2
        }
    ]
}
```

---

## Maintenance

### Use Semantic Versioning

```
1.0.0 - Initial release
1.0.1 - Bug fix (no new features)
1.1.0 - New feature added (backwards compatible)
2.0.0 - Breaking change (API changed)
```

### Maintain CHANGELOG

```markdown
# Changelog

## [1.2.0] - 2024-03-15
### Added
- Support for multiple input datasets
- New aggregation method: weighted median

### Changed
- Improved error messages for missing columns

### Fixed
- Fixed null handling in percentage calculation

## [1.1.0] - 2024-02-01
### Added
- Output column renaming option
```

### Plan for Deprecation

```python
import warnings

def old_function(x):
    """Deprecated: Use new_function instead."""
    warnings.warn(
        "old_function is deprecated, use new_function instead",
        DeprecationWarning,
        stacklevel=2
    )
    return new_function(x)
```

---

## JavaScript & Frontend

### Monkey-Patching Third-Party Libraries

When modifying library behavior without forking:

```javascript
// 1. Store original method BEFORE creating instance
const OriginalClass = window.LibraryClass;
const originalMethod = OriginalClass.prototype.method;

// 2. Override with your version
OriginalClass.prototype.method = function(...args) {
    // Pre-processing
    console.log('Before original');

    // Call original (preserve 'this' context)
    const result = originalMethod.apply(this, args);

    // Post-processing
    console.log('After original');
    return result;
};

// 3. NOW create instance - it uses patched method
const instance = new OriginalClass();
```

**Key Points:**
- Patch BEFORE instantiation
- Store original to preserve core functionality
- Use `apply(this, args)` to maintain context

### DOM Manipulation Timing

Libraries manipulate DOM asynchronously. Use `requestAnimationFrame` for post-render fixes:

```javascript
// Single rAF - waits for next paint
requestAnimationFrame(() => {
    applyCustomStyles();
});

// Double rAF - waits for layout to settle
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        // Layout-dependent calculations now accurate
        measureAndAdjust();
    });
});
```

**When to use:**
- Single rAF: Style overrides, DOM queries
- Double rAF: Calculations depending on element dimensions

### CSS Variables for Theming

Use CSS variables for values that change with themes:

```css
:root {
    --popup-gap: 8px;
    --text-primary: #333;
}

[data-theme="dark"] {
    --text-primary: #eee;
}
```

```javascript
// Read in JS when needed
const gap = getComputedStyle(document.documentElement)
    .getPropertyValue('--popup-gap');
```

---

## Development Workflow

### Incremental Development

Implement ONE feature at a time and test. Massive commits with multiple features lead to unmanageable debugging:

```
# Good - Atomic commits
feat: Add tooltip display
fix: Correct tooltip positioning
style: Improve tooltip appearance

# Bad - Kitchen sink commit
feat: Add tooltips, filtering, dark mode, and fix 12 bugs
```

### Spec-Driven Development

Detailed specs with implementation plans reduce churn significantly:

1. **Investigation** - Understand the problem
2. **Spec** - Document the approach with examples
3. **Implement** - Follow the spec
4. **Verify** - Test against spec criteria

**Evidence from this project:**
- v0.3.0 (with spec): 0% churn, delivered perfectly on first commit
- v0.1.0 (no spec): 74% churn, 28 fix/debug commits for 4 features

Jumping straight to code often leads to rewrites.

### Early Deferral

When a feature doesn't work after 2-3 iterations, **defer it** rather than continuing to debug:

```
# After 2-3 failed attempts
- Create issue for the problem
- Document what was tried and why it failed
- Ship without the feature
- Return with fresh perspective later
```

**Anti-pattern:** v0.1.0 had 11 scrollbar fix attempts before finally deferring. The eventual fix took 30 minutes with fresh eyes.

### User Collaboration for Debugging

When debugging platform behavior, collaborate with user for console testing:

```javascript
// User runs in browser console to test hypothesis
console.log('Config heartbeats:', window._configMessages);
// Result disproves hypothesis in ~30 min vs hours of wrong solution
```

This is especially valuable for Dataiku platform behavior where you can't easily reproduce the environment.

### Test What You Fix

Every bugfix should include a regression test:

```python
def test_handles_negative_progress():
    """Regression: Progress < 0 caused render crash (v0.7.2)."""
    task = {"progress": -10}
    result = transform_task(task)
    assert result["progress"] == 0  # Clamped to valid range
```

---

## Quick Checklist

### Before Writing Code
- [ ] Defined clear requirements
- [ ] Reviewed existing plugins for patterns
- [ ] Planned library structure

### During Development
- [ ] Business logic in `python-lib/`
- [ ] No `import dataiku` in libraries
- [ ] Type hints on functions
- [ ] Input validation
- [ ] Logging (not print)
- [ ] Error handling

### Before Release
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] Documentation complete
- [ ] CHANGELOG updated
- [ ] Version bumped
- [ ] Code reviewed
