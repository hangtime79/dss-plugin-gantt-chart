# Security Review Report

**Date:** 2025-12-31
**Reviewed By:** Claude Code Security Review
**Scope:** Full codebase excluding `examples/` folder
**Overall Risk Level:** Low

---

## Executive Summary

This security review of the DSS Gantt Chart Plugin found the codebase to be **generally well-designed from a security perspective**. The plugin follows good security practices including input validation, XSS protection, and proper separation of concerns. A few minor findings were identified, with one medium-severity issue related to stack trace exposure.

---

## Findings

### 1. Stack Trace Exposure in Error Responses [MEDIUM]

**Location:** `webapps/gantt-chart/backend.py:260`

**Issue:** The backend exposes full Python stack traces to the frontend in error responses:
```python
return json.dumps({
    'error': {
        'code': 'INTERNAL_ERROR',
        'message': f'Internal error: {str(e)}',
        'details': {'traceback': traceback.format_exc()}  # <-- Exposed
    }
}), 500
```

**Risk:** Stack traces can reveal:
- Internal file paths and directory structure
- Library versions and dependencies
- Internal logic and code paths
- Potentially sensitive configuration details

**Recommendation:** Remove `traceback.format_exc()` from the client response. Log it server-side only:
```python
logger.error(traceback.format_exc())  # Keep for debugging
return json.dumps({
    'error': {
        'code': 'INTERNAL_ERROR',
        'message': 'An internal error occurred. Check server logs for details.'
    }
}), 500
```

---

### 2. noJSSecurity Flag Enabled [INFO]

**Location:** `webapps/gantt-chart/webapp.json:10`

**Issue:** The webapp has `"noJSSecurity": "true"` which disables Dataiku's JavaScript sandboxing.

**Context:** This is intentionally set because:
- The webapp uses the bundled `frappe-gantt` library which requires direct DOM manipulation
- The plugin runs within Dataiku's iframe context
- This is a common pattern for complex visualization plugins

**Risk:** Low - the webapp runs in an isolated iframe and processes data only from trusted DSS datasets.

**Recommendation:** Keep as-is; document the reason for this setting.

---

### 3. Metadata Warnings Not Escaped [LOW]

**Location:** `webapps/gantt-chart/app.js:2471`

**Issue:** Warning messages from backend metadata are inserted into HTML without escaping:
```javascript
html += metadata.warnings.slice(0, 3).map(w => `⚠ ${w}`).join('<br>');
```

**Context:** The warnings come from the backend's `TaskTransformer` and contain:
- Auto-generated messages about duplicate IDs
- Dependency validation warnings
- Column not found warnings

All warning messages are constructed server-side from controlled strings, not user input.

**Risk:** Very low - attack would require control over backend message generation.

**Recommendation:** Apply `escapeHtml()` for defense-in-depth:
```javascript
html += metadata.warnings.slice(0, 3).map(w => `⚠ ${escapeHtml(w)}`).join('<br>');
```

---

### 4. Local Storage Key Privacy [INFO]

**Location:** `webapps/gantt-chart/app.js:227-241`

**Positive Finding:** The codebase properly hashes dataset names before storing view preferences in localStorage, preventing information leakage:
```javascript
function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
}
```

This is a good security practice.

---

## Positive Security Observations

### XSS Protection
- ✅ Proper `escapeHtml()` function using textContent/innerHTML pattern (`app.js:2529-2534`)
- ✅ User-controlled data (task names, field values) is escaped before insertion
- ✅ No use of `eval()`, `new Function()`, or dynamic code execution
- ✅ No dangerous string concatenation in setTimeout/setInterval

### Input Validation
- ✅ Date parsing with robust validation (`date_parser.py`)
- ✅ Progress values clamped to 0-100 range (`task_transformer.py:462-463`)
- ✅ Dependency cycle detection prevents infinite loops (`dependency_validator.py`)
- ✅ CSS class names are sanitized with hex-encoding for special characters (`task_transformer.py:556-584`)
- ✅ Custom palette colors validated against hex pattern (`color_mapper.py:95`)

### Data Flow Security
- ✅ No SQL queries - uses Dataiku's dataset API
- ✅ No shell command execution
- ✅ No file system operations in python-lib
- ✅ No network requests to external services
- ✅ Read-only mode enforced (`readonly: true` in Gantt config)

### Dependency Security
- ✅ `npm audit` reports 0 vulnerabilities
- ✅ Frappe Gantt library bundled locally (air-gap compatible)
- ✅ Minimal Python dependencies (uses Dataiku's built-in packages)

### Credential Handling
- ✅ No hardcoded secrets, API keys, or credentials found
- ✅ No sensitive data logged
- ✅ Test data contains only placeholder authentication task names, not actual secrets

---

## Recommendations Summary

| Priority | Finding | Action |
|----------|---------|--------|
| **Medium** | Stack trace exposure | Remove from error response, log server-side only |
| **Low** | Unescaped warnings | Apply escapeHtml() for defense-in-depth |
| **Info** | noJSSecurity flag | Document reason in code comments |

---

## Conclusion

The Gantt Chart Plugin demonstrates good security hygiene overall. The single medium-severity finding (stack trace exposure) should be addressed before production deployment to prevent information disclosure. The low-priority findings are minor defense-in-depth improvements.

The codebase follows security best practices including:
- Input validation at boundaries
- Output encoding for HTML content
- No dangerous code patterns (eval, shell injection, etc.)
- Proper separation between frontend and backend concerns
- Defensive programming against malformed data
