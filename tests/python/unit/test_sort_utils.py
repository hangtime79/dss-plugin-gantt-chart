import pytest
import datetime
from ganttchart.sort_utils import sort_tasks, _topological_sort

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
