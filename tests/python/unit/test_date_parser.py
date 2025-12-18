"""
Unit tests for date_parser module.
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime

from ganttchart.date_parser import parse_date_to_iso, validate_date_range, _validate_date_string, _try_parse_unix_timestamp


class TestParseDateToISO:
    """Tests for parse_date_to_iso function."""

    def test_iso_string(self):
        """Test parsing ISO string format."""
        result, error = parse_date_to_iso("2024-01-15")
        assert result == "2024-01-15"
        assert error is None

    def test_iso_datetime_string(self):
        """Test parsing ISO datetime string."""
        result, error = parse_date_to_iso("2024-01-15T14:30:00")
        assert result == "2024-01-15"
        assert error is None

    def test_iso_datetime_with_timezone(self):
        """Test parsing ISO datetime with timezone."""
        result, error = parse_date_to_iso("2024-01-15T14:30:00Z")
        assert result == "2024-01-15"
        assert error is None

    def test_pandas_timestamp(self):
        """Test parsing pandas Timestamp."""
        result, error = parse_date_to_iso(pd.Timestamp("2024-01-15"))
        assert result == "2024-01-15"
        assert error is None

    def test_python_datetime(self):
        """Test parsing Python datetime."""
        result, error = parse_date_to_iso(datetime(2024, 1, 15))
        assert result == "2024-01-15"
        assert error is None

    def test_unix_timestamp(self):
        """Test parsing Unix timestamp (seconds)."""
        # 2024-01-15 00:00:00 UTC = 1705276800
        result, error = parse_date_to_iso(1705276800)
        assert result == "2024-01-15"
        assert error is None

    def test_invalid_string(self):
        """Test handling invalid string."""
        result, error = parse_date_to_iso("not-a-date")
        assert result is None
        assert "invalid" in error.lower()

    def test_none_value(self):
        """Test handling None."""
        result, error = parse_date_to_iso(None)
        assert result is None
        assert "null" in error.lower()

    def test_nan_float(self):
        """Test handling NaN float."""
        result, error = parse_date_to_iso(float('nan'))
        assert result is None
        assert "null" in error.lower()

    def test_pandas_nat(self):
        """Test handling pandas NaT."""
        result, error = parse_date_to_iso(pd.NaT)
        assert result is None
        assert "null" in error.lower()

    def test_invalid_date_string(self):
        """Test handling invalid date (e.g., February 30)."""
        result, error = parse_date_to_iso("2024-02-30")
        assert result is None
        assert "invalid" in error.lower()

    def test_empty_string(self):
        """Test handling empty string."""
        result, error = parse_date_to_iso("")
        assert result is None
        assert error is not None


class TestValidateDateRange:
    """Tests for validate_date_range function."""

    def test_valid_range(self):
        """Test valid date range where start <= end."""
        assert validate_date_range("2024-01-01", "2024-01-10") is True

    def test_same_date(self):
        """Test range where start == end."""
        assert validate_date_range("2024-01-01", "2024-01-01") is True

    def test_invalid_range(self):
        """Test invalid range where start > end."""
        assert validate_date_range("2024-01-10", "2024-01-01") is False

    def test_none_start(self):
        """Test handling None start date."""
        assert validate_date_range(None, "2024-01-10") is False

    def test_none_end(self):
        """Test handling None end date."""
        assert validate_date_range("2024-01-01", None) is False

    def test_invalid_format(self):
        """Test handling invalid date format."""
        assert validate_date_range("not-a-date", "2024-01-10") is False


class TestValidateDateString:
    """Tests for _validate_date_string helper."""

    def test_valid_date(self):
        """Test valid date string."""
        assert _validate_date_string("2024-01-15") is True

    def test_leap_year(self):
        """Test leap year date."""
        assert _validate_date_string("2024-02-29") is True

    def test_non_leap_year(self):
        """Test invalid leap year date."""
        assert _validate_date_string("2023-02-29") is False

    def test_invalid_month(self):
        """Test invalid month."""
        assert _validate_date_string("2024-13-01") is False

    def test_invalid_day(self):
        """Test invalid day."""
        assert _validate_date_string("2024-01-32") is False


class TestTryParseUnixTimestamp:
    """Tests for _try_parse_unix_timestamp helper."""

    def test_valid_timestamp(self):
        """Test valid Unix timestamp."""
        # 2024-01-01 00:00:00 UTC
        result = _try_parse_unix_timestamp(1704067200)
        assert result == "2024-01-01"

    def test_timestamp_zero(self):
        """Test Unix timestamp at epoch (1970-01-01)."""
        result = _try_parse_unix_timestamp(0)
        assert result is not None

    def test_negative_timestamp(self):
        """Test negative timestamp (before epoch)."""
        result = _try_parse_unix_timestamp(-1)
        assert result is None

    def test_future_timestamp(self):
        """Test future timestamp (year 2100)."""
        # This should fail as it's beyond our reasonable range
        result = _try_parse_unix_timestamp(5000000000)
        assert result is None

    def test_float_timestamp(self):
        """Test float timestamp."""
        result = _try_parse_unix_timestamp(1704067200.5)
        assert result == "2024-01-01"
