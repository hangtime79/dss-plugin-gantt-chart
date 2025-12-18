# Processors Guide

Custom processors extend the Prepare recipe with new transformation steps.

---

## Overview

A processor consists of files in `python-processors/{processor-name}/` (or `java-processors/` for Java):
- **processor.json** - Configuration: parameters, input/output modes
- **processor.py** - Python class implementing the transformation

---

## Processor Configuration (processor.json)

```json
{
    "meta": {
        "label": "My Processor",
        "description": "Transform data in a specific way",
        "icon": "fas fa-magic"
    },

    "params": [
        {
            "name": "column",
            "label": "Input Column",
            "type": "COLUMN",
            "description": "Column to process",
            "mandatory": true
        },
        {
            "name": "output_column",
            "label": "Output Column",
            "type": "STRING",
            "description": "Name for the result column"
        },
        {
            "name": "operation",
            "label": "Operation",
            "type": "SELECT",
            "selectChoices": [
                {"value": "uppercase", "label": "Uppercase"},
                {"value": "lowercase", "label": "Lowercase"},
                {"value": "capitalize", "label": "Capitalize"}
            ],
            "defaultValue": "uppercase"
        }
    ]
}
```

---

## Processor Code (processor.py)

```python
from dataiku.customstep import *


def process(row):
    """
    Process a single row.

    Args:
        row: Dictionary-like object representing the row

    Returns:
        Modified row (or None to delete the row)
    """
    column = get_step_config()['column']
    output_column = get_step_config().get('output_column', f"{column}_processed")
    operation = get_step_config().get('operation', 'uppercase')

    value = row.get(column)

    if value is not None and isinstance(value, str):
        if operation == 'uppercase':
            row[output_column] = value.upper()
        elif operation == 'lowercase':
            row[output_column] = value.lower()
        elif operation == 'capitalize':
            row[output_column] = value.capitalize()

    return row
```

---

## Complete Example: Text Cleaner

**processor.json:**
```json
{
    "meta": {
        "label": "Text Cleaner",
        "description": "Clean and normalize text values",
        "icon": "fas fa-edit"
    },

    "params": [
        {
            "name": "column",
            "label": "Column",
            "type": "COLUMN",
            "mandatory": true
        },
        {
            "name": "trim_whitespace",
            "label": "Trim Whitespace",
            "type": "BOOLEAN",
            "defaultValue": true
        },
        {
            "name": "remove_special_chars",
            "label": "Remove Special Characters",
            "type": "BOOLEAN",
            "defaultValue": false
        },
        {
            "name": "normalize_case",
            "label": "Normalize Case",
            "type": "SELECT",
            "selectChoices": [
                {"value": "none", "label": "No change"},
                {"value": "upper", "label": "UPPERCASE"},
                {"value": "lower", "label": "lowercase"},
                {"value": "title", "label": "Title Case"}
            ],
            "defaultValue": "none"
        }
    ]
}
```

**processor.py:**
```python
import re
from dataiku.customstep import *


def process(row):
    """Clean and normalize text in the specified column."""
    config = get_step_config()
    column = config['column']
    trim = config.get('trim_whitespace', True)
    remove_special = config.get('remove_special_chars', False)
    normalize = config.get('normalize_case', 'none')

    value = row.get(column)

    if value is not None and isinstance(value, str):
        # Trim whitespace
        if trim:
            value = value.strip()

        # Remove special characters
        if remove_special:
            value = re.sub(r'[^a-zA-Z0-9\s]', '', value)

        # Normalize case
        if normalize == 'upper':
            value = value.upper()
        elif normalize == 'lower':
            value = value.lower()
        elif normalize == 'title':
            value = value.title()

        row[column] = value

    return row
```

---

## Folder Structure

```
python-processors/
└── text-cleaner/
    ├── processor.json
    └── processor.py
```

---

## Notes

- Processors run row-by-row, so keep logic simple and fast
- Return `None` to delete a row
- Access configuration via `get_step_config()`
- Processors appear in the Prepare recipe's processor list
