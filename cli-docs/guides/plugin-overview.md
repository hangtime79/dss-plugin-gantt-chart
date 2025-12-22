# Dataiku Plugin Development Guide

Generic reference for building Dataiku DSS plugins. This was the original CLAUDE.md content, preserved here for reference when starting new plugin projects.

---

## New Plugin Session - Start Here

When a user wants to build a Dataiku plugin, ask these questions to understand the scope:

### 1. What type of plugin component(s) do you need?

| Component | Use Case | Guide |
|-----------|----------|-------|
| **Custom Recipe** | Process data with custom logic (Python/R/SQL) | [custom-recipes.md](custom-recipes.md) |
| **Webapp (Charts)** | Interactive visualizations using Plotly, Bokeh, D3 | [webapps.md](webapps.md) |
| **Prediction Algorithm** | Custom ML algorithm for Visual ML | [prediction-algorithms.md](prediction-algorithms.md) |
| **Macro** | Automated tasks, project utilities, batch operations | [macros.md](macros.md) |
| **Dataset Connector** | Connect to custom data sources/APIs | [datasets.md](datasets.md) |
| **Processor** | Custom Prepare recipe step | [processors.md](processors.md) |
| **File Format** | Custom file format parser | [file-formats.md](file-formats.md) |

### 2. Plugin identity questions:

- **Plugin name**: lowercase, hyphen-separated, no "plugin" or "custom" in name
- **Description**: 1-2 sentences
- **Author**: Format: "Organization (firstName LASTNAME)"
- **Components**: What components will it contain?

### 3. Dependencies:

- External Python packages needed?
- Visualization library: Plotly (offline), Bokeh, or custom JS

---

## Plugin Structure

```
your-plugin-id/
├── plugin.json              # Plugin metadata (CONFIGURE FIRST)
├── code-env/
│   └── python/
│       ├── desc.json        # Code environment config
│       └── spec/
│           └── requirements.txt  # Python dependencies
├── custom-recipes/          # Recipe components
│   └── {plugin-id}-{recipe-name}/
│       ├── recipe.json
│       └── recipe.py
├── webapps/                 # Webapp components
│   └── {webapp-name}/
│       ├── webapp.json
│       ├── backend.py
│       └── app.html (optional)
├── python-runnables/        # Macro components
│   └── {macro-name}/
│       ├── runnable.json
│       └── runnable.py
├── python-connectors/       # Dataset components
│   └── {connector-name}/
│       ├── connector.json
│       └── connector.py
├── python-prediction-algos/ # ML algorithm components
│   └── {algo-name}/
│       ├── algo.json
│       └── algo.py
├── python-lib/              # Shared Python code
│   └── {your_module}/
├── parameter-sets/          # Reusable parameter configurations
├── tests/                   # Unit and integration tests
└── README.md                # Plugin documentation
```

---

## Key Principles

### Code Structure
- **Keep recipe/webapp code SHORT** - Business logic belongs in `python-lib/`
- **Never `import dataiku` in libraries** - Keep libraries DSS-independent
- **Separation of concerns** - Parameters class + Processing class pattern

### Naming Rules (MUST follow for Plugin Store)
- Plugin ID: lowercase, hyphen-separated (e.g., `my-awesome-plugin`)
- Component names: must start with plugin ID (e.g., `my-awesome-plugin-compute`)
- No "plugin", "custom", "recipe", "dataset" in names
- See [naming-conventions.md](naming-conventions.md) for complete rules

### Testing
- Always include unit tests in `tests/python/unit/`
- Integration tests use DSS scenarios via `dataiku-plugin-tests-utils`
- See [testing.md](testing.md)

### Git Branch Naming
Use format: `<type>/<version>-<short-description>`

| Prefix | Use Case |
|--------|----------|
| `feature/` | New functionality |
| `bugfix/` | Bug fixes |
| `release/` | Release preparation |
| `hotfix/` | Urgent production fixes |

Example: `feature/v0.1.0-ux-improvements`

---

## Common Patterns

### Reading Plugin Parameters
```python
# In recipes
from dataiku.customrecipe import get_recipe_config
config = get_recipe_config()
my_param = config.get('my_param', 'default_value')

# In webapps
from dataiku.webapps import get_webapp_config
config = get_webapp_config()

# In macros (runnables)
# Passed to __init__ as config dict
def __init__(self, project_key, config, plugin_config):
    self.my_param = config.get('my_param')
```

### Accessing Datasets
```python
import dataiku
from dataiku.customrecipe import get_input_names_for_role

# Get input dataset
input_names = get_input_names_for_role('input_role_name')
input_dataset = dataiku.Dataset(input_names[0])
df = input_dataset.get_dataframe()

# Write to output dataset
output_names = get_output_names_for_role('output_role_name')
output_dataset = dataiku.Dataset(output_names[0])
output_dataset.write_with_schema(result_df)
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Plugin not visible | Reload plugin from Actions menu, refresh browser |
| Code env errors | Check requirements.txt, rebuild environment |
| Parameter not appearing | Verify JSON syntax, check param type spelling |
| Recipe not in menu | Add `"selectableFromDataset"` in recipe.json |

---

## Documentation Index

### Core Guides
- [plugin-configuration.md](plugin-configuration.md) - plugin.json, code-env setup
- [naming-conventions.md](naming-conventions.md) - Required naming rules

### Component Guides
- [custom-recipes.md](custom-recipes.md) - Data processing recipes
- [webapps.md](webapps.md) - Interactive visualizations
- [prediction-algorithms.md](prediction-algorithms.md) - Custom ML algorithms
- [macros.md](macros.md) - Automated tasks and utilities
- [datasets.md](datasets.md) - Custom data sources
- [processors.md](processors.md) - Prepare recipe steps
- [file-formats.md](file-formats.md) - Custom file parsers

### Reference
- [../reference/parameters.md](../reference/parameters.md) - All parameter types
- [../reference/type-conversions.md](../reference/type-conversions.md) - Python types for parameters
- [../reference/dataset-api-quick.md](../reference/dataset-api-quick.md) - Read/write methods
- [../reference/edge-cases.md](../reference/edge-cases.md) - Validation and error handling
- [testing.md](testing.md) - Unit and integration testing
- [best-practices.md](best-practices.md) - Coding standards and patterns
