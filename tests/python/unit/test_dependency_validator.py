"""
Unit tests for dependency_validator module.
"""

import pytest

from ganttchart.dependency_validator import (
    detect_and_break_cycles,
    validate_dependency_references,
    validate_all_dependencies,
    count_dependencies,
    _build_adjacency_list
)


class TestDetectAndBreakCycles:
    """Tests for detect_and_break_cycles function."""

    def test_simple_cycle(self, circular_dependency_tasks):
        """Test detection of simple circular dependency."""
        # Make a deep copy to preserve original for comparison
        import copy
        original_tasks = copy.deepcopy(circular_dependency_tasks)

        result, warnings = detect_and_break_cycles(circular_dependency_tasks)
        # Should generate a warning about the cycle
        assert len(warnings) > 0
        assert any('circular' in w.lower() or 'cycle' in w.lower() for w in warnings)
        # Verify that at least one task now has empty or reduced dependencies
        # After breaking A→B→C→A, one edge should be removed
        empty_or_reduced = False
        for r_task, orig_task in zip(result, original_tasks):
            r_deps = r_task['dependencies'] if r_task['dependencies'] else []
            o_deps = orig_task['dependencies'] if isinstance(orig_task['dependencies'], list) else ([d.strip() for d in orig_task['dependencies'].split(',') if d.strip()] if orig_task['dependencies'] else [])
            if len(r_deps) < len(o_deps):
                empty_or_reduced = True
                break
        assert empty_or_reduced, "Cycle should have been broken by removing at least one dependency"

    def test_self_dependency(self, self_dependency_tasks):
        """Test detection of self-dependency."""
        result, warnings = detect_and_break_cycles(self_dependency_tasks)
        assert len(warnings) > 0
        # Self-dependencies should be removed
        task_a = next(t for t in result if t['id'] == 'A')
        assert 'A' not in task_a['dependencies']

    def test_no_cycles(self):
        """Test tasks with no cycles."""
        tasks = [
            {'id': 'A', 'name': 'Task A', 'start': '2024-01-01', 'end': '2024-01-05', 'dependencies': []},
            {'id': 'B', 'name': 'Task B', 'start': '2024-01-06', 'end': '2024-01-10', 'dependencies': ['A']},
            {'id': 'C', 'name': 'Task C', 'start': '2024-01-11', 'end': '2024-01-15', 'dependencies': ['B']}
        ]
        result, warnings = detect_and_break_cycles(tasks)
        assert len(warnings) == 0
        # Dependencies should remain unchanged
        assert result[1]['dependencies'] == ['A']
        assert result[2]['dependencies'] == ['B']

    def test_empty_tasks(self):
        """Test empty task list."""
        result, warnings = detect_and_break_cycles([])
        assert result == []
        assert warnings == []

    def test_tasks_without_dependencies(self):
        """Test tasks with no dependencies."""
        tasks = [
            {'id': 'A', 'name': 'Task A', 'start': '2024-01-01', 'end': '2024-01-05', 'dependencies': ''},
            {'id': 'B', 'name': 'Task B', 'start': '2024-01-06', 'end': '2024-01-10', 'dependencies': ''}
        ]
        result, warnings = detect_and_break_cycles(tasks)
        assert len(warnings) == 0

    def test_complex_cycle(self):
        """Test complex cycle with multiple nodes."""
        tasks = [
            {'id': 'A', 'dependencies': ['B']},
            {'id': 'B', 'dependencies': ['C']},
            {'id': 'C', 'dependencies': ['D']},
            {'id': 'D', 'dependencies': ['A']}  # Creates cycle: A→B→C→D→A
        ]
        result, warnings = detect_and_break_cycles(tasks)
        assert len(warnings) > 0
        # Cycle should be broken
        total_deps = sum(len(t['dependencies']) if t['dependencies'] else 0 for t in result)
        assert total_deps < 4


class TestValidateDependencyReferences:
    """Tests for validate_dependency_references function."""

    def test_valid_references(self):
        """Test tasks with valid dependency references."""
        tasks = [
            {'id': 'A', 'dependencies': []},
            {'id': 'B', 'dependencies': ['A']},
            {'id': 'C', 'dependencies': ['A', 'B']}
        ]
        result, warnings = validate_dependency_references(tasks)
        assert len(warnings) == 0
        assert result[2]['dependencies'] == ['A', 'B']

    def test_missing_references(self, missing_reference_tasks):
        """Test removal of non-existent dependencies."""
        result, warnings = validate_dependency_references(missing_reference_tasks)
        assert len(warnings) > 0
        # Task A depends on B,C but C doesn't exist
        task_a = next(t for t in result if t['id'] == 'A')
        assert 'C' not in task_a['dependencies']
        assert 'B' in task_a['dependencies']
        # Task B depends on D which doesn't exist
        task_b = next(t for t in result if t['id'] == 'B')
        assert task_b['dependencies'] == []

    def test_self_dependency_removal(self):
        """Test removal of self-dependencies."""
        tasks = [
            {'id': 'A', 'dependencies': ['A']},
            {'id': 'B', 'dependencies': ['A', 'B', 'C']}
        ]
        result, warnings = validate_dependency_references(tasks)
        assert len(warnings) >= 2
        task_a = next(t for t in result if t['id'] == 'A')
        assert task_a['dependencies'] == []
        task_b = next(t for t in result if t['id'] == 'B')
        # B and C should be removed (B=self, C=non-existent)
        assert task_b['dependencies'] == ['A']

    def test_empty_dependencies(self):
        """Test tasks with empty dependencies."""
        tasks = [
            {'id': 'A', 'dependencies': ''},
            {'id': 'B', 'dependencies': None}
        ]
        result, warnings = validate_dependency_references(tasks)
        assert len(warnings) == 0


class TestValidateAllDependencies:
    """Tests for validate_all_dependencies function."""

    def test_combined_validation(self):
        """Test combined reference and cycle validation."""
        tasks = [
            {'id': 'A', 'dependencies': ['B', 'D']},  # D doesn't exist
            {'id': 'B', 'dependencies': ['C']},
            {'id': 'C', 'dependencies': ['A']}  # Creates cycle: A→B→C→A
        ]
        result, warnings = validate_all_dependencies(tasks)
        # Should have warnings for both missing reference and cycle
        assert len(warnings) >= 2
        # D should be removed (doesn't exist)
        task_a = next(t for t in result if t['id'] == 'A')
        assert 'D' not in task_a['dependencies']


class TestBuildAdjacencyList:
    """Tests for _build_adjacency_list helper."""

    def test_basic_adjacency_list(self):
        """Test basic adjacency list construction."""
        tasks = [
            {'id': 'A', 'dependencies': ['B', 'C']},
            {'id': 'B', 'dependencies': []},
            {'id': 'C', 'dependencies': ['B']}
        ]
        adj_list = _build_adjacency_list(tasks)
        assert adj_list['A'] == ['B', 'C']
        assert adj_list['B'] == []
        assert adj_list['C'] == ['B']

    def test_empty_dependencies(self):
        """Test adjacency list with empty dependencies."""
        tasks = [
            {'id': 'A', 'dependencies': []},
            {'id': 'B'}  # No dependencies field
        ]
        adj_list = _build_adjacency_list(tasks)
        assert adj_list['A'] == []
        assert adj_list['B'] == []

    def test_list_dependencies(self):
        """Test adjacency list with list-type dependencies."""
        tasks = [
            {'id': 'A', 'dependencies': ['B', 'C']},
            {'id': 'B', 'dependencies': []}
        ]
        adj_list = _build_adjacency_list(tasks)
        assert adj_list['A'] == ['B', 'C']


class TestCountDependencies:
    """Tests for count_dependencies function."""

    def test_basic_count(self):
        """Test basic dependency counting."""
        tasks = [
            {'id': 'A', 'dependencies': []},
            {'id': 'B', 'dependencies': ['A']},
            {'id': 'C', 'dependencies': ['A', 'B']}
        ]
        counts = count_dependencies(tasks)
        assert counts['total_tasks'] == 3
        assert counts['tasks_with_deps'] == 2
        assert counts['total_dep_edges'] == 3
        assert counts['max_deps_per_task'] == 2

    def test_no_dependencies(self):
        """Test counting with no dependencies."""
        tasks = [
            {'id': 'A', 'dependencies': []},
            {'id': 'B', 'dependencies': []}
        ]
        counts = count_dependencies(tasks)
        assert counts['total_tasks'] == 2
        assert counts['tasks_with_deps'] == 0
        assert counts['total_dep_edges'] == 0
        assert counts['max_deps_per_task'] == 0

    def test_empty_tasks(self):
        """Test counting with empty task list."""
        counts = count_dependencies([])
        assert counts['total_tasks'] == 0
