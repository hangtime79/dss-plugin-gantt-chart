# Dataset API Quick Reference

Quick reference for `dataiku.Dataset` methods used in plugin recipes.

---

## Reading Data

| Method | Use When | Returns |
|--------|----------|---------|
| `get_dataframe()` | Data fits in RAM | `pd.DataFrame` |
| `iter_dataframes(chunksize=N)` | Large data, chunked | Generator of DataFrames |
| `iter_rows()` | Row-by-row processing | Generator of lists |
| `iter_tuples()` | Row-by-row as tuples | Generator of tuples |

### get_dataframe() - Common Parameters

```python
df = dataset.get_dataframe(
    columns=['col1', 'col2'],     # Select specific columns (optional)
    sampling='head',              # 'head', 'random', 'random-column'
    limit=10000,                  # Max rows to return
    infer_with_pandas=True,       # Use pandas type inference
)
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `columns` | None | List of column names to read |
| `sampling` | `'head'` | `'head'`, `'random'`, `'random-column'` |
| `limit` | None | Max rows (used with sampling) |
| `ratio` | None | Sample ratio 0-1 (used with `'random'`) |
| `infer_with_pandas` | `True` | Let pandas infer types vs use DSS schema |

**Full API:** [developer.dataiku.com/datasets](https://developer.dataiku.com/latest/api-reference/python/datasets.html)

---

## Writing Data

| Method | Schema Behavior | Use When |
|--------|-----------------|----------|
| `write_with_schema(df)` | **Replaces** schema from DataFrame | Most common - sets schema + writes |
| `write_dataframe(df)` | **Keeps** existing schema | Writing to pre-defined schema |
| `write_schema(columns)` | **Sets** schema, no data | Define schema before streaming writes |
| `write_schema_from_dataframe(df)` | **Sets** schema from df structure | Schema only, no data written |

### Typical Recipe Pattern

```python
# Read
input_ds = dataiku.Dataset(get_input_names_for_role('input')[0])
df = input_ds.get_dataframe()

# Process
result_df = process(df)

# Write (most common approach)
output_ds = dataiku.Dataset(get_output_names_for_role('output')[0])
output_ds.write_with_schema(result_df)
```

### Streaming Write (Large Data)

```python
output_ds = dataiku.Dataset(get_output_names_for_role('output')[0])
output_ds.write_schema(schema)  # Set schema first

with output_ds.get_writer() as writer:
    for chunk in process_chunks():
        writer.write_dataframe(chunk)
```

---

## Schema Structure

Schema is a list of column definitions:

```python
schema = [
    {"name": "id", "type": "bigint"},
    {"name": "name", "type": "string"},
    {"name": "value", "type": "double"},
    {"name": "created", "type": "date"},
    {"name": "active", "type": "boolean"}
]

# Set schema explicitly
dataset.write_schema(schema)
```

### DSS Column Types

| Type | Description |
|------|-------------|
| `string` | Text |
| `bigint` | Integer |
| `double` | Float |
| `boolean` | True/False |
| `date` | Date only |
| `object` | Complex/JSON |

---

## Large Dataset Handling

```python
# Chunked reading
for chunk_df in input_ds.iter_dataframes(chunksize=10000):
    process(chunk_df)

# Chunked writing
first_chunk = True
with output_ds.get_writer() as writer:
    for chunk in generate_chunks():
        if first_chunk:
            output_ds.write_schema_from_dataframe(chunk, drop_and_create=True)
            first_chunk = False
        writer.write_dataframe(chunk)
```

---

See also: [Edge Cases](edge-cases.md) for handling empty datasets and validation.
