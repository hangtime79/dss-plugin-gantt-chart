"""
Date parsing utilities for Gantt chart plugin.

Provides robust date parsing with multiple fallback strategies to handle
various date formats from Dataiku datasets.
"""

import re
import datetime
from typing import Tuple, Optional, Union
import pandas as pd
import numpy as np


def parse_date_to_iso(value: any) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse a date value to ISO format string (YYYY-MM-DD).

    Tries multiple parsing strategies in order:
    1. None/NaN/pd.NaT → return (None, "null_value")
    2. ISO string "YYYY-MM-DD" → validate and return
    3. ISO datetime string "YYYY-MM-DDTHH:MM:SS..." → extract date part
    4. pandas Timestamp → convert via strftime
    5. Python datetime → convert via strftime
    6. Unix timestamp (int/float) → convert via datetime.fromtimestamp
    7. String → try pd.to_datetime with infer_datetime_format
    8. Fallback → return (None, error message)

    Args:
        value: Date value in any supported format

    Returns:
        Tuple of (iso_date_string, error_message)
        - If successful: (date_string, None)
        - If failed: (None, error_description)

    Examples:
        >>> parse_date_to_iso("2024-01-15")
        ("2024-01-15", None)

        >>> parse_date_to_iso(pd.Timestamp("2024-01-15"))
        ("2024-01-15", None)

        >>> parse_date_to_iso("not-a-date")
        (None, "invalid_format: str")
    """
    # Strategy 1: Handle None, NaN, pd.NaT
    if value is None:
        return (None, "null_value")

    if isinstance(value, float) and np.isnan(value):
        return (None, "null_value")

    try:
        if pd.isna(value):  # Handles pd.NaT and other pandas null types
            return (None, "null_value")
    except (TypeError, ValueError):
        pass  # Not a pandas-compatible type, continue

    # Strategy 2: ISO string "YYYY-MM-DD"
    if isinstance(value, str):
        iso_date_pattern = re.compile(r'^\d{4}-\d{2}-\d{2}$')
        if iso_date_pattern.match(value):
            if _validate_date_string(value):
                return (value, None)
            else:
                return (None, f"invalid_date: {value}")

        # Strategy 3: ISO datetime string "YYYY-MM-DDTHH:MM:SS..."
        iso_datetime_pattern = re.compile(r'^\d{4}-\d{2}-\d{2}T')
        if iso_datetime_pattern.match(value):
            date_part = value[:10]
            if _validate_date_string(date_part):
                return (date_part, None)
            else:
                return (None, f"invalid_date: {date_part}")

    # Strategy 4: pandas Timestamp
    if isinstance(value, pd.Timestamp):
        try:
            return (value.strftime('%Y-%m-%d'), None)
        except (ValueError, AttributeError) as e:
            return (None, f"pandas_timestamp_error: {str(e)}")

    # Strategy 5: Python datetime
    if isinstance(value, (datetime.datetime, datetime.date)):
        try:
            return (value.strftime('%Y-%m-%d'), None)
        except (ValueError, AttributeError) as e:
            return (None, f"datetime_error: {str(e)}")

    # Strategy 6: Unix timestamp (int/float in reasonable range)
    if isinstance(value, (int, float)) and not np.isnan(value):
        unix_result = _try_parse_unix_timestamp(value)
        if unix_result is not None:
            return (unix_result, None)

    # Strategy 7: Try pandas parsing for strings
    if isinstance(value, str):
        try:
            parsed = pd.to_datetime(value, errors='coerce')
            if not pd.isna(parsed):
                return (parsed.strftime('%Y-%m-%d'), None)
        except Exception:
            pass  # Fall through to final fallback

    # Strategy 8: Fallback - unable to parse
    return (None, f"invalid_format: {type(value).__name__}")


def _validate_date_string(date_str: str) -> bool:
    """
    Validate that a string in YYYY-MM-DD format represents a valid date.

    Args:
        date_str: Date string in YYYY-MM-DD format

    Returns:
        True if valid date, False otherwise
    """
    try:
        datetime.datetime.strptime(date_str, '%Y-%m-%d')
        return True
    except ValueError:
        return False


def _try_parse_unix_timestamp(value: Union[int, float]) -> Optional[str]:
    """
    Try to parse a Unix timestamp (seconds since epoch) to ISO date.

    Only accepts values in a reasonable range (1970-2100) to avoid
    misinterpreting other numeric data as timestamps.

    Args:
        value: Numeric value that might be a Unix timestamp

    Returns:
        ISO date string if successful, None otherwise
    """
    # Reasonable range: 1970-01-01 (0) to 2100-01-01 (~4102444800)
    # Most project dates will be in 2000s (946684800 to ~2147483647)
    if 0 <= value <= 4102444800:  # ~2100-01-01
        try:
            # Try parsing as seconds
            dt = datetime.datetime.fromtimestamp(value)
            return dt.strftime('%Y-%m-%d')
        except (ValueError, OSError, OverflowError):
            # Invalid timestamp
            return None

    return None


def validate_date_range(start_date: str, end_date: str) -> bool:
    """
    Validate that start_date <= end_date.

    Args:
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format

    Returns:
        True if start <= end, False otherwise
    """
    if not start_date or not end_date:
        return False

    try:
        start = datetime.datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.datetime.strptime(end_date, '%Y-%m-%d')
        return start <= end
    except ValueError:
        return False
