"""
Dependency validation utilities for Gantt chart plugin.

Detects and breaks circular dependencies using DFS algorithm.
Validates that all dependency references point to existing tasks.
"""

from typing import List, Dict, Set, Tuple
import logging

logger = logging.getLogger(__name__)

# Colors for DFS cycle detection
WHITE = 0  # Unvisited
GRAY = 1   # In current DFS path (visiting)
BLACK = 2  # Fully processed


def detect_and_break_cycles(tasks: List[Dict]) -> Tuple[List[Dict], List[str]]:
    """
    Detect circular dependencies and break them by removing edges.

    Uses DFS-based cycle detection. When a cycle is detected, removes
    the "back edge" that creates the cycle.

    Args:
        tasks: List of task dictionaries with 'id' and 'dependencies' fields

    Returns:
        Tuple of (modified_tasks, warnings)
        - modified_tasks: Tasks with cyclic dependencies removed
        - warnings: List of warning messages about broken cycles

    Algorithm:
        - WHITE (0): Unvisited node
        - GRAY (1): Node in current DFS path (being visited)
        - BLACK (2): Node fully processed

        When visiting a GRAY node from another GRAY node → cycle detected

    Time Complexity: O(V + E) where V = tasks, E = dependencies
    Space Complexity: O(V) for color array and recursion stack
    """
    if not tasks:
        return ([], [])

    # Build task ID set and adjacency list
    task_ids = {task['id'] for task in tasks if 'id' in task}
    adj_list = _build_adjacency_list(tasks)

    # Initialize colors
    color = {task_id: WHITE for task_id in task_ids}
    cycle_edges = []  # List of (from, to) edges to remove
    warnings = []

    def dfs(node: str, path: List[str]):
        """DFS traversal with cycle detection."""
        color[node] = GRAY
        path.append(node)

        for neighbor in adj_list.get(node, []):
            if neighbor not in color:
                # Neighbor references non-existent task, skip
                continue

            if color[neighbor] == GRAY:
                # Cycle detected: neighbor is in current path
                cycle_path = path[path.index(neighbor):] + [neighbor]
                cycle_edges.append((node, neighbor))
                warnings.append(
                    f"Circular dependency detected: {' → '.join(cycle_path)}. "
                    f"Removing edge {node} → {neighbor}."
                )
            elif color[neighbor] == WHITE:
                dfs(neighbor, path)

        path.pop()
        color[node] = BLACK

    # Run DFS from all unvisited nodes
    for task_id in task_ids:
        if color[task_id] == WHITE:
            dfs(task_id, [])

    # Remove cycle edges from tasks
    if cycle_edges:
        edge_set = set(cycle_edges)
        for task in tasks:
            if 'dependencies' in task and task['dependencies']:
                original_deps = task['dependencies']
                if isinstance(original_deps, str):
                    deps_list = [d.strip() for d in original_deps.split(',') if d.strip()]
                elif isinstance(original_deps, list):
                    deps_list = [str(d).strip() for d in original_deps if d]
                else:
                    continue

                # Remove edges that are in cycle_edges
                filtered_deps = [
                    dep for dep in deps_list
                    if (task['id'], dep) not in edge_set
                ]

                task['dependencies'] = filtered_deps

    logger.info(f"Cycle detection completed. Broke {len(cycle_edges)} cyclic dependencies.")

    return (tasks, warnings)


def validate_dependency_references(tasks: List[Dict]) -> Tuple[List[Dict], List[str]]:
    """
    Validate that all dependency references point to existing tasks.

    Removes dependencies that reference non-existent task IDs.

    Args:
        tasks: List of task dictionaries

    Returns:
        Tuple of (modified_tasks, warnings)
    """
    warnings = []

    # Build set of valid task IDs
    valid_ids = {task['id'] for task in tasks if 'id' in task}

    for task in tasks:
        if 'dependencies' not in task or not task['dependencies']:
            continue

        task_id = task.get('id', 'unknown')
        deps = task['dependencies']

        # Parse dependencies
        if isinstance(deps, str):
            deps_list = [d.strip() for d in deps.split(',') if d.strip()]
        elif isinstance(deps, list):
            deps_list = [str(d).strip() for d in deps if d]
        else:
            continue

        # Check for self-dependency
        if task_id in deps_list:
            deps_list = [d for d in deps_list if d != task_id]
            warnings.append(
                f"Task '{task_id}' has self-dependency. Removed."
            )

        # Filter out invalid references
        invalid_refs = [d for d in deps_list if d not in valid_ids]
        if invalid_refs:
            warnings.append(
                f"Task '{task_id}' references non-existent tasks: {', '.join(invalid_refs)}. Removed."
            )

        # Keep only valid dependencies
        valid_deps = [d for d in deps_list if d in valid_ids]
        task['dependencies'] = valid_deps

    if warnings:
        logger.info(f"Dependency validation found {len(warnings)} issues.")

    return (tasks, warnings)


def validate_all_dependencies(tasks: List[Dict]) -> Tuple[List[Dict], List[str]]:
    """
    Run all dependency validations: reference checking and cycle detection.

    Args:
        tasks: List of task dictionaries

    Returns:
        Tuple of (modified_tasks, all_warnings)
    """
    all_warnings = []

    # First, validate references (remove invalid dependencies)
    tasks, ref_warnings = validate_dependency_references(tasks)
    all_warnings.extend(ref_warnings)

    # Then, detect and break cycles
    tasks, cycle_warnings = detect_and_break_cycles(tasks)
    all_warnings.extend(cycle_warnings)

    return (tasks, all_warnings)


def _build_adjacency_list(tasks: List[Dict]) -> Dict[str, List[str]]:
    """
    Build adjacency list from task dependencies.

    Args:
        tasks: List of task dictionaries

    Returns:
        Dictionary mapping task_id to list of dependent task_ids
    """
    adj_list = {}

    for task in tasks:
        task_id = task.get('id')
        if not task_id:
            continue

        adj_list[task_id] = []

        deps = task.get('dependencies', '')
        if not deps:
            continue

        # Parse dependencies
        if isinstance(deps, str):
            deps_list = [d.strip() for d in deps.split(',') if d.strip()]
        elif isinstance(deps, list):
            deps_list = [str(d).strip() for d in deps if d]
        else:
            continue

        adj_list[task_id] = deps_list

    return adj_list


def count_dependencies(tasks: List[Dict]) -> Dict[str, int]:
    """
    Count total number of dependencies in task list.

    Args:
        tasks: List of task dictionaries

    Returns:
        Dictionary with counts: {
            'total_tasks': int,
            'tasks_with_deps': int,
            'total_dep_edges': int,
            'max_deps_per_task': int
        }
    """
    total_tasks = len(tasks)
    tasks_with_deps = 0
    total_dep_edges = 0
    max_deps = 0

    for task in tasks:
        deps = task.get('dependencies', '')
        if not deps:
            continue

        if isinstance(deps, str):
            deps_list = [d.strip() for d in deps.split(',') if d.strip()]
        elif isinstance(deps, list):
            deps_list = [d for d in deps if d]
        else:
            continue

        if deps_list:
            tasks_with_deps += 1
            dep_count = len(deps_list)
            total_dep_edges += dep_count
            max_deps = max(max_deps, dep_count)

    return {
        'total_tasks': total_tasks,
        'tasks_with_deps': tasks_with_deps,
        'total_dep_edges': total_dep_edges,
        'max_deps_per_task': max_deps
    }
