# Macros Guide

Macros (also called Runnables) automate tasks in Dataiku. They can perform batch operations, generate reports, create projects, and interact with the Dataiku API.

---

## Overview

A macro consists of files in `python-runnables/{macro-name}/`:
- **runnable.json** - Configuration: parameters, permissions, result type
- **runnable.py** - Python class implementing the macro logic

---

## Macro Configuration (runnable.json)

### Complete Structure

```json
{
    "meta": {
        "label": "My Macro",
        "description": "What this macro does",
        "icon": "fas fa-cog"
    },

    "impersonate": false,

    "permissions": [],

    "resultType": "RESULT_TABLE",
    "resultLabel": "Results",

    "macroRoles": [
        {
            "type": "DATASET",
            "targetParamsKey": "input_dataset"
        }
    ],

    "params": [
        {
            "name": "input_dataset",
            "label": "Input Dataset",
            "type": "DATASET",
            "description": "Dataset to process",
            "mandatory": true
        },
        {
            "name": "suffix",
            "label": "Suffix",
            "type": "STRING",
            "defaultValue": "_copy",
            "mandatory": true
        }
    ]
}
```

### Key Configuration Fields

| Field | Description |
|-------|-------------|
| `impersonate` | Run as calling user (true) or service account (false) |
| `permissions` | Required permissions to run the macro |
| `resultType` | Type of output produced |
| `resultLabel` | Label for the result in UI |
| `macroRoles` | Where the macro appears in the UI |

### Result Types

| Type | Description | Return Value |
|------|-------------|--------------|
| `NONE` | No output | None |
| `HTML` | HTML report | String (HTML) |
| `RESULT_TABLE` | Tabular data | ResultTable object |
| `FILE` | File download | Raw bytes (string) |
| `FOLDER_FILE` | File in managed folder | File reference |
| `URL` | Link to resource | URL string |

### Macro Roles (Where It Appears)

| Role | Description |
|------|-------------|
| `DATASET` | Single dataset context |
| `DATASETS` | Multiple datasets context |
| `MANAGED_FOLDER` | Folder context |
| `SAVED_MODEL` | Model context |
| `API_SERVICE` | API service context |
| `API_SERVICE_VERSION` | API service version context |
| `BUNDLE` | Bundle context |
| `VISUAL_ANALYSIS` | Visual analysis context |
| `PROJECT_MACROS` | General project macro |
| `PROJECT_CREATOR` | Project creation macro |

---

## Macro Code (runnable.py)

### Basic Structure

```python
from dataiku.runnables import Runnable


class MyRunnable(Runnable):
    """
    Custom macro for Dataiku.

    Methods:
    - __init__: Parse configuration, initialize resources
    - get_progress_target: Define progress tracking (optional)
    - run: Execute the macro logic
    """

    def __init__(self, project_key, config, plugin_config):
        """
        Initialize the macro.

        Args:
            project_key: Key of the project where macro runs
            config: User-provided configuration from params
            plugin_config: Plugin-level settings
        """
        self.project_key = project_key
        self.config = config
        self.plugin_config = plugin_config

    def get_progress_target(self):
        """
        Define the progress target.

        Returns:
            Tuple of (target_count, unit)
            Units: SIZE, FILES, RECORDS, NONE
        """
        return None

    def run(self, progress_callback):
        """
        Execute the macro.

        Args:
            progress_callback: Function to report progress (accepts int)

        Returns:
            Result based on resultType in runnable.json
        """
        # Your logic here
        return None
```

---

## Result Type Examples

### RESULT_TABLE (Recommended for Tabular Output)

```python
from dataiku.runnables import Runnable, ResultTable


class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.items = config.get('items', [])

    def get_progress_target(self):
        return (len(self.items), 'RECORDS')

    def run(self, progress_callback):
        # Create result table
        rt = ResultTable()
        rt.add_column("name", "Name", "STRING")
        rt.add_column("status", "Status", "STRING")
        rt.add_column("count", "Count", "INT")

        for i, item in enumerate(self.items):
            progress_callback(i + 1)

            # Process item...
            rt.add_record([item, "Success", 100])

        return rt
```

### ResultTable API Reference

**Column Types:** `"STRING"`, `"INT"`, `"DOUBLE"`, `"BOOLEAN"`

**Methods:**
```python
rt = ResultTable()
rt.add_column(name: str, label: str, type: str)  # Define column
rt.add_record(values: list)                       # Add row (values in column order)
```

### Runnable Method Signatures

```python
class MyRunnable(Runnable):
    def __init__(self, project_key: str, config: dict, plugin_config: dict):
        """
        Called when macro is instantiated.

        Args:
            project_key: Key of project where macro runs (str)
            config: User parameters from macro UI (dict)
            plugin_config: Plugin-level settings (dict)
        """
        pass

    def get_progress_target(self) -> tuple:
        """
        Optional. Define progress tracking.

        Returns:
            Tuple of (target_count: int, unit: str)
            Units: 'SIZE', 'FILES', 'RECORDS', 'NONE'
        """
        return (100, 'RECORDS')

    def run(self, progress_callback) -> ResultTable | str | bytes:
        """
        Execute macro logic.

        Args:
            progress_callback: Function accepting int for current progress

        Returns:
            - ResultTable for resultType="RESULT_TABLE"
            - HTML string for resultType="HTML"
            - Bytes/string for resultType="FILE"
            - URL string for resultType="URL"
            - None for resultType="NONE"
        """
        progress_callback(50)  # Report 50% progress
        return result
```

### HTML (For Rich Reports)

```python
from dataiku.runnables import Runnable


class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.title = config.get('title', 'Report')

    def run(self, progress_callback):
        html = f"""
        <html>
        <head><title>{self.title}</title></head>
        <body>
            <h1>{self.title}</h1>
            <p>Generated from project: {self.project_key}</p>
            <table>
                <tr><th>Item</th><th>Value</th></tr>
                <tr><td>Example</td><td>123</td></tr>
            </table>
        </body>
        </html>
        """
        return html
```

### FILE (For Downloads)

```json
// runnable.json
{
    "resultType": "FILE",
    "extension": "csv",
    "mimeType": "text/csv"
}
```

```python
from dataiku.runnables import Runnable
import pandas as pd


class MyRunnable(Runnable):
    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key

    def run(self, progress_callback):
        df = pd.DataFrame({'col1': [1, 2], 'col2': ['a', 'b']})
        return df.to_csv(index=False)
```

---

## Complete Examples

### Example 1: Copy Datasets Macro

**runnable.json:**
```json
{
    "meta": {
        "label": "Copy Datasets",
        "description": "Copy multiple datasets with a suffix",
        "icon": "fas fa-copy"
    },

    "impersonate": false,
    "permissions": [],

    "resultType": "RESULT_TABLE",

    "macroRoles": [
        {
            "type": "DATASETS",
            "targetParamsKey": "datasets"
        }
    ],

    "params": [
        {
            "name": "datasets",
            "label": "Datasets to Copy",
            "type": "DATASETS",
            "description": "Select datasets to copy",
            "mandatory": true
        },
        {
            "name": "suffix",
            "label": "Suffix",
            "type": "STRING",
            "defaultValue": "_copy",
            "mandatory": true
        }
    ]
}
```

**runnable.py:**
```python
from dataiku.runnables import Runnable, ResultTable
import dataiku


class MyRunnable(Runnable):
    """Copy multiple datasets with a suffix."""

    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.datasets = config.get('datasets', [])
        self.suffix = config.get('suffix', '_copy')
        self.client = dataiku.api_client()
        self.project = self.client.get_project(project_key)

    def get_progress_target(self):
        return (len(self.datasets), 'RECORDS')

    def run(self, progress_callback):
        rt = ResultTable()
        rt.add_column("original", "Original Name", "STRING")
        rt.add_column("copy", "Copy Name", "STRING")
        rt.add_column("status", "Status", "STRING")

        for i, name in enumerate(self.datasets):
            progress_callback(i + 1)
            record = [name, "", ""]

            try:
                dataset = self.project.get_dataset(name)
                settings = dataset.get_settings().get_raw()
                params = settings.get('params', {})

                # Update table/path for the copy
                if 'table' in params:
                    params['table'] = f"{self.project_key}/{name}{self.suffix}"
                if 'path' in params:
                    params['path'] = f"{self.project_key}/{name}{self.suffix}"

                # Create copy
                new_name = f"{name}{self.suffix}"
                copy = self.project.create_dataset(
                    new_name,
                    settings.get('type'),
                    params,
                    settings.get('formatType'),
                    settings.get('formatParams')
                )

                # Copy data
                future = dataset.copy_to(copy, write_mode='OVERWRITE')
                future.wait_for_result()

                record = [name, new_name, "Success"]

            except Exception as e:
                record = [name, "", f"Error: {str(e)}"]

            rt.add_record(record)

        return rt
```

### Example 2: Project Creation Macro

**runnable.json:**
```json
{
    "meta": {
        "label": "Create Analytics Project",
        "description": "Create a new project with standard setup",
        "icon": "fas fa-plus"
    },

    "impersonate": false,
    "permissions": ["ADMIN"],

    "resultType": "URL",

    "macroRoles": [
        {
            "type": "PROJECT_CREATOR"
        }
    ],

    "params": [
        {
            "name": "project_key",
            "label": "Project Key",
            "type": "STRING",
            "description": "Unique project identifier (uppercase)",
            "mandatory": true
        },
        {
            "name": "project_name",
            "label": "Project Name",
            "type": "STRING",
            "description": "Display name for the project",
            "mandatory": true
        },
        {
            "name": "template",
            "label": "Template",
            "type": "SELECT",
            "selectChoices": [
                {"value": "basic", "label": "Basic Analytics"},
                {"value": "ml", "label": "Machine Learning"},
                {"value": "etl", "label": "ETL Pipeline"}
            ],
            "defaultValue": "basic"
        }
    ]
}
```

**runnable.py:**
```python
from dataiku.runnables import Runnable
import dataiku


class MyRunnable(Runnable):
    """Create a new project with standard setup."""

    def __init__(self, project_key, config, plugin_config):
        self.config = config
        self.client = dataiku.api_client()

    def run(self, progress_callback):
        new_key = self.config['project_key'].upper()
        name = self.config['project_name']
        template = self.config.get('template', 'basic')

        # Create project
        project = self.client.create_project(new_key, name)

        # Apply template-specific setup
        if template == 'ml':
            # Create standard ML folders
            project.create_managed_folder('models', 'MODELS')
            project.create_managed_folder('data', 'DATA')

        elif template == 'etl':
            # Create ETL-specific setup
            pass

        # Return URL to new project
        host = self.client.host
        return f"{host}/projects/{new_key}/"
```

### Example 3: Dataset Statistics Macro

**runnable.json:**
```json
{
    "meta": {
        "label": "Dataset Statistics",
        "description": "Generate statistics for a dataset",
        "icon": "fas fa-chart-bar"
    },

    "resultType": "HTML",

    "macroRoles": [
        {
            "type": "DATASET",
            "targetParamsKey": "dataset"
        }
    ],

    "params": [
        {
            "name": "dataset",
            "label": "Dataset",
            "type": "DATASET",
            "mandatory": true
        }
    ]
}
```

**runnable.py:**
```python
from dataiku.runnables import Runnable
import dataiku
import pandas as pd


class MyRunnable(Runnable):
    """Generate HTML statistics report for a dataset."""

    def __init__(self, project_key, config, plugin_config):
        self.project_key = project_key
        self.dataset_name = config['dataset']

    def run(self, progress_callback):
        dataset = dataiku.Dataset(self.dataset_name)
        df = dataset.get_dataframe()

        # Generate statistics
        stats = df.describe().to_html()
        dtypes = df.dtypes.to_frame('Type').to_html()
        missing = df.isnull().sum().to_frame('Missing').to_html()

        html = f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; padding: 20px; }}
                h1, h2 {{ color: #333; }}
                table {{ border-collapse: collapse; margin: 10px 0; }}
                th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                th {{ background-color: #4CAF50; color: white; }}
            </style>
        </head>
        <body>
            <h1>Dataset Statistics: {self.dataset_name}</h1>

            <h2>Overview</h2>
            <p>Rows: {len(df):,}</p>
            <p>Columns: {len(df.columns)}</p>

            <h2>Column Types</h2>
            {dtypes}

            <h2>Missing Values</h2>
            {missing}

            <h2>Numeric Statistics</h2>
            {stats}
        </body>
        </html>
        """
        return html
```

---

## Running Context

Macros can run in different contexts:

1. **Manually** - From project's Macros menu
2. **From Dashboard** - Embedded in dashboard tiles
3. **From Scenario** - As a scenario step
4. **From Flow** - Right-click on items (based on macroRoles)

---

## Best Practices

### 1. Use Progress Callbacks

```python
def run(self, progress_callback):
    items = self.get_items()

    for i, item in enumerate(items):
        progress_callback(i + 1)
        self.process(item)
```

### 2. Handle Errors Gracefully

```python
def run(self, progress_callback):
    rt = ResultTable()
    rt.add_column("item", "Item", "STRING")
    rt.add_column("status", "Status", "STRING")
    rt.add_column("message", "Message", "STRING")

    for item in self.items:
        try:
            self.process(item)
            rt.add_record([item, "Success", ""])
        except Exception as e:
            rt.add_record([item, "Error", str(e)])

    return rt
```

### 3. Use Logging

```python
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MyRunnable(Runnable):
    def run(self, progress_callback):
        logger.info(f"Starting macro in project {self.project_key}")
        # ...
        logger.info("Macro completed successfully")
```

### 4. Validate Inputs Early

```python
def __init__(self, project_key, config, plugin_config):
    self.datasets = config.get('datasets', [])
    if not self.datasets:
        raise ValueError("At least one dataset must be selected")
```

---

## Folder Structure

```
python-runnables/
└── my-macro/
    ├── runnable.json
    └── runnable.py
```
