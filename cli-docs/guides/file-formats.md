# File Formats Guide

Custom file formats allow Dataiku to read and write files in formats not natively supported.

---

## Overview

A file format consists of files in `python-formats/{format-name}/`:
- **format.json** - Configuration and parameters
- **format.py** - Python class implementing read/write

---

## Format Configuration (format.json)

```json
{
    "meta": {
        "label": "My Format",
        "description": "Read/write custom file format",
        "icon": "fas fa-file"
    },

    "readable": true,
    "writable": true,

    "params": [
        {
            "name": "encoding",
            "label": "Encoding",
            "type": "STRING",
            "defaultValue": "utf-8"
        },
        {
            "name": "delimiter",
            "label": "Delimiter",
            "type": "STRING",
            "defaultValue": "|"
        }
    ]
}
```

---

## Format Code (format.py)

```python
from dataiku.customformat import Formatter, OutputFormatter


class MyFormatFormatter(Formatter):
    """Reader for custom format."""

    def __init__(self, config, plugin_config):
        Formatter.__init__(self, config, plugin_config)
        self.encoding = config.get('encoding', 'utf-8')
        self.delimiter = config.get('delimiter', '|')

    def get_output_formatter(self, stream, schema):
        """Return a writer for this format."""
        return MyFormatOutputFormatter(stream, schema, self.config)

    def get_reader(self, stream, schema=None):
        """
        Return an iterator of rows.

        Args:
            stream: File-like object to read from
            schema: Expected schema (may be None)

        Yields:
            Dict for each row
        """
        content = stream.read().decode(self.encoding)

        for line in content.split('\n'):
            if not line.strip():
                continue

            values = line.split(self.delimiter)

            if schema:
                columns = [col['name'] for col in schema['columns']]
                yield dict(zip(columns, values))
            else:
                yield {f'col_{i}': v for i, v in enumerate(values)}


class MyFormatOutputFormatter(OutputFormatter):
    """Writer for custom format."""

    def __init__(self, stream, schema, config):
        OutputFormatter.__init__(self, stream)
        self.schema = schema
        self.encoding = config.get('encoding', 'utf-8')
        self.delimiter = config.get('delimiter', '|')
        self.columns = [col['name'] for col in schema['columns']]

    def write_row(self, row):
        """Write a single row."""
        values = [str(row.get(col, '')) for col in self.columns]
        line = self.delimiter.join(values) + '\n'
        self.stream.write(line.encode(self.encoding))

    def close(self):
        """Called when writing is complete."""
        pass
```

---

## Complete Example: iCal Format Reader

**format.json:**
```json
{
    "meta": {
        "label": "iCal Events",
        "description": "Import calendar events from iCal files",
        "icon": "fas fa-calendar"
    },

    "readable": true,
    "writable": false,

    "params": [
        {
            "name": "encoding",
            "label": "File Encoding",
            "type": "STRING",
            "defaultValue": "utf-8"
        }
    ]
}
```

**format.py:**
```python
from dataiku.customformat import Formatter
from datetime import datetime


class ICalFormatter(Formatter):
    """Parse iCal/ICS calendar files."""

    def __init__(self, config, plugin_config):
        Formatter.__init__(self, config, plugin_config)
        self.encoding = config.get('encoding', 'utf-8')

    def get_reader(self, stream, schema=None):
        """Parse iCal and yield events as rows."""
        content = stream.read().decode(self.encoding)

        event = {}
        in_event = False

        for line in content.split('\n'):
            line = line.strip()

            if line == 'BEGIN:VEVENT':
                in_event = True
                event = {}

            elif line == 'END:VEVENT':
                in_event = False
                yield self._normalize_event(event)

            elif in_event and ':' in line:
                key, value = line.split(':', 1)
                # Handle property parameters
                if ';' in key:
                    key = key.split(';')[0]
                event[key] = value

    def _normalize_event(self, event):
        """Convert iCal event to standard row format."""
        return {
            'uid': event.get('UID', ''),
            'summary': event.get('SUMMARY', ''),
            'description': event.get('DESCRIPTION', ''),
            'start': self._parse_datetime(event.get('DTSTART', '')),
            'end': self._parse_datetime(event.get('DTEND', '')),
            'location': event.get('LOCATION', ''),
            'organizer': event.get('ORGANIZER', '')
        }

    def _parse_datetime(self, dt_string):
        """Parse iCal datetime format."""
        if not dt_string:
            return None
        try:
            # Handle YYYYMMDDTHHMMSSZ format
            dt_string = dt_string.replace('Z', '')
            if 'T' in dt_string:
                return datetime.strptime(dt_string, '%Y%m%dT%H%M%S').isoformat()
            else:
                return datetime.strptime(dt_string, '%Y%m%d').isoformat()
        except ValueError:
            return dt_string
```

---

## Folder Structure

```
python-formats/
└── ical-events/
    ├── format.json
    └── format.py
```

---

## Usage

1. Create a dataset pointing to files in your format
2. In dataset settings, select "Other" format type
3. Choose your custom format from the dropdown
4. Configure any format parameters

---

## Notes

- Set `readable: true` to enable reading files
- Set `writable: true` to enable writing files
- `get_reader()` yields dictionaries for each row
- For writing, return an `OutputFormatter` from `get_output_formatter()`
