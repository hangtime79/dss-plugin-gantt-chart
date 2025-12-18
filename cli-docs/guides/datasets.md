# Dataset Connectors Guide

Custom dataset connectors (also called Python connectors) allow Dataiku to read from and write to custom data sources - APIs, databases, file formats, or any other data source.

---

## Overview

A dataset connector consists of files in `python-connectors/{connector-name}/`:
- **connector.json** - Configuration: parameters, read/write capabilities
- **connector.py** - Python class implementing the connector logic

---

## Connector Configuration (connector.json)

### Complete Structure

```json
{
    "meta": {
        "label": "My Connector",
        "description": "Connect to custom data source",
        "icon": "fas fa-cloud-download-alt"
    },

    "readable": true,
    "writable": false,

    "params": [
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
            "description": "Authentication key",
            "mandatory": true
        },
        {
            "name": "resource",
            "label": "Resource",
            "type": "SELECT",
            "selectChoices": [
                {"value": "users", "label": "Users"},
                {"value": "orders", "label": "Orders"},
                {"value": "products", "label": "Products"}
            ]
        },
        {
            "name": "limit",
            "label": "Row Limit",
            "type": "INT",
            "defaultValue": 1000,
            "description": "Maximum rows to fetch"
        }
    ]
}
```

### Key Configuration Fields

| Field | Description |
|-------|-------------|
| `readable` | Can read data from this source |
| `writable` | Can write data to this source |
| `params` | User-configurable parameters |

---

## Connector Code (connector.py)

### Basic Structure (Read-Only)

```python
from dataiku.connector import Connector


class MyConnector(Connector):
    """
    Custom dataset connector.

    Methods:
    - __init__: Parse configuration
    - get_read_schema: Return column schema (optional)
    - generate_rows: Yield data rows
    """

    def __init__(self, config, plugin_config):
        """
        Initialize the connector.

        Args:
            config: User-provided parameters from connector.json
            plugin_config: Plugin-level settings
        """
        Connector.__init__(self, config, plugin_config)

        # Parse configuration
        self.api_endpoint = config.get('api_endpoint')
        self.api_key = config.get('api_key')
        self.resource = config.get('resource', 'users')
        self.limit = int(config.get('limit', 1000))

    def get_read_schema(self):
        """
        Return the schema of the dataset (optional).

        If not implemented, schema is inferred from data.

        Returns:
            Dict with 'columns' key containing list of column definitions,
            or None for auto-detection
        """
        return None

    def generate_rows(self, dataset_schema=None, dataset_partitioning=None,
                      partition_id=None, records_limit=-1):
        """
        Generate data rows.

        Args:
            dataset_schema: Schema of the dataset (if defined)
            dataset_partitioning: Partitioning configuration
            partition_id: Specific partition to read
            records_limit: Maximum records to return (-1 = no limit)

        Yields:
            Dict representing each row
        """
        # Your data fetching logic here
        data = self.fetch_data()

        for row in data:
            yield row

    def fetch_data(self):
        """Fetch data from the source."""
        import requests

        url = f"{self.api_endpoint}/{self.resource}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        params = {"limit": self.limit}

        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()

        return response.json()
```

### Read-Write Connector

```python
from dataiku.connector import Connector, CustomDatasetWriter


class MyConnector(Connector):
    """Connector with read and write support."""

    def __init__(self, config, plugin_config):
        Connector.__init__(self, config, plugin_config)
        self.config = config

    def get_read_schema(self):
        return None

    def generate_rows(self, dataset_schema=None, dataset_partitioning=None,
                      partition_id=None, records_limit=-1):
        # Read implementation
        data = self.fetch_data()
        for row in data:
            yield row

    def get_writer(self, dataset_schema=None, dataset_partitioning=None,
                   partition_id=None):
        """
        Return a writer for this connector.

        Returns:
            CustomDatasetWriter instance
        """
        return MyConnectorWriter(self.config, dataset_schema)


class MyConnectorWriter(CustomDatasetWriter):
    """Writer for the custom connector."""

    def __init__(self, config, dataset_schema):
        CustomDatasetWriter.__init__(self)
        self.config = config
        self.schema = dataset_schema
        self.buffer = []

    def write_row(self, row):
        """
        Write a single row.

        Args:
            row: Tuple of values matching schema column order
        """
        # Convert tuple to dict using schema
        columns = [col['name'] for col in self.schema['columns']]
        row_dict = dict(zip(columns, row))
        self.buffer.append(row_dict)

        # Flush periodically
        if len(self.buffer) >= 1000:
            self.flush()

    def flush(self):
        """Flush buffered rows to destination."""
        if self.buffer:
            self.write_batch(self.buffer)
            self.buffer = []

    def write_batch(self, rows):
        """Write a batch of rows to the destination."""
        import requests

        url = f"{self.config['api_endpoint']}/upload"
        headers = {"Authorization": f"Bearer {self.config['api_key']}"}

        response = requests.post(url, headers=headers, json=rows)
        response.raise_for_status()

    def close(self):
        """Called when writing is complete."""
        self.flush()
```

---

## Complete Examples

### Example 1: Random Data Generator

Generates random data for testing/development.

**connector.json:**
```json
{
    "meta": {
        "label": "Random Data Generator",
        "description": "Generate random test data",
        "icon": "fas fa-random"
    },

    "readable": true,
    "writable": false,

    "params": [
        {
            "name": "num_rows",
            "label": "Number of Rows",
            "type": "INT",
            "defaultValue": 100,
            "mandatory": true
        },
        {
            "name": "columns",
            "label": "Column Names",
            "type": "STRINGS",
            "description": "List of column names to generate",
            "mandatory": true
        },
        {
            "name": "column_types",
            "label": "Column Types",
            "type": "STRINGS",
            "description": "Types: string, int, float, date",
            "mandatory": false
        }
    ]
}
```

**connector.py:**
```python
from dataiku.connector import Connector
import random
import string
from datetime import datetime, timedelta


def generate_random_value(dtype):
    """Generate a random value of the specified type."""
    if dtype == 'int':
        return random.randint(0, 1000)
    elif dtype == 'float':
        return round(random.uniform(0, 1000), 2)
    elif dtype == 'date':
        days_ago = random.randint(0, 365)
        return (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d')
    else:  # string
        length = random.randint(5, 15)
        return ''.join(random.choices(string.ascii_letters, k=length))


class MyConnector(Connector):
    """Generate random test data."""

    def __init__(self, config, plugin_config):
        Connector.__init__(self, config, plugin_config)

        self.num_rows = int(config.get('num_rows', 100))
        self.columns = config.get('columns', ['col1', 'col2', 'col3'])
        self.column_types = config.get('column_types', [])

        # Fill missing types with 'string'
        while len(self.column_types) < len(self.columns):
            self.column_types.append('string')

    def get_read_schema(self):
        """Define schema based on column types."""
        type_mapping = {
            'int': 'bigint',
            'float': 'double',
            'date': 'date',
            'string': 'string'
        }

        columns = []
        for name, dtype in zip(self.columns, self.column_types):
            columns.append({
                'name': name,
                'type': type_mapping.get(dtype, 'string')
            })

        return {'columns': columns}

    def generate_rows(self, dataset_schema=None, dataset_partitioning=None,
                      partition_id=None, records_limit=-1):
        """Generate random rows."""
        limit = self.num_rows
        if records_limit > 0:
            limit = min(limit, records_limit)

        for _ in range(limit):
            row = {}
            for name, dtype in zip(self.columns, self.column_types):
                row[name] = generate_random_value(dtype)
            yield row
```

### Example 2: REST API Connector

**connector.json:**
```json
{
    "meta": {
        "label": "REST API Connector",
        "description": "Connect to REST APIs",
        "icon": "fas fa-cloud"
    },

    "readable": true,
    "writable": false,

    "params": [
        {
            "name": "base_url",
            "label": "Base URL",
            "type": "STRING",
            "mandatory": true
        },
        {
            "name": "endpoint",
            "label": "Endpoint Path",
            "type": "STRING",
            "mandatory": true
        },
        {
            "name": "auth_type",
            "label": "Authentication Type",
            "type": "SELECT",
            "selectChoices": [
                {"value": "none", "label": "None"},
                {"value": "bearer", "label": "Bearer Token"},
                {"value": "basic", "label": "Basic Auth"},
                {"value": "api_key", "label": "API Key Header"}
            ],
            "defaultValue": "none"
        },
        {
            "name": "auth_token",
            "label": "Auth Token/Password",
            "type": "PASSWORD",
            "mandatory": false
        },
        {
            "name": "auth_user",
            "label": "Username (for Basic Auth)",
            "type": "STRING",
            "mandatory": false
        },
        {
            "name": "api_key_header",
            "label": "API Key Header Name",
            "type": "STRING",
            "defaultValue": "X-API-Key",
            "mandatory": false
        },
        {
            "name": "data_path",
            "label": "JSON Data Path",
            "type": "STRING",
            "description": "Path to data array in response (e.g., 'results' or 'data.items')",
            "mandatory": false
        },
        {
            "name": "pagination_type",
            "label": "Pagination Type",
            "type": "SELECT",
            "selectChoices": [
                {"value": "none", "label": "None"},
                {"value": "offset", "label": "Offset/Limit"},
                {"value": "page", "label": "Page Number"}
            ],
            "defaultValue": "none"
        },
        {
            "name": "page_size",
            "label": "Page Size",
            "type": "INT",
            "defaultValue": 100
        }
    ]
}
```

**connector.py:**
```python
from dataiku.connector import Connector
import requests
import logging

logger = logging.getLogger(__name__)


class MyConnector(Connector):
    """Generic REST API connector with pagination support."""

    def __init__(self, config, plugin_config):
        Connector.__init__(self, config, plugin_config)

        self.base_url = config['base_url'].rstrip('/')
        self.endpoint = config['endpoint'].lstrip('/')
        self.auth_type = config.get('auth_type', 'none')
        self.auth_token = config.get('auth_token', '')
        self.auth_user = config.get('auth_user', '')
        self.api_key_header = config.get('api_key_header', 'X-API-Key')
        self.data_path = config.get('data_path', '')
        self.pagination_type = config.get('pagination_type', 'none')
        self.page_size = int(config.get('page_size', 100))

    def _get_headers(self):
        """Build request headers based on auth type."""
        headers = {'Content-Type': 'application/json'}

        if self.auth_type == 'bearer':
            headers['Authorization'] = f'Bearer {self.auth_token}'
        elif self.auth_type == 'api_key':
            headers[self.api_key_header] = self.auth_token

        return headers

    def _get_auth(self):
        """Get auth tuple for basic auth."""
        if self.auth_type == 'basic':
            return (self.auth_user, self.auth_token)
        return None

    def _extract_data(self, response_json):
        """Extract data array from response using data_path."""
        if not self.data_path:
            if isinstance(response_json, list):
                return response_json
            return [response_json]

        # Navigate nested path
        data = response_json
        for key in self.data_path.split('.'):
            if isinstance(data, dict) and key in data:
                data = data[key]
            else:
                return []

        if isinstance(data, list):
            return data
        return [data]

    def generate_rows(self, dataset_schema=None, dataset_partitioning=None,
                      partition_id=None, records_limit=-1):
        """Fetch and yield rows from API."""
        url = f"{self.base_url}/{self.endpoint}"
        headers = self._get_headers()
        auth = self._get_auth()

        total_fetched = 0
        page = 0
        offset = 0

        while True:
            # Build pagination params
            params = {}
            if self.pagination_type == 'offset':
                params['offset'] = offset
                params['limit'] = self.page_size
            elif self.pagination_type == 'page':
                params['page'] = page
                params['per_page'] = self.page_size

            # Make request
            logger.info(f"Fetching from {url} with params {params}")
            response = requests.get(url, headers=headers, auth=auth, params=params)
            response.raise_for_status()

            # Extract data
            data = self._extract_data(response.json())

            if not data:
                break

            # Yield rows
            for row in data:
                if records_limit > 0 and total_fetched >= records_limit:
                    return

                yield row
                total_fetched += 1

            # Check if we should continue pagination
            if self.pagination_type == 'none' or len(data) < self.page_size:
                break

            page += 1
            offset += self.page_size

        logger.info(f"Fetched {total_fetched} total rows")
```

---

## Schema Definition

### Explicit Schema

```python
def get_read_schema(self):
    return {
        'columns': [
            {'name': 'id', 'type': 'bigint'},
            {'name': 'name', 'type': 'string'},
            {'name': 'amount', 'type': 'double'},
            {'name': 'created_at', 'type': 'date'},
            {'name': 'is_active', 'type': 'boolean'}
        ]
    }
```

### Available Column Types

| Type | Description |
|------|-------------|
| `string` | Text |
| `bigint` | Integer |
| `double` | Floating point |
| `boolean` | True/False |
| `date` | Date (YYYY-MM-DD) |
| `object` | JSON/Complex object |
| `array` | Array/List |

### Auto-Detection

Return `None` from `get_read_schema()` to let Dataiku infer the schema:

```python
def get_read_schema(self):
    return None  # Schema will be inferred from data
```

---

## Best Practices

### 1. Handle Pagination

```python
def generate_rows(self, ...):
    page = 0
    while True:
        data = self.fetch_page(page)
        if not data:
            break
        for row in data:
            yield row
        page += 1
```

### 2. Use Connection Pooling

```python
import requests

class MyConnector(Connector):
    def __init__(self, config, plugin_config):
        Connector.__init__(self, config, plugin_config)
        self.session = requests.Session()
        # Configure session...

    def generate_rows(self, ...):
        # Use self.session for all requests
        response = self.session.get(url)
```

### 3. Error Handling

```python
def generate_rows(self, ...):
    try:
        data = self.fetch_data()
        for row in data:
            yield row
    except requests.RequestException as e:
        raise Exception(f"Failed to fetch data: {e}")
```

### 4. Logging

```python
import logging
logger = logging.getLogger(__name__)

class MyConnector(Connector):
    def generate_rows(self, ...):
        logger.info(f"Starting to fetch data from {self.endpoint}")
        # ...
        logger.info(f"Fetched {count} rows")
```

---

## Folder Structure

```
python-connectors/
└── my-connector/
    ├── connector.json
    └── connector.py
```

**Naming Rule:** Connector name MUST start with plugin ID (e.g., `my-plugin-api-connector`).
