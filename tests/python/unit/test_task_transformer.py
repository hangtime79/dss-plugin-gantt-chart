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

        assert result['tasks'][0]['dependencies'] == []
    def test_custom_tooltips_basic(self):
        """Test basic custom tooltip extraction."""
        df = pd.DataFrame({
            'id': ['A'],
            'name': ['Task A'],
            'start': ['2024-01-01'],
            'end': ['2024-01-05'],
            'assignee': ['John Doe'],
            'priority': ['High']
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            tooltip_columns=['assignee', 'priority']
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        task = result['tasks'][0]
        assert 'custom_fields' in task
        assert len(task['custom_fields']) == 2
        
        # Verify structure
        assert task['custom_fields'][0] == {'label': 'assignee', 'value': 'John Doe'}
        assert task['custom_fields'][1] == {'label': 'priority', 'value': 'High'}

    def test_custom_tooltips_ordering(self):
        """Test that custom tooltips preserve configuration order."""
        df = pd.DataFrame({
            'id': ['A'],
            'name': ['Task A'],
            'start': ['2024-01-01'],
            'end': ['2024-01-05'],
            'col1': ['1'],
            'col2': ['2'],
            'col3': ['3']
        })
        # Order: col3, col1 (skip col2)
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            tooltip_columns=['col3', 'col1']
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        fields = result['tasks'][0]['custom_fields']
        assert len(fields) == 2
        assert fields[0]['label'] == 'col3'
        assert fields[0]['value'] == '3'
        assert fields[1]['label'] == 'col1'
        assert fields[1]['value'] == '1'

    def test_custom_tooltips_formatting(self):
        """Test formatting of various data types in tooltips."""
        df = pd.DataFrame({
            'id': ['A'],
            'name': ['Task A'],
            'start': ['2024-01-01'],
            'end': ['2024-01-05'],
            'number': [42],
            'float': [3.14],
            'null_val': [None],
            'nan_val': [np.nan],
            'date_val': [pd.Timestamp('2024-03-15')]
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            tooltip_columns=['number', 'float', 'null_val', 'nan_val', 'date_val']
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        fields = result['tasks'][0]['custom_fields']
        
        # Integer preserved
        assert fields[0]['label'] == 'number'
        assert fields[0]['value'] == 42
        
        # Float preserved
        assert fields[1]['label'] == 'float'
        assert fields[1]['value'] == 3.14
        
        # Null -> None (frontend handles as "-")
        assert fields[2]['label'] == 'null_val'
        assert fields[2]['value'] is None
        
        # NaN -> None
        assert fields[3]['label'] == 'nan_val'
        assert fields[3]['value'] is None
        
        # Date -> String (YYYY-MM-DD)
        assert fields[4]['label'] == 'date_val'
        assert fields[4]['value'] == '2024-03-15'

    def test_custom_tooltips_missing_col(self):
        """Test graceful handling of missing tooltip columns."""
        df = pd.DataFrame({
            'id': ['A'],
            'name': ['Task A'],
            'start': ['2024-01-01'],
            'end': ['2024-01-05'],
            'col1': ['Value']
        })
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end',
            tooltip_columns=['col1', 'missing_col']
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        fields = result['tasks'][0]['custom_fields']
        assert len(fields) == 1
        assert fields[0]['label'] == 'col1'
        assert fields[0]['value'] == 'Value'


class TestIDNormalization:
    """Tests for ID normalization and type handling."""

    def test_normalize_id_integer(self):
        """Test normalization of integer IDs."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        
        # Integer should convert to string
        assert transformer._normalize_id(277) == '277'
        assert transformer._normalize_id(0) == '0'
        assert transformer._normalize_id(-5) == '-5'

    def test_normalize_id_float_whole_number(self):
        """Test normalization of whole-number floats (Pandas NaN column issue)."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        
        # Whole number floats should convert to int representation
        assert transformer._normalize_id(277.0) == '277'
        assert transformer._normalize_id(0.0) == '0'
        assert transformer._normalize_id(-5.0) == '-5'

    def test_normalize_id_float_decimal(self):
        """Test normalization of actual decimal floats - made CSS-safe."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)

        # Actual decimals are hex-encoded to be CSS-safe (period → _x2e_)
        assert transformer._normalize_id(3.14) == '3_x2e_14'
        assert transformer._normalize_id(0.5) == '0_x2e_5'
        assert transformer._normalize_id(-1.75) == '-1_x2e_75'

    def test_normalize_id_string(self):
        """Test normalization of string IDs."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        
        assert transformer._normalize_id('abc') == 'abc'
        assert transformer._normalize_id('  whitespace  ') == 'whitespace'
        assert transformer._normalize_id('123') == '123'

    def test_normalize_id_nan(self):
        """Test normalization of NaN values."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        
        assert transformer._normalize_id(np.nan) == ''
        assert transformer._normalize_id(pd.NA) == ''
        assert transformer._normalize_id(None) == ''

    def test_pandas_type_mismatch_scenario(self):
        """Test the real-world Pandas type mismatch scenario."""
        # Simulate Pandas behavior: ID column (no NaNs) = int, Dependency column (has NaNs) = float
        df = pd.DataFrame({
            'id': [276, 277, 278],  # Will be int64
            'name': ['Task 276', 'Task 277', 'Task 278'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03'],
            'end': ['2024-01-02', '2024-01-03', '2024-01-04'],
            'deps': [np.nan, 276.0, 277.0]  # Will be float64 due to NaN
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
        
        # Task 276: int ID, no dependencies
        assert result['tasks'][0]['id'] == '276'
        assert result['tasks'][0]['dependencies'] == []
        
        # Task 277: int ID, float dependency
        assert result['tasks'][1]['id'] == '277'
        assert result['tasks'][1]['dependencies'] == ['276']  # Should match!
        
        # Task 278: int ID, float dependency
        assert result['tasks'][2]['id'] == '278'
        assert result['tasks'][2]['dependencies'] == ['277']  # Should match!

    def test_multiple_dependencies_numeric(self):
        """Test multiple numeric dependencies in comma-separated string."""
        df = pd.DataFrame({
            'id': [1, 2, 3, 4],
            'name': ['A', 'B', 'C', 'D'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
            'end': ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'],
            'deps': ['', '1', '1, 2', '2, 3']  # Multiple deps as comma-separated string
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
        
        assert result['tasks'][0]['dependencies'] == []
        assert result['tasks'][1]['dependencies'] == ['1']
        assert result['tasks'][2]['dependencies'] == ['1', '2']
        assert result['tasks'][3]['dependencies'] == ['2', '3']

    def test_multiple_dependencies_with_floats(self):
        """Test multiple float dependencies (Pandas NaN scenario)."""
        df = pd.DataFrame({
            'id': [1, 2, 3, 4],
            'name': ['A', 'B', 'C', 'D'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04'],
            'end': ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'],
            'deps': [np.nan, '1.0', '1.0, 2.0', '2.0, 3.0']  # Floats in strings
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
        
        # Float deps in strings should be normalized to ints
        assert result['tasks'][0]['dependencies'] == []
        assert result['tasks'][1]['dependencies'] == ['1']
        assert result['tasks'][2]['dependencies'] == ['1', '2']
        assert result['tasks'][3]['dependencies'] == ['2', '3']

    def test_dependency_whitespace_handling(self):
        """Test that whitespace in dependency strings is handled correctly."""
        df = pd.DataFrame({
            'id': ['A', 'B', 'C'],
            'name': ['Task A', 'Task B', 'Task C'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03'],
            'end': ['2024-01-02', '2024-01-03', '2024-01-04'],
            'deps': ['', '  A  ', ' A , B ']  # Extra whitespace
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
        
        assert result['tasks'][0]['dependencies'] == []
        assert result['tasks'][1]['dependencies'] == ['A']
        assert result['tasks'][2]['dependencies'] == ['A', 'B']

    def test_string_ids_with_dependencies(self):
        """Test string IDs with string dependencies."""
        df = pd.DataFrame({
            'id': ['task_a', 'task_b', 'task_c'],
            'name': ['Task A', 'Task B', 'Task C'],
            'start': ['2024-01-01', '2024-01-02', '2024-01-03'],
            'end': ['2024-01-02', '2024-01-03', '2024-01-04'],
            'deps': ['', 'task_a', 'task_a, task_b']
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
        
        assert result['tasks'][0]['id'] == 'task_a'
        assert result['tasks'][0]['dependencies'] == []
        assert result['tasks'][1]['id'] == 'task_b'
        assert result['tasks'][1]['dependencies'] == ['task_a']
        assert result['tasks'][2]['id'] == 'task_c'
        assert result['tasks'][2]['dependencies'] == ['task_a', 'task_b']


class TestCssSafe:
    """Test CSS-safe ID encoding."""

    def test_make_css_safe_period(self):
        """Test that periods are hex-encoded."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)

        assert transformer._make_css_safe('54.8') == '54_x2e_8'
        assert transformer._make_css_safe('3.14.15') == '3_x2e_14_x2e_15'

    def test_make_css_safe_space(self):
        """Test that spaces are hex-encoded."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)

        assert transformer._make_css_safe('task 1') == 'task_x20_1'
        assert transformer._make_css_safe('my task') == 'my_x20_task'

    def test_make_css_safe_special_chars(self):
        """Test that various special characters are hex-encoded."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)

        assert transformer._make_css_safe('item#5') == 'item_x23_5'
        assert transformer._make_css_safe('task[1]') == 'task_x5b_1_x5d_'
        assert transformer._make_css_safe('a:b') == 'a_x3a_b'

    def test_make_css_safe_preserves_safe_chars(self):
        """Test that alphanumerics, underscores, and hyphens are preserved."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)

        assert transformer._make_css_safe('task-1') == 'task-1'
        assert transformer._make_css_safe('task_1') == 'task_1'
        assert transformer._make_css_safe('Task123') == 'Task123'
        assert transformer._make_css_safe('ABC-xyz_123') == 'ABC-xyz_123'

    def test_make_css_safe_no_collision(self):
        """Test that similar IDs don't collide after encoding."""
        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)

        # These should produce different outputs
        id1 = transformer._make_css_safe('54.8')
        id2 = transformer._make_css_safe('54_8')

        assert id1 != id2
        assert id1 == '54_x2e_8'
        assert id2 == '54_8'


class TestExpectedProgress:
    """Tests for expected progress calculation."""

    def test_expected_progress_in_progress_task(self):
        """Test expected progress for a task that spans today."""
        from datetime import date, timedelta

        today = date.today()
        start = today - timedelta(days=5)
        end = today + timedelta(days=5)

        df = pd.DataFrame({
            'id': ['1'],
            'name': ['Test Task'],
            'start': [start.strftime('%Y-%m-%d')],
            'end': [end.strftime('%Y-%m-%d')]
        })

        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        task = result['tasks'][0]
        assert '_expected_progress' in task
        # 5 days elapsed out of 10 total = 50%
        assert 49 <= task['_expected_progress'] <= 51  # Allow small variance

    def test_expected_progress_future_task(self):
        """Test that future tasks have no expected progress marker."""
        from datetime import date, timedelta

        today = date.today()
        start = today + timedelta(days=5)
        end = today + timedelta(days=15)

        df = pd.DataFrame({
            'id': ['1'],
            'name': ['Future Task'],
            'start': [start.strftime('%Y-%m-%d')],
            'end': [end.strftime('%Y-%m-%d')]
        })

        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        task = result['tasks'][0]
        assert '_expected_progress' not in task

    def test_expected_progress_past_task(self):
        """Test that past tasks have no expected progress marker."""
        from datetime import date, timedelta

        today = date.today()
        start = today - timedelta(days=20)
        end = today - timedelta(days=10)

        df = pd.DataFrame({
            'id': ['1'],
            'name': ['Past Task'],
            'start': [start.strftime('%Y-%m-%d')],
            'end': [end.strftime('%Y-%m-%d')]
        })

        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        task = result['tasks'][0]
        assert '_expected_progress' not in task

    def test_expected_progress_starts_today(self):
        """Test expected progress when task starts today."""
        from datetime import date, timedelta

        today = date.today()
        end = today + timedelta(days=10)

        df = pd.DataFrame({
            'id': ['1'],
            'name': ['Starts Today'],
            'start': [today.strftime('%Y-%m-%d')],
            'end': [end.strftime('%Y-%m-%d')]
        })

        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        task = result['tasks'][0]
        assert '_expected_progress' in task
        # 0 days elapsed out of 10 = 0%
        assert task['_expected_progress'] == 0.0

    def test_expected_progress_ends_today(self):
        """Test expected progress when task ends today."""
        from datetime import date, timedelta

        today = date.today()
        start = today - timedelta(days=10)

        df = pd.DataFrame({
            'id': ['1'],
            'name': ['Ends Today'],
            'start': [start.strftime('%Y-%m-%d')],
            'end': [today.strftime('%Y-%m-%d')]
        })

        config = TaskTransformerConfig(
            id_column='id',
            name_column='name',
            start_column='start',
            end_column='end'
        )
        transformer = TaskTransformer(config)
        result = transformer.transform(df)

        task = result['tasks'][0]
        assert '_expected_progress' in task
        # 10 days elapsed out of 10 = 100%
        assert task['_expected_progress'] == 100.0
