# Bugfix v0.6.0 Specification

## Branch
`bugfix/v0.6.0-fix-test-infrastructure`

## Linked Issues
- Fixes #29

## Overview
Fix unit test infrastructure so tests can run without requiring DSS integration test configuration.

---

## Bug: Unit tests fail due to `dku_plugin_test_utils` hook

### Symptom
Running unit tests fails with:
```
ValueError: 'PLUGIN_INTEGRATION_TEST_INSTANCE' is not defined, please point it to an instance configuration file
```

### Root Cause
The `dku_plugin_test_utils` pytest plugin is globally installed and registers a `pytest_generate_tests` hook that runs unconditionally for ALL tests. This hook calls `ScenarioConfiguration()` which requires `PLUGIN_INTEGRATION_TEST_INSTANCE` environment variable — even for unit tests that don't need DSS.

The plugin entry point is registered as `pytest_plugin` in the `pytest11` group.

---

## Fix Plan

### Step 1: Create pytest.ini for unit tests
**File:** `tests/python/unit/pytest.ini`

Create a pytest configuration file that disables the DSS integration plugin for unit tests:
```ini
[pytest]
addopts = -p no:pytest_plugin
```

This disables the `dku_plugin_test_utils` hook during unit test collection.

### Step 2: Version Bump
**File:** `plugin.json`

Bump version from `0.5.1` to `0.6.0`.

---

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `tests/python/unit/pytest.ini` | Create | Add pytest config to disable DSS plugin |
| `plugin.json` | Modify | Bump version to 0.6.0 |

---

## Testing Checklist

- [ ] Unit tests run without `PLUGIN_INTEGRATION_TEST_INSTANCE` set
- [ ] All 111 existing passing tests still pass
- [ ] Pre-existing failure (`test_multiple_dependencies_with_floats`) unchanged
- [ ] Integration tests in `tests/python/integration/` still use DSS plugin (no regression)

**Run command:**
```bash
PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v
```

Expected: 111 passed, 1 failed (pre-existing)

---

## User QA Gate

**CRITICAL: Code must be committed BEFORE User QA.**

Dataiku plugins load from committed code, not working directory files. If changes aren't committed, the user will test against old code.

**Pre-QA Commit Process:**
1. After implementing the fix, **commit the changes** with appropriate message format:
   ```
   fix(v0.6.0): disable DSS plugin for unit tests (#29)

   The dku_plugin_test_utils pytest plugin runs unconditionally and
   requires PLUGIN_INTEGRATION_TEST_INSTANCE env var, even for unit
   tests that don't need DSS.

   Changes:
   - tests/python/unit/pytest.ini: Add addopts = -p no:pytest_plugin
   - plugin.json: Bump version to 0.6.0

   Fixes #29

   [claude signature]
   ```

2. Verify commit was successful: `git log --oneline -1`

3. Notify the user that code is committed and ready for QA

**User QA Steps:**
```
1. Open terminal in plugin directory
2. Run: PYTHONPATH=python-lib:$PYTHONPATH python3 -m pytest tests/python/unit/ -v
3. Verify: 111 passed, 1 failed (pre-existing failure)
4. Confirm no PLUGIN_INTEGRATION_TEST_INSTANCE error
```

**Do not proceed to PR/merge until user confirms the fix works.**

---

## Rollback Plan

Delete `tests/python/unit/pytest.ini` and revert `plugin.json` version:
```bash
git checkout HEAD~1 -- tests/python/unit/pytest.ini plugin.json
```

Or simply:
```bash
git revert HEAD
```

---

## Watch Out For

1. **Don't break integration tests** — The `pytest.ini` must only be in `tests/python/unit/`, not root directory
2. **Pre-existing test failure** — `test_multiple_dependencies_with_floats` fails independently; don't try to fix it in this PR
3. **Future plugins** — If other pytest plugins conflict, add them to the `-p no:` list

---

## Notes

### Pre-Existing Test Failure
One test fails independently of this fix:
- `test_multiple_dependencies_with_floats` — expects float dependencies like `'1.0'` to normalize to `'1'`
- This is a separate bug in dependency parsing, not related to test infrastructure
- Tracked as #38
