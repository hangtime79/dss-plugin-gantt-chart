# Known Issues and Future Improvements

This document tracks identified architectural issues, scalability concerns, and potential improvements for the Gantt Chart plugin.

## High Priority: Scalability & Memory Management

### Issue: Full Dataset Loading in Memory
**Location:** `webapps/gantt-chart/backend.py` (line 63)
**Description:** The backend currently uses `dataset.get_dataframe()` without any row limit. This loads the entire dataset into the Python heap.
**Risk:** Large datasets (e.g., >100k rows or many columns) will cause the plugin process to crash with an Out-Of-Memory (OOM) error.
**Status:** TODO added to code.
**Recommendation:** 
- Implement `dataset.get_dataframe(limit=10000)` as a safety ceiling.
- Leverage the `maxTasks` configuration parameter to limit data loading at the source.
- Implement server-side pagination if large-scale visualization is required.

## Medium Priority: Performance

### Issue: In-Memory Filtering
**Location:** `webapps/gantt-chart/backend.py` (`apply_dataiku_filters`)
**Description:** Filtering is performed in Python after the data is already loaded.
**Recommendation:** Use Dataiku's `Dataset.get_dataframe(sampling='...', filter=...)` or similar API methods to push filtering down to the underlying data engine (SQL, Spark) whenever possible.

## Technical Debt / Cleanup

### Issue: Non-existent API calls (Fixed)
**Description:** Removed usage of `dataiku.get_datadir()` in `backend.py` which was causing an `AttributeError`.
**Prevention:** Ensure all `dataiku` module calls are verified against the official [Dataiku Plugin API documentation](https://doc.dataiku.com/dss/latest/plugins/).
