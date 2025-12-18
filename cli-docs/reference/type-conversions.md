# Parameter Type Conversions

Quick reference for what Python types you receive from plugin parameters.

---

## Type Mapping Table

| Param Type | Python Type | Example Value | Notes |
|------------|-------------|---------------|-------|
| `STRING` | `str` | `"hello"` | |
| `INT` | `int` | `10` | JSON may return float in edge cases |
| `DOUBLE` | `float` | `0.5` | |
| `BOOLEAN` | `bool` | `True` | Real bool, not string `"true"` |
| `STRINGS` | `list[str]` | `["a", "b"]` | Empty = `[]` |
| `COLUMNS` | `list[str]` | `["col1", "col2"]` | Empty = `[]` |
| `MAP` | `dict` | `{"key": "value"}` | |
| `KEY_VALUE_LIST` | `list[dict]` | `[{"k":"v"}]` | |
| `DATASET` | `str` | `"my_dataset"` | Dataset name string |
| `DATASETS` | `list[str]` | `["ds1", "ds2"]` | |
| `COLUMN` | `str` | `"column_name"` | Recipe-specific |
| `MANAGED_FOLDER` | `str` | `"folder_id"` | Folder ID string |
| `PRESET` | `dict` | See below | Nested dict of preset params |
| `CREDENTIAL_REQUEST` | `dict` | See below | Contains token/credentials |

---

## PRESET - Accessing Nested Values

PRESET parameters return a dict containing all parameters defined in the parameter set.

```python
# In recipe
config = get_recipe_config()
preset_params = config.get("my_preset")  # Returns dict or None
if preset_params:
    username = preset_params.get("username")
    api_key = preset_params.get("api_key")

# In macro
def __init__(self, project_key, config, plugin_config):
    preset = config.get("connection_preset", {})
    self.endpoint = preset.get("endpoint_url")
```

---

## CREDENTIAL_REQUEST - Accessing Credentials

For OAuth2 credentials, the access token is nested inside the credential dict:

```python
# OAuth2 credentials
oauth_creds = config.get("oauth_credentials", {})
access_token = oauth_creds.get("access_token")

# Example from Google Sheets plugin
if auth_type == "single-sign-on":
    oauth = config.get("oauth_credentials", {})
    if not oauth:
        raise ValueError("No Single Sign On preset selected")
    token = oauth.get("access_token")
```

For service account / basic credentials in a preset:

```python
# Service account preset
preset = config.get("service_account_preset", {})
credentials_json = preset.get("credentials")  # JSON string of service account
```

---

## Common Gotchas

| Issue | Solution |
|-------|----------|
| INT returns float | Cast: `int(config.get('my_int', 0))` |
| Empty COLUMNS | Check: `if not columns:` returns `True` for `[]` |
| Missing optional param | Use default: `config.get('param', default_value)` |
| PRESET not selected | Returns `None` or `{}`, always check before accessing |

---

See also: [Parameters Reference](parameters.md) for parameter JSON configuration.
