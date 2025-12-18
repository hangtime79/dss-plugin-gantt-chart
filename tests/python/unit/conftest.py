"""
Test fixtures for Gantt chart plugin unit tests.
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime


@pytest.fixture
def sample_gantt_df():
    """Sample DataFrame with valid Gantt data."""
    return pd.DataFrame({
        'task_id': ['A', 'B', 'C', 'D'],
        'task_name': ['Task A', 'Task B', 'Task C', 'Task D'],
        'start': ['2024-01-01', '2024-01-05', '2024-01-10', '2024-01-15'],
        'end': ['2024-01-05', '2024-01-10', '2024-01-15', '2024-01-20'],
        'progress': [100, 75, 50, 0],
        'deps': ['', 'A', 'B', 'C'],
        'category': ['Dev', 'Dev', 'QA', 'QA']
    })


@pytest.fixture
def edge_case_df():
    """DataFrame with various edge cases."""
    return pd.DataFrame({
        'task_id': ['T1', 'T2', None, 'T4', 'T4'],  # Duplicate + null
        'task_name': ['Valid', '', None, 'Another', 'Duplicate ID'],
        'start': ['2024-01-01', 'not-a-date', '2024-01-10', 1704672000, pd.NaT],
        'end': ['2024-01-05', '2024-01-10', '2024-01-05', 1705276800, None],
        'progress': [50, 150, -10, 'invalid', None],
        'deps': ['T2,T3', 'T1', '', 'T5', '']
    })


@pytest.fixture
def large_df():
    """Large DataFrame for performance testing."""
    size = 2000
    return pd.DataFrame({
        'id': range(size),
        'name': [f'Task {i}' for i in range(size)],
        'start': ['2024-01-01'] * size,
        'end': ['2024-01-05'] * size,
        'progress': [i % 101 for i in range(size)],
        'deps': [''] * size,
        'category': [f'Cat{i % 5}' for i in range(size)]
    })


@pytest.fixture
def circular_dependency_tasks():
    """Tasks with circular dependencies."""
    return [
        {'id': 'A', 'name': 'Task A', 'start': '2024-01-01', 'end': '2024-01-05', 'dependencies': 'B'},
        {'id': 'B', 'name': 'Task B', 'start': '2024-01-06', 'end': '2024-01-10', 'dependencies': 'C'},
        {'id': 'C', 'name': 'Task C', 'start': '2024-01-11', 'end': '2024-01-15', 'dependencies': 'A'}
    ]


@pytest.fixture
def self_dependency_tasks():
    """Tasks with self-dependencies."""
    return [
        {'id': 'A', 'name': 'Task A', 'start': '2024-01-01', 'end': '2024-01-05', 'dependencies': 'A'},
        {'id': 'B', 'name': 'Task B', 'start': '2024-01-06', 'end': '2024-01-10', 'dependencies': 'B,A'}
    ]


@pytest.fixture
def missing_reference_tasks():
    """Tasks with dependencies referencing non-existent tasks."""
    return [
        {'id': 'A', 'name': 'Task A', 'start': '2024-01-01', 'end': '2024-01-05', 'dependencies': 'B,C'},
        {'id': 'B', 'name': 'Task B', 'start': '2024-01-06', 'end': '2024-01-10', 'dependencies': 'D'}
    ]


@pytest.fixture
def sample_transformer_config():
    """Sample TaskTransformerConfig for testing."""
    from ganttchart.task_transformer import TaskTransformerConfig
    return TaskTransformerConfig(
        id_column='task_id',
        name_column='task_name',
        start_column='start',
        end_column='end',
        progress_column='progress',
        dependencies_column='deps',
        color_column='category',
        max_tasks=1000
    )
