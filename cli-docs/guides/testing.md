# Testing Guide

A comprehensive guide to unit testing and integration testing for Dataiku plugins.

---

## Overview

Dataiku plugins support two types of tests:
- **Unit Tests** - Test library code in isolation, no DSS required
- **Integration Tests** - Test plugin components in a running DSS instance

Test files live in the `tests/` directory:
```
tests/
├── python/
│   ├── unit/
│   │   ├── requirements.txt
│   │   └── test_*.py
│   └── integration/
│       ├── requirements.txt
│       └── test_*.py
```

---

## Unit Tests

Unit tests validate your library code without requiring a Dataiku instance.

### Setup

1. Create `tests/python/unit/requirements.txt`:
```
pytest
pytest-cov
```

2. Install test dependencies:
```bash
pip install -r tests/python/unit/requirements.txt
```

### Writing Unit Tests

Test files in `tests/python/unit/` should follow pytest conventions.

**Example: test_processing.py**

```python
import pytest
import sys
import os

# Add python-lib to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'python-lib'))

from my_plugin_lib.processing import process_data, validate_config


class TestProcessData:
    """Tests for the process_data function."""

    def test_basic_processing(self):
        """Test basic data processing."""
        import pandas as pd

        df = pd.DataFrame({
            'value': [1, 2, 3, 4, 5],
            'category': ['A', 'B', 'A', 'B', 'A']
        })

        result = process_data(df, column='value', multiplier=2)

        assert 'value' in result.columns
        assert result['value'].tolist() == [2, 4, 6, 8, 10]

    def test_empty_dataframe(self):
        """Test handling of empty dataframe."""
        import pandas as pd

        df = pd.DataFrame()
        result = process_data(df, column='value', multiplier=2)

        assert len(result) == 0

    def test_missing_column(self):
        """Test error when column doesn't exist."""
        import pandas as pd

        df = pd.DataFrame({'other': [1, 2, 3]})

        with pytest.raises(ValueError, match="Column 'value' not found"):
            process_data(df, column='value', multiplier=2)


class TestValidateConfig:
    """Tests for config validation."""

    def test_valid_config(self):
        """Test that valid config passes."""
        config = {
            'column': 'value',
            'threshold': 0.5,
            'method': 'mean'
        }
        # Should not raise
        validate_config(config)

    def test_missing_required_field(self):
        """Test error when required field is missing."""
        config = {'threshold': 0.5}

        with pytest.raises(ValueError, match="'column' is required"):
            validate_config(config)

    def test_invalid_threshold(self):
        """Test error when threshold is out of range."""
        config = {
            'column': 'value',
            'threshold': 1.5  # Should be 0-1
        }

        with pytest.raises(ValueError, match="threshold must be between 0 and 1"):
            validate_config(config)


@pytest.fixture
def sample_dataframe():
    """Fixture providing a sample dataframe."""
    import pandas as pd
    return pd.DataFrame({
        'id': [1, 2, 3, 4, 5],
        'value': [10.0, 20.0, 30.0, 40.0, 50.0],
        'category': ['A', 'A', 'B', 'B', 'C']
    })


def test_with_fixture(sample_dataframe):
    """Test using the fixture."""
    assert len(sample_dataframe) == 5
    assert 'value' in sample_dataframe.columns
```

### Running Unit Tests

```bash
# Run all unit tests
cd tests/python/unit
pytest

# Run with coverage
pytest --cov=python-lib --cov-report=html

# Run specific test file
pytest test_processing.py

# Run specific test
pytest test_processing.py::TestProcessData::test_basic_processing

# Verbose output
pytest -v
```

### Best Practices for Unit Tests

1. **Don't import dataiku** - Unit tests should run without DSS
2. **Mock external dependencies** - Use pytest-mock for API calls
3. **Test edge cases** - Empty data, nulls, invalid inputs
4. **Keep tests fast** - Avoid slow operations
5. **Use fixtures** - Share setup code between tests

---

## Integration Tests

Integration tests run plugin components in a real DSS instance using DSS scenarios.

### Prerequisites

- `dataiku-plugin-tests-utils` package
- DSS instance with test scenarios
- API keys for test users

### Setup

1. Create `tests/python/integration/requirements.txt`:
```
git+https://github.com/dataiku/dataiku-plugin-tests-utils.git@master#egg=dataiku-plugin-tests-utils
pytest
```

2. Create configuration file (e.g., `test_config.json`):
```json
{
    "DSS_DEV": {
        "url": "https://dss-dev.company.com",
        "users": {
            "admin": "your-api-key-here",
            "default": "admin"
        },
        "python_interpreter": ["PYTHON310", "PYTHON311"]
    },
    "DSS_TEST": {
        "url": "https://dss-test.company.com",
        "users": {
            "admin": "your-api-key-here",
            "tester": "another-api-key",
            "default": "tester"
        },
        "python_interpreter": ["PYTHON310"]
    }
}
```

3. Set environment variable:
```bash
export PLUGIN_INTEGRATION_TEST_INSTANCE=/path/to/test_config.json
```

### Writing Integration Tests

Integration tests trigger DSS scenarios that exercise plugin functionality.

**Example: test_recipe_scenario.py**

```python
from dku_plugin_test_utils import dss_scenario


def test_run_recipe_basic(user_dss_clients):
    """Test basic recipe functionality."""
    dss_scenario.run(
        user_dss_clients,
        project_key='PLUGIN_TESTS',
        scenario_id='test_recipe_basic',
        user='default'
    )


def test_run_recipe_edge_cases(user_dss_clients):
    """Test recipe with edge cases."""
    dss_scenario.run(
        user_dss_clients,
        project_key='PLUGIN_TESTS',
        scenario_id='test_recipe_edge_cases',
        user='default'
    )


def test_run_webapp_chart(user_dss_clients):
    """Test webapp chart generation."""
    dss_scenario.run(
        user_dss_clients,
        project_key='PLUGIN_TESTS',
        scenario_id='test_webapp_chart',
        user='default'
    )
```

### Creating Test Scenarios in DSS

1. Create a test project in DSS (e.g., `PLUGIN_TESTS`)
2. Install your plugin in development mode
3. Create scenarios that:
   - Set up test data
   - Run plugin components
   - Verify results
   - Clean up

**Example scenario structure:**
- Step 1: Create/refresh test dataset
- Step 2: Run plugin recipe
- Step 3: Python step to verify output
- Step 4: Clean up (optional)

### Running Integration Tests

```bash
# Set config path
export PLUGIN_INTEGRATION_TEST_INSTANCE=/path/to/config.json

# Run integration tests
cd tests/python/integration
pytest

# Run specific test
pytest test_recipe_scenario.py::test_run_recipe_basic
```

### Generating Allure Reports

For graphical test reports:

1. Install Allure CLI (see [Allure docs](https://docs.qameta.io/allure/#_manual_installation))

2. Create `allure_report` directory in tests

3. Run with Allure:
```bash
pytest --alluredir=allure_report/
allure serve allure_report/
```

---

## Test Project Structure

Complete test structure for a plugin:

```
your-plugin/
├── python-lib/
│   └── my_plugin_lib/
│       ├── __init__.py
│       └── processing.py
├── custom-recipes/
│   └── my-recipe/
│       ├── recipe.json
│       └── recipe.py
├── tests/
│   └── python/
│       ├── unit/
│       │   ├── requirements.txt
│       │   ├── conftest.py
│       │   ├── test_processing.py
│       │   └── test_validation.py
│       └── integration/
│           ├── requirements.txt
│           ├── allure_report/
│           └── test_scenarios.py
└── Makefile
```

---

## Makefile for Tests

Create a `Makefile` to simplify test execution:

```makefile
.PHONY: test test-unit test-integration lint

# Run all unit tests
test-unit:
	cd tests/python/unit && pytest -v

# Run unit tests with coverage
test-unit-cov:
	cd tests/python/unit && pytest --cov=../../../python-lib --cov-report=html -v

# Run integration tests
test-integration:
	cd tests/python/integration && pytest -v

# Run all tests
test: test-unit test-integration

# Lint code
lint:
	ruff check python-lib/ custom-recipes/

# Install dev dependencies
install-dev:
	pip install -r tests/python/unit/requirements.txt
	pip install ruff
```

Usage:
```bash
make test-unit
make test-unit-cov
make test-integration
make lint
```

---

## Mocking Dataiku in Unit Tests

For unit testing code that uses dataiku, mock the imports:

```python
import pytest
from unittest.mock import Mock, patch, MagicMock
import pandas as pd


@pytest.fixture
def mock_dataiku():
    """Mock dataiku module for unit tests."""
    with patch.dict('sys.modules', {'dataiku': MagicMock()}):
        import dataiku
        yield dataiku


def test_with_mocked_dataiku(mock_dataiku):
    """Test code that imports dataiku."""
    # Setup mock
    mock_dataset = MagicMock()
    mock_dataset.get_dataframe.return_value = pd.DataFrame({
        'col1': [1, 2, 3]
    })
    mock_dataiku.Dataset.return_value = mock_dataset

    # Now import and test your code
    # from my_plugin_lib import some_function
    # result = some_function()
    # assert ...
```

---

## CI/CD Integration

### GitHub Actions Example

`.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.10', '3.11']

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: ${{ matrix.python-version }}

      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r tests/python/unit/requirements.txt

      - name: Run unit tests
        run: |
          cd tests/python/unit
          pytest -v --junitxml=results.xml

      - name: Upload results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-results-${{ matrix.python-version }}
          path: tests/python/unit/results.xml
```

### Jenkins Example

See `Jenkinsfile` in the template for Jenkins integration.

---

## Best Practices Summary

1. **Separate concerns** - Keep business logic in `python-lib/` for easy unit testing
2. **Test early** - Write tests as you develop
3. **Unit test everything** - Aim for high coverage of library code
4. **Mock external calls** - Don't depend on external services in unit tests
5. **Integration test key flows** - Cover main use cases in DSS scenarios
6. **Use fixtures** - Share test setup code
7. **Keep tests fast** - Slow tests don't get run
8. **Test edge cases** - Empty data, nulls, large datasets
9. **Automate** - Run tests in CI/CD pipeline
