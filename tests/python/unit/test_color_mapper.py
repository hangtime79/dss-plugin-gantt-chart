"""
Unit tests for color_mapper module.
"""

import pytest
import pandas as pd
import numpy as np

from ganttchart.color_mapper import create_color_mapping, get_task_color_class, get_color_mapping_summary, COLOR_PALETTE, DEFAULT_COLOR


class TestCreateColorMapping:
    """Tests for create_color_mapping function."""

    def test_basic_mapping(self, sample_gantt_df):
        """Test basic color mapping creation."""
        mapping = create_color_mapping(sample_gantt_df, 'category')
        assert 'Dev' in mapping
        assert 'QA' in mapping
        assert mapping['Dev'] != mapping['QA']
        assert mapping['Dev'] in COLOR_PALETTE
        assert mapping['QA'] in COLOR_PALETTE

    def test_missing_column(self):
        """Test handling of missing column."""
        df = pd.DataFrame({'col': [1, 2, 3]})
        mapping = create_color_mapping(df, 'nonexistent')
        assert mapping == {}

    def test_empty_dataframe(self):
        """Test handling of empty DataFrame."""
        df = pd.DataFrame()
        mapping = create_color_mapping(df, 'category')
        assert mapping == {}

    def test_all_nan_values(self):
        """Test handling of all NaN values."""
        df = pd.DataFrame({'category': [np.nan, np.nan, np.nan]})
        mapping = create_color_mapping(df, 'category')
        assert mapping == {}

    def test_mixed_with_nan(self):
        """Test handling of mix of values and NaN."""
        df = pd.DataFrame({'category': ['A', np.nan, 'B', np.nan, 'A']})
        mapping = create_color_mapping(df, 'category')
        assert len(mapping) == 2
        assert 'A' in mapping
        assert 'B' in mapping
        assert np.nan not in mapping

    def test_single_category(self):
        """Test single category."""
        df = pd.DataFrame({'category': ['A', 'A', 'A']})
        mapping = create_color_mapping(df, 'category')
        assert len(mapping) == 1
        assert mapping['A'] == COLOR_PALETTE[0]

    def test_many_categories(self):
        """Test more categories than palette colors."""
        # Create 15 unique categories
        df = pd.DataFrame({'category': list('ABCDEFGHIJKLMNO')})
        mapping = create_color_mapping(df, 'category')
        assert len(mapping) == 15
        # Check that it cycles through palette
        # 13th category should get the same color as 1st (index 0)
        assert mapping['M'] == COLOR_PALETTE[0]
        assert mapping['N'] == COLOR_PALETTE[1]
        assert mapping['O'] == COLOR_PALETTE[2]

    def test_numeric_categories(self):
        """Test numeric categories."""
        df = pd.DataFrame({'category': [1, 2, 3, 1, 2]})
        mapping = create_color_mapping(df, 'category')
        assert len(mapping) == 3
        assert 1 in mapping
        assert 2 in mapping
        assert 3 in mapping

    def test_sorted_assignment(self):
        """Test that categories are sorted for consistent assignment."""
        df1 = pd.DataFrame({'category': ['Z', 'A', 'M']})
        df2 = pd.DataFrame({'category': ['M', 'Z', 'A']})
        mapping1 = create_color_mapping(df1, 'category')
        mapping2 = create_color_mapping(df2, 'category')
        # Should get same mapping regardless of order in data
        assert mapping1 == mapping2


class TestGetTaskColorClass:
    """Tests for get_task_color_class function."""

    def test_existing_value(self):
        """Test getting color for existing value."""
        mapping = {'Dev': 'bar-blue', 'QA': 'bar-green'}
        assert get_task_color_class('Dev', mapping) == 'bar-blue'
        assert get_task_color_class('QA', mapping) == 'bar-green'

    def test_missing_value(self):
        """Test getting color for missing value."""
        mapping = {'Dev': 'bar-blue'}
        assert get_task_color_class('Ops', mapping) == DEFAULT_COLOR

    def test_none_value(self):
        """Test getting color for None."""
        mapping = {'Dev': 'bar-blue'}
        assert get_task_color_class(None, mapping) == DEFAULT_COLOR

    def test_nan_value(self):
        """Test getting color for NaN."""
        mapping = {'Dev': 'bar-blue'}
        assert get_task_color_class(float('nan'), mapping) == DEFAULT_COLOR

    def test_empty_mapping(self):
        """Test with empty mapping."""
        assert get_task_color_class('Dev', {}) == DEFAULT_COLOR

    def test_numeric_value(self):
        """Test with numeric value."""
        mapping = {1: 'bar-blue', 2: 'bar-green'}
        assert get_task_color_class(1, mapping) == 'bar-blue'
        assert get_task_color_class(3, mapping) == DEFAULT_COLOR


class TestGetColorMappingSummary:
    """Tests for get_color_mapping_summary function."""

    def test_basic_summary(self):
        """Test basic summary generation."""
        mapping = {'A': 'bar-blue', 'B': 'bar-green', 'C': 'bar-orange'}
        summary = get_color_mapping_summary(mapping)
        assert summary['total_categories'] == 3
        assert summary['unique_colors'] == 3
        assert summary['palette_cycles'] == 1

    def test_cycling_summary(self):
        """Test summary with cycling."""
        # 15 categories, palette has 12 colors
        mapping = {chr(65+i): COLOR_PALETTE[i % len(COLOR_PALETTE)] for i in range(15)}
        summary = get_color_mapping_summary(mapping)
        assert summary['total_categories'] == 15
        assert summary['palette_cycles'] == 2

    def test_empty_mapping(self):
        """Test summary of empty mapping."""
        summary = get_color_mapping_summary({})
        assert summary['total_categories'] == 0
        assert summary['unique_colors'] == 0
