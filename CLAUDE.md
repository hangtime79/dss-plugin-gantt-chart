# CLAUDE.md - Dataiku Plugin Development Guide

This is the root navigation for Claude when developing Dataiku DSS plugins. Read this file first, then follow links to specific guides based on what you're building.

---

## New Plugin Session - Start Here

When a user wants to build a Dataiku plugin, ask these questions to understand the scope:

### 1. What type of plugin component(s) do you need?

| Component | Use Case | Guide |
|-----------|----------|-------|
| **Custom Recipe** | Process data with custom logic (Python/R/SQL) | [cli-docs/guides/custom-recipes.md](cli-docs/guides/custom-recipes.md) |
| **Webapp (Charts)** | Interactive visualizations using Plotly, Bokeh, D3 | [cli-docs/guides/webapps.md](cli-docs/guides/webapps.md) |
| **Prediction Algorithm** | Custom ML algorithm for Visual ML | [cli-docs/guides/prediction-algorithms.md](cli-docs/guides/prediction-algorithms.md) |
| **Macro** | Automated tasks, project utilities, batch operations | [cli-docs/guides/macros.md](cli-docs/guides/macros.md) |
| **Dataset Connector** | Connect to custom data sources/APIs | [cli-docs/guides/datasets.md](cli-docs/guides/datasets.md) |
| **Processor** | Custom Prepare recipe step | [cli-docs/guides/processors.md](cli-docs/guides/processors.md) |
| **File Format** | Custom file format parser | [cli-docs/guides/file-formats.md](cli-docs/guides/file-formats.md) |

### 2. Plugin identity questions:

- **Plugin name**: What should this plugin be called? (lowercase, hyphen-separated, no "plugin" or "custom" in name)
- **Description**: What does this plugin do? (1-2 sentences)
- **Author**: Who is the author? (Format: "Organization (firstName LASTNAME)")
- **Components**: What components will it contain? (can have multiple)

### 3. Dependencies:

- Does this plugin need external Python packages?
- If building webapps: Which visualization library? (Plotly recommended for offline use, Bokeh, or custom JS)

---

## Quick Reference

### Plugin Structure
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

### First Steps After Cloning

1. **Update plugin.json** - See [cli-docs/guides/plugin-configuration.md](cli-docs/guides/plugin-configuration.md)
2. **Configure code-env** if you need external packages
3. **Create your component(s)** using the appropriate guide
4. **Test locally** - See [cli-docs/guides/testing.md](cli-docs/guides/testing.md)

---

## Documentation Index

### Core Guides
- [Quick Start](cli-docs/QUICK_START.md) - Get your first component running
- [Plugin Configuration](cli-docs/guides/plugin-configuration.md) - plugin.json, code-env setup
- [Naming Conventions](cli-docs/guides/naming-conventions.md) - Required naming rules

### Component Guides
- [Custom Recipes](cli-docs/guides/custom-recipes.md) - Data processing recipes
- [Webapps & Charts](cli-docs/guides/webapps.md) - Interactive visualizations
- [Prediction Algorithms](cli-docs/guides/prediction-algorithms.md) - Custom ML algorithms
- [Macros](cli-docs/guides/macros.md) - Automated tasks and utilities
- [Dataset Connectors](cli-docs/guides/datasets.md) - Custom data sources
- [Processors](cli-docs/guides/processors.md) - Prepare recipe steps
- [File Formats](cli-docs/guides/file-formats.md) - Custom file parsers

### Reference
- [Parameters Reference](cli-docs/reference/parameters.md) - All parameter types
- [Type Conversions](cli-docs/reference/type-conversions.md) - Python types for parameters
- [Dataset API Quick Ref](cli-docs/reference/dataset-api-quick.md) - Read/write methods
- [Edge Cases](cli-docs/reference/edge-cases.md) - Validation and error handling
- [Testing Guide](cli-docs/guides/testing.md) - Unit and integration testing
- [Best Practices](cli-docs/guides/best-practices.md) - Coding standards and patterns

---

## Priority Components (Most Common)

Based on typical usage, prioritize learning these:

1. **Webapps for Charts** - Use Plotly for offline-capable visualizations
2. **Custom Recipes** - Most common data processing extension
3. **Prediction Algorithms** - Extend Visual ML capabilities
4. **Macros** - Automation and batch operations
5. **Dataset Connectors** - Custom data sources

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
- See [Naming Conventions](cli-docs/guides/naming-conventions.md) for complete rules

### Testing
- Always include unit tests in `tests/python/unit/`
- Integration tests use DSS scenarios via `dataiku-plugin-tests-utils`
- See [Testing Guide](cli-docs/guides/testing.md)

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

**Version:** 1.0
**Template Base:** dss-plugin-template
