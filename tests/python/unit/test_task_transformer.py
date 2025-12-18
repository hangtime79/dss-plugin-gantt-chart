"""
Unit tests for task_transformer module.
"""

import pytest
import pandas as pd
import numpy as np

from ganttchart.task_transformer import TaskTransformer, TaskTransformerConfig


class TestTaskTransformer:
    """Tests for TaskTransformer class."""

    def test_basic_transformation(self, sample_gantt_df, sample_transformer_config):
        """Test basic transformation of valid data."""
        transformer = TaskTransformer(sample_transformer_config)
        result = transformer.transform(sample_gantt_df)

        assert 'tasks' in result
        assert 'metadata' in result
        assert len(result['tasks']) == 4
        assert result['metadata']['totalRows'] == 4
        assert result['metadata']['displayedRows'] == 4
        assert result['metadata']['skippedRows'] == 0

        # Check task structure
        task = result['tasks'][0]
        assert 'id' in task
        assert 'name' in task
        assert 'start' in task
        assert 'end' in task
        assert 'progress' in task
        assert 'dependencies' in task

    def test_edge_cases(self, edge_case_df):
        """Test handling of various edge cases."""
        config = TaskTransformerConfig(
            id_column='task_id',
            name_column='task_name',
            start_column='start',
            end_column='end',
            progress_column='progress',
            max_tasks=1000
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(edge_case_df)

        # Should have some skipped rows due to invalid dates
        assert result['metadata']['skippedRows'] > 0
        # Valid tasks should have been processed
        assert result['metadata']['displayedRows'] > 0
        # Check that duplicate IDs were handled
        task_ids = [t['id'] for t in result['tasks']]
        assert len(task_ids) == len(set(task_ids))  # All unique

    def test_max_tasks_limit(self, large_df):
        """Test maxTasks limit enforcement."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            max_tasks=1000
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(large_df)

        assert len(result['tasks']) == 1000
        assert result['metadata']['totalRows'] == 2000
        assert len(result['metadata']['warnings']) > 0
        # Should have warning about limit
        assert any('maxTasks' in w for w in result['metadata']['warnings'])

    def test_max_tasks_unlimited(self, large_df):
        """Test maxTasks=0 (unlimited)."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            max_tasks=0
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(large_df)

        # Should process all tasks
        assert len(result['tasks']) == 2000

    def test_empty_dataframe(self):
        """Test handling of empty DataFrame."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        df = pd.DataFrame()

        with pytest.raises(ValueError, match="empty"):
            transformer.transform(df)

    def test_missing_required_column(self, sample_gantt_df):
        """Test error when required column is missing."""
        config = TaskTransformerConfig(
            id_column='nonexistent',
            name_column='task_name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)

        with pytest.raises(ValueError, match="not found"):
            transformer.transform(sample_gantt_df)

    def test_null_task_id_generation(self):
        """Test generation of task IDs for null values."""
        df = pd.DataFrame({
            'id': [None, None, 'A'],
            'name': ['Task 1', 'Task 2', 'Task 3'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03'],
            'end': ['2024-01-05', '2024-01-06', '2024-01-07']
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        # First two tasks should have generated IDs
        assert result['tasks'][0]['id'].startswith('task_')
        assert result['tasks'][1]['id'].startswith('task_')
        assert result['tasks'][2]['id'] == 'A'

    def test_null_task_name_generation(self):
        """Test generation of task names for null values."""
        df = pd.DataFrame({
            'id': ['A', 'B', 'C'],
            'name': [None, '', 'Task C'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03'],
            'end': ['2024-01-05', '2024-01-06', '2024-01-07']
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        # First two tasks should have ID as name (fallback)
        assert result['tasks'][0]['name'] == 'A'
        assert result['tasks'][1]['name'] == 'B'
        # Third task has explicit name
        assert result['tasks'][2]['name'] == 'Task C'

    def test_duplicate_id_handling(self):
        """Test handling of duplicate task IDs."""
        df = pd.DataFrame({
            'id': ['A', 'A', 'A'],
            'name': ['Task 1', 'Task 2', 'Task 3'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03'],
            'end': ['2024-01-05', '2024-01-06', '2024-01-07']
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        task_ids = [t['id'] for t in result['tasks']]
        assert len(task_ids) == 3
        assert len(set(task_ids)) == 3  # All unique
        assert task_ids[0] == 'A'
        assert task_ids[1] == 'A_1'
        assert task_ids[2] == 'A_2'

    def test_progress_clamping(self):
        """Test progress value clamping to [0, 100]."""
        df = pd.DataFrame({
            'id': ['A', 'B', 'C'],
            'name': ['Task A', 'Task B', 'Task C'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03'],
            'end': ['2024-01-05', '2024-01-06', '2024-01-07'],
            'progress': [-10, 150, 50]
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            progress_column='progress'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        assert result['tasks'][0]['progress'] == 0  # Clamped from -10
        assert result['tasks'][1]['progress'] == 100  # Clamped from 150
        assert result['tasks'][2]['progress'] == 50  # Unchanged

    def test_invalid_progress_handling(self):
        """Test handling of invalid progress values."""
        df = pd.DataFrame({
            'id': ['A', 'B'],
            'name': ['Task A', 'Task B'],
            'start': ['2024-01-01', '2024-01-02'],
            'end': ['2024-01-05', '2024-01-06'],
            'progress': ['invalid', None]
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            progress_column='progress'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        # Invalid progress should result in no progress field
        assert 'progress' not in result['tasks'][0] or result['tasks'][0]['progress'] is None
        assert 'progress' not in result['tasks'][1] or result['tasks'][1]['progress'] is None

    def test_start_after_end_skipped(self):
        """Test that tasks with start > end are skipped."""
        df = pd.DataFrame({
            'id': ['A', 'B'],
            'name': ['Task A', 'Task B'],
            'start': ['2024-01-10', '2024-01-01'],
            'end': ['2024-01-01', '2024-01-05']  # A has start > end
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        # Only task B should be processed
        assert len(result['tasks']) == 1
        assert result['tasks'][0]['id'] == 'B'
        assert result['metadata']['skippedRows'] == 1
        assert 'start_after_end' in result['metadata']['skipReasons']

    def test_color_mapping(self, sample_gantt_df):
        """Test color mapping integration."""
        config = TaskTransformerConfig(
            id_column='task_id',
            name_column='task_name',
            start_column='start',
            end_column='end',
            color_column='category',
            max_tasks=1000
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(sample_gantt_df)

        # Should have colorMapping in result
        assert 'colorMapping' in result
        assert 'Dev' in result['colorMapping']
        assert 'QA' in result['colorMapping']

        # Tasks should have custom_class
        for task in result['tasks']:
            assert 'custom_class' in task
            assert task['custom_class'].startswith('bar-')

    def test_dependencies_parsing(self):
        """Test parsing of dependencies column."""
        df = pd.DataFrame({
            'id': ['A', 'B', 'C'],
            'name': ['Task A', 'Task B', 'Task C'],
            'start': ['2024-01-01', '2024-01-05', '2024-01-10'],
            'end': ['2024-01-05', '2024-01-10', '2024-01-15'],
            'deps': ['', 'A', 'A, B']  # Note: space after comma
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            dependencies_column='deps'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        assert result['tasks'][0]['dependencies'] == ''
        assert result['tasks'][1]['dependencies'] == 'A'
        # Should strip whitespace
        assert result['tasks'][2]['dependencies'] == 'A,B'
