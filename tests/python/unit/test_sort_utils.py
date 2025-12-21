import pytest
import datetime
from ganttchart.sort_utils import sort_tasks, _topological_sort, group_and_sort_tasks

def create_task(id, name, start, end, deps=None):
    return {
        'id': id,
        'name': name,
        'start': start,
        'end': end,
        'dependencies': deps
    }

@pytest.fixture
def sample_tasks():
    return [
        create_task('t1', 'B Task', '2024-01-05', '2024-01-10'), # Duration 5
        create_task('t2', 'A Task', '2024-01-01', '2024-01-02'), # Duration 1
        create_task('t3', 'C Task', '2024-01-03', '2024-01-15')  # Duration 12
    ]

def test_sort_none(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'none')
    assert [t['id'] for t in sorted_tasks] == ['t1', 't2', 't3']

def test_sort_start_asc(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'start_asc')
    assert [t['id'] for t in sorted_tasks] == ['t2', 't3', 't1']

def test_sort_start_desc(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'start_desc')
    assert [t['id'] for t in sorted_tasks] == ['t1', 't3', 't2']

def test_sort_end_asc(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'end_asc')
    assert [t['id'] for t in sorted_tasks] == ['t2', 't1', 't3']

def test_sort_end_desc(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'end_desc')
    assert [t['id'] for t in sorted_tasks] == ['t3', 't1', 't2']

def test_sort_name_asc(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'name_asc')
    assert [t['id'] for t in sorted_tasks] == ['t2', 't1', 't3']

def test_sort_name_desc(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'name_desc')
    assert [t['id'] for t in sorted_tasks] == ['t3', 't1', 't2']

def test_sort_duration_asc(sample_tasks):
    # t2=1, t1=5, t3=12
    sorted_tasks = sort_tasks(sample_tasks, 'duration_asc')
    assert [t['id'] for t in sorted_tasks] == ['t2', 't1', 't3']

def test_sort_duration_desc(sample_tasks):
    sorted_tasks = sort_tasks(sample_tasks, 'duration_desc')
    assert [t['id'] for t in sorted_tasks] == ['t3', 't1', 't2']

def test_topological_sort_simple():
    # t1 -> t2 -> t3
    tasks = [
        create_task('t3', 'Task 3', '2024-01-01', '2024-01-02', 't2'),
        create_task('t1', 'Task 1', '2024-01-01', '2024-01-02'),
        create_task('t2', 'Task 2', '2024-01-01', '2024-01-02', 't1')
    ]
    sorted_tasks = sort_tasks(tasks, 'dependencies')
    assert [t['id'] for t in sorted_tasks] == ['t1', 't2', 't3']

def test_topological_sort_independent():
    # t1, t2 independent
    tasks = [
        create_task('t2', 'Task 2', '2024-01-02', '2024-01-03'),
        create_task('t1', 'Task 1', '2024-01-01', '2024-01-02')
    ]
    # Should sort by start date for independent tasks (implementation detail)
    sorted_tasks = sort_tasks(tasks, 'dependencies')
    assert [t['id'] for t in sorted_tasks] == ['t1', 't2']

def test_topological_sort_cycle():
    # t1 -> t2 -> t1
    tasks = [
        create_task('t1', 'Task 1', '2024-01-01', '2024-01-02', 't2'),
        create_task('t2', 'Task 2', '2024-01-01', '2024-01-02', 't1')
    ]
    sorted_tasks = sort_tasks(tasks, 'dependencies')
    # Should return all tasks even with cycle (order might vary but length must match)
    assert len(sorted_tasks) == 2
    assert set([t['id'] for t in sorted_tasks]) == {'t1', 't2'}

def test_topological_sort_complex():
    # t1
    # t2 -> t3
    # t4 -> t3, t5
    tasks = [
        create_task('t3', 'Task 3', '2024-01-01', '2024-01-02', 't2, t4'),
        create_task('t5', 'Task 5', '2024-01-01', '2024-01-02', 't4'),
        create_task('t2', 'Task 2', '2024-01-01', '2024-01-02'),
        create_task('t4', 'Task 4', '2024-01-01', '2024-01-02'),
        create_task('t1', 'Task 1', '2024-01-01', '2024-01-02')
    ]
    sorted_tasks = sort_tasks(tasks, 'dependencies')
    ids = [t['id'] for t in sorted_tasks]
    
    # Check dependencies respected
    assert ids.index('t2') < ids.index('t3')
    assert ids.index('t4') < ids.index('t3')
    assert ids.index('t4') < ids.index('t5')


# ===== Grouping Tests =====

def create_task_with_groups(id, name, start, end, group_values=None):
    """Helper to create a task with group values."""
    task = {
        'id': id,
        'name': name,
        'start': start,
        'end': end,
        'dependencies': []
    }
    if group_values:
        task['_group_values'] = group_values
    return task


@pytest.fixture
def tasks_with_groups():
    """Sample tasks with Region and Team grouping columns."""
    return [
        create_task_with_groups('t1', 'Task 1', '2024-01-05', '2024-01-10',
                                {'Region': 'EMEA', 'Team': 'Alpha'}),
        create_task_with_groups('t2', 'Task 2', '2024-01-01', '2024-01-03',
                                {'Region': 'APAC', 'Team': 'Beta'}),
        create_task_with_groups('t3', 'Task 3', '2024-01-08', '2024-01-15',
                                {'Region': 'EMEA', 'Team': 'Beta'}),
        create_task_with_groups('t4', 'Task 4', '2024-01-02', '2024-01-04',
                                {'Region': 'APAC', 'Team': 'Alpha'}),
        create_task_with_groups('t5', 'Task 5', '2024-01-06', '2024-01-12',
                                {'Region': 'EMEA', 'Team': 'Alpha'}),
    ]


def test_group_by_single_column(tasks_with_groups):
    """Test grouping by a single column (Region)."""
    result = group_and_sort_tasks(tasks_with_groups, ['Region'], 'none')
    ids = [t['id'] for t in result]

    # APAC tasks should come first (alphabetically), then EMEA
    apac_indices = [ids.index('t2'), ids.index('t4')]
    emea_indices = [ids.index('t1'), ids.index('t3'), ids.index('t5')]

    # All APAC tasks should come before all EMEA tasks
    assert max(apac_indices) < min(emea_indices)


def test_group_by_multiple_columns(tasks_with_groups):
    """Test hierarchical grouping (Region -> Team)."""
    result = group_and_sort_tasks(tasks_with_groups, ['Region', 'Team'], 'none')
    ids = [t['id'] for t in result]

    # Expected order:
    # APAC -> Alpha (t4)
    # APAC -> Beta (t2)
    # EMEA -> Alpha (t1, t5)
    # EMEA -> Beta (t3)

    assert ids.index('t4') < ids.index('t2')  # APAC-Alpha before APAC-Beta
    assert ids.index('t2') < ids.index('t1')  # APAC-Beta before EMEA-Alpha
    assert ids.index('t1') < ids.index('t3') or ids.index('t5') < ids.index('t3')  # EMEA-Alpha before EMEA-Beta


def test_group_with_sorting(tasks_with_groups):
    """Test grouping combined with sorting within groups."""
    result = group_and_sort_tasks(tasks_with_groups, ['Region'], 'start_asc')
    ids = [t['id'] for t in result]

    # APAC group should be sorted by start date: t4 (Jan 2), t2 (Jan 1)
    # Wait, t2 is Jan 1, t4 is Jan 2, so t2 should come first
    apac_tasks = [t for t in result if t.get('_group_values', {}).get('Region') == 'APAC']
    assert apac_tasks[0]['id'] == 't2'  # Jan 1
    assert apac_tasks[1]['id'] == 't4'  # Jan 2

    # EMEA group should be sorted by start date: t1 (Jan 5), t5 (Jan 6), t3 (Jan 8)
    emea_tasks = [t for t in result if t.get('_group_values', {}).get('Region') == 'EMEA']
    assert emea_tasks[0]['id'] == 't1'  # Jan 5
    assert emea_tasks[1]['id'] == 't5'  # Jan 6
    assert emea_tasks[2]['id'] == 't3'  # Jan 8


def test_group_with_null_values():
    """Test grouping with null/empty values."""
    tasks = [
        create_task_with_groups('t1', 'Task 1', '2024-01-01', '2024-01-05',
                                {'Region': 'EMEA'}),
        create_task_with_groups('t2', 'Task 2', '2024-01-02', '2024-01-06',
                                {'Region': None}),  # Null region
        create_task_with_groups('t3', 'Task 3', '2024-01-03', '2024-01-07',
                                {'Region': 'APAC'}),
        create_task_with_groups('t4', 'Task 4', '2024-01-04', '2024-01-08',
                                {'Region': ''}),  # Empty region
    ]

    result = group_and_sort_tasks(tasks, ['Region'], 'none')
    ids = [t['id'] for t in result]

    # Non-null groups come first (alphabetically), null/empty at the end
    # Expected order: APAC (t3), EMEA (t1), then null values (t2, t4)
    assert ids.index('t3') < ids.index('t1')  # APAC before EMEA
    assert ids.index('t1') < ids.index('t2')  # EMEA before null
    assert ids.index('t1') < ids.index('t4')  # EMEA before empty


def test_group_no_grouping_columns():
    """Test that empty group_by_columns falls back to regular sorting."""
    tasks = [
        create_task_with_groups('t1', 'B', '2024-01-05', '2024-01-10'),
        create_task_with_groups('t2', 'A', '2024-01-01', '2024-01-03'),
        create_task_with_groups('t3', 'C', '2024-01-08', '2024-01-15'),
    ]

    # Empty list should fall back to sort_tasks
    result = group_and_sort_tasks(tasks, [], 'name_asc')
    ids = [t['id'] for t in result]
    assert ids == ['t2', 't1', 't3']  # Sorted by name


def test_group_empty_task_list():
    """Test grouping with empty task list."""
    result = group_and_sort_tasks([], ['Region'], 'none')
    assert result == []


def test_group_tasks_missing_group_values():
    """Test grouping when some tasks don't have _group_values."""
    tasks = [
        create_task_with_groups('t1', 'Task 1', '2024-01-01', '2024-01-05',
                                {'Region': 'EMEA'}),
        create_task_with_groups('t2', 'Task 2', '2024-01-02', '2024-01-06'),  # No _group_values
        create_task_with_groups('t3', 'Task 3', '2024-01-03', '2024-01-07',
                                {'Region': 'APAC'}),
    ]

    result = group_and_sort_tasks(tasks, ['Region'], 'none')
    ids = [t['id'] for t in result]

    # Tasks with group values come first (alphabetically), tasks without come last
    assert ids.index('t3') < ids.index('t1')  # APAC before EMEA
    assert ids.index('t1') < ids.index('t2')  # EMEA before missing


def test_group_three_levels():
    """Test three-level hierarchical grouping."""
    tasks = [
        create_task_with_groups('t1', 'Task 1', '2024-01-01', '2024-01-05',
                                {'Country': 'USA', 'Region': 'West', 'State': 'CA'}),
        create_task_with_groups('t2', 'Task 2', '2024-01-02', '2024-01-06',
                                {'Country': 'USA', 'Region': 'East', 'State': 'NY'}),
        create_task_with_groups('t3', 'Task 3', '2024-01-03', '2024-01-07',
                                {'Country': 'USA', 'Region': 'West', 'State': 'OR'}),
        create_task_with_groups('t4', 'Task 4', '2024-01-04', '2024-01-08',
                                {'Country': 'Canada', 'Region': 'West', 'State': 'BC'}),
    ]

    result = group_and_sort_tasks(tasks, ['Country', 'Region', 'State'], 'none')
    ids = [t['id'] for t in result]

    # Expected order:
    # Canada -> West -> BC (t4)
    # USA -> East -> NY (t2)
    # USA -> West -> CA (t1)
    # USA -> West -> OR (t3)

    assert ids.index('t4') < ids.index('t2')  # Canada before USA
    assert ids.index('t2') < ids.index('t1')  # USA-East before USA-West
    assert ids.index('t1') < ids.index('t3')  # USA-West-CA before USA-West-OR (alphabetical states)
