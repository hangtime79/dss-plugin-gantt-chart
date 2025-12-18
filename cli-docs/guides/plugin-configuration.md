# Plugin Configuration Guide

How to configure your plugin's identity, code environment, and settings.

---

## Plugin Identity (plugin.json)

The `plugin.json` file in the root directory defines your plugin's identity and metadata.

### Complete Structure

```json
{
    "id": "your-plugin-id",
    "version": "1.0.0",
    "meta": {
        "label": "Your Plugin Name",
        "category": "Data Processing",
        "description": "A brief description of what your plugin does",
        "author": "Organization (firstName LASTNAME)",
        "icon": "fas fa-puzzle-piece",
        "licenseInfo": "Apache Software License",
        "url": "https://www.dataiku.com/product/plugins/your-plugin-id/",
        "tags": ["Tag1", "Tag2"],
        "supportLevel": "NOT_SUPPORTED"
    }
}
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique plugin identifier. Lowercase, hyphen-separated. |
| `version` | Yes | Semantic version (MAJOR.MINOR.PATCH) |
| `meta.label` | Yes | Display name shown in UI |
| `meta.category` | No | Category for organization (e.g., "Data Processing", "Machine Learning") |
| `meta.description` | Yes | Brief description of plugin purpose |
| `meta.author` | Yes | Author name. Format: "Organization (firstName LASTNAME)" |
| `meta.icon` | Yes | [FontAwesome 5.15.4 icon class](../reference/fontawesome-5.15.4.md) |
| `meta.licenseInfo` | No | License (typically "Apache Software License") |
| `meta.url` | No | Link to documentation |
| `meta.tags` | No | Tags for searchability |
| `meta.supportLevel` | No | Support tier |
| `meta.recipesCategory` | No | Category for recipe components |

### Support Levels

| Level | Description |
|-------|-------------|
| `NOT_SUPPORTED` | Community/unsupported plugin (default) |
| `TIER2_SUPPORT` | Dataiku Tier 2 support |
| `SUPPORTED` | Fully supported by Dataiku |

### Recipe Categories

The `recipesCategory` field controls where recipe components appear:

| Value | UI Location |
|-------|-------------|
| `visual` | Visual recipes section |
| `code` | Code recipes section |
| `genai` | GenAI recipes section |
| `other` | Other recipes / Plugin recipes (default) |

### Icon Reference

Common FontAwesome 5.15.4 icons for plugins:

| Icon | Use Case |
|------|----------|
| `fas fa-puzzle-piece` | Generic plugin |
| `fas fa-code` | Code/development |
| `fas fa-chart-bar` | Charts/visualization |
| `fas fa-cogs` | Processing/ETL |
| `fas fa-cloud` | Cloud/API integration |
| `fas fa-database` | Data connectors |
| `fas fa-flask` | ML/Science |
| `fas fa-magic` | Transformation |
| `fas fa-globe` | Geospatial |
| `fas fa-calendar` | Time series |

Full list: [FontAwesome 5.15.4 Icons](../reference/fontawesome-5.15.4.md)

---

## Code Environment (code-env/)

The code environment defines Python dependencies for your plugin.

### Structure

```
code-env/
└── python/
    ├── desc.json           # Environment configuration
    └── spec/
        └── requirements.txt  # Python packages
```

### desc.json

```json
{
    "acceptedPythonInterpreters": ["PYTHON310", "PYTHON311", "PYTHON312"],
    "forceConda": false,
    "installCorePackages": true,
    "installJupyterSupport": false
}
```

| Field | Description |
|-------|-------------|
| `acceptedPythonInterpreters` | Python versions that can be used |
| `forceConda` | Force Conda environment (for complex dependencies) |
| `installCorePackages` | Include Dataiku core packages |
| `installJupyterSupport` | Include Jupyter packages |

### Available Python Versions

- `PYTHON36`, `PYTHON37`, `PYTHON38`, `PYTHON39`
- `PYTHON310`, `PYTHON311`, `PYTHON312`

### requirements.txt

Standard pip requirements format:

```
# Data processing
pandas>=1.5.0
numpy>=1.20.0

# Visualization (choose one)
plotly>=5.0.0
# bokeh>=3.0.0

# API access
requests>=2.28.0

# ML libraries (if needed)
scikit-learn>=1.0.0

# Pin versions for reproducibility
# package==1.2.3
```

### Conda Environment

For complex dependencies (e.g., geospatial, C extensions):

**desc.json:**
```json
{
    "acceptedPythonInterpreters": ["PYTHON310"],
    "forceConda": true,
    "installCorePackages": true
}
```

**Create `spec/conda-packages.txt`:**
```
geopandas
shapely
fiona
```

---

## Parameter Sets

Parameter sets define reusable configurations that can be shared across components.

### Structure

```
parameter-sets/
└── my-connection-settings/
    └── parameter-set.json
```

### parameter-set.json

```json
{
    "meta": {
        "label": "Connection Settings",
        "description": "Reusable connection configuration",
        "icon": "fas fa-cog"
    },

    "defaultDefinableInline": true,
    "defaultDefinableAtProjectLevel": true,

    "pluginParams": [
        {
            "name": "api_endpoint",
            "label": "API Endpoint",
            "type": "STRING",
            "description": "Base URL for the API",
            "mandatory": true
        },
        {
            "name": "api_key",
            "label": "API Key",
            "type": "PASSWORD",
            "mandatory": true
        }
    ],

    "params": [
        {
            "name": "timeout",
            "label": "Timeout (seconds)",
            "type": "INT",
            "defaultValue": 30
        }
    ]
}
```

### Fields

| Field | Description |
|-------|-------------|
| `defaultDefinableInline` | Users can define values directly in component config |
| `defaultDefinableAtProjectLevel` | Users can define presets at project level |
| `pluginParams` | Instance-level parameters (set by admin) |
| `params` | Component-level parameters (set by user) |

### Using Parameter Sets in Components

```json
{
    "params": [
        {
            "name": "connection",
            "label": "Connection Settings",
            "type": "PRESET",
            "parameterSetId": "my-connection-settings"
        }
    ]
}
```

---

## Shared Python Library (python-lib/)

The `python-lib/` directory contains reusable Python code.

### Structure

```
python-lib/
├── __init__.py
└── my_plugin_lib/
    ├── __init__.py
    ├── processing.py
    └── utils.py
```

### Best Practices

1. **No `import dataiku`** - Keep libraries DSS-independent for testability

2. **Organize by function:**
```
python-lib/
├── __init__.py
└── my_plugin_lib/
    ├── __init__.py
    ├── processing.py    # Core data processing
    ├── validation.py    # Input validation
    ├── api_client.py    # External API integration
    └── utils.py         # Helper functions
```

3. **Import in components:**
```python
# In recipe.py
from my_plugin_lib.processing import process_data
from my_plugin_lib.validation import validate_config
```

---

## Resource Files (resource/)

Static files used by the plugin.

```
resource/
├── images/
│   └── logo.png
├── templates/
│   └── report.html
└── data/
    └── config.json
```

Access in code:
```python
import os

# Get resource path
resource_dir = os.path.join(os.path.dirname(__file__), '..', 'resource')
template_path = os.path.join(resource_dir, 'templates', 'report.html')
```

---

## Complete Plugin Structure

```
your-plugin-id/
├── plugin.json                 # Plugin identity
├── CHANGELOG.md               # Version history
├── README.md                  # Documentation
├── LICENSE                    # License file
├── Makefile                   # Build/test commands
│
├── code-env/
│   └── python/
│       ├── desc.json
│       └── spec/
│           └── requirements.txt
│
├── python-lib/                # Shared Python code
│   ├── __init__.py
│   └── my_plugin_lib/
│       ├── __init__.py
│       └── *.py
│
├── parameter-sets/            # Reusable parameter configs
│   └── my-preset/
│       └── parameter-set.json
│
├── custom-recipes/            # Recipe components
│   └── your-plugin-id-recipe/
│       ├── recipe.json
│       └── recipe.py
│
├── webapps/                   # Webapp components
│   └── my-chart/
│       ├── webapp.json
│       └── backend.py
│
├── python-runnables/          # Macro components
│   └── my-macro/
│       ├── runnable.json
│       └── runnable.py
│
├── python-connectors/         # Dataset connectors
│   └── your-plugin-id-connector/
│       ├── connector.json
│       └── connector.py
│
├── python-prediction-algos/   # ML algorithms
│   └── my-algorithm/
│       ├── algo.json
│       └── algo.py
│
├── resource/                  # Static resources
│   └── ...
│
└── tests/                     # Tests
    └── python/
        ├── unit/
        │   ├── requirements.txt
        │   └── test_*.py
        └── integration/
            ├── requirements.txt
            └── test_*.py
```

---

## Versioning

Follow semantic versioning (SemVer):

| Version Part | When to Increment |
|--------------|-------------------|
| MAJOR (1.x.x) | Breaking changes |
| MINOR (x.1.x) | New features, backwards compatible |
| PATCH (x.x.1) | Bug fixes, backwards compatible |

Track changes in `CHANGELOG.md`:

```markdown
# Changelog

## [1.1.0] - 2024-01-15
### Added
- New chart type: Sunburst

### Changed
- Improved error handling in API connector

### Fixed
- Fixed null handling in recipe

## [1.0.0] - 2024-01-01
### Added
- Initial release
- Custom recipe for data processing
- Chart webapp for visualization
```

---

## Building the Code Environment

After configuring `code-env/`:

1. **In DSS UI:**
   - Go to Plugins > Your Plugin > Summary tab
   - Click "Build New Environment"

2. **Or via API:**
```python
import dataikuapi

client = dataikuapi.DSSClient("https://dss.example.com", "api-key")
plugin = client.get_plugin("your-plugin-id")
plugin.create_code_env()
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Code env build fails | Check requirements.txt syntax, verify package availability |
| Plugin not visible | Check plugin.json syntax, reload plugin |
| Component not appearing | Verify component folder structure, check JSON syntax |
| Import errors | Verify python-lib structure, check __init__.py files |
