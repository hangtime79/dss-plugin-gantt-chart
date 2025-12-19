"""
Sorting utilities for Gantt chart tasks.

Provides sorting logic for tasks based on various criteria, including
dates, names, duration, and topological dependency order.
"""

import datetime
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


def sort_tasks(tasks: List[Dict[str, Any]], sort_by: str) -> List[Dict[str, Any]]:
    """
    Sort tasks based on the specified criteria.

    Args:
        tasks: List of task dictionaries
        sort_by: Sort criteria identifier

    Returns:
        Sorted list of tasks
    """
    if not tasks:
        return []

    if sort_by == 'none' or not sort_by:
        return tasks

    logger.info(f"Sorting {len(tasks)} tasks by '{sort_by}'")

    if sort_by == 'start_asc':
        return sorted(tasks, key=lambda t: t['start'])
    
    elif sort_by == 'start_desc':
        return sorted(tasks, key=lambda t: t['start'], reverse=True)
    
    elif sort_by == 'end_asc':
        return sorted(tasks, key=lambda t: t['end'])
    
    elif sort_by == 'end_desc':
        return sorted(tasks, key=lambda t: t['end'], reverse=True)
    
    elif sort_by == 'name_asc':
        return sorted(tasks, key=lambda t: str(t.get('name', '')).lower())
    
    elif sort_by == 'name_desc':
        return sorted(tasks, key=lambda t: str(t.get('name', '')).lower(), reverse=True)
    
    elif sort_by == 'duration_asc':
        return sorted(tasks, key=_get_duration)
    
    elif sort_by == 'duration_desc':
        return sorted(tasks, key=_get_duration, reverse=True)
    
    elif sort_by == 'dependencies':
        return _topological_sort(tasks)

    logger.warning(f"Unknown sort criteria: '{sort_by}'. Returning unsorted tasks.")
    return tasks


def _get_duration(task: Dict[str, Any]) -> int:
    """Calculate duration in days for sorting."""
    try:
        start = datetime.datetime.strptime(task['start'], '%Y-%m-%d')
        end = datetime.datetime.strptime(task['end'], '%Y-%m-%d')
        return (end - start).days
    except (ValueError, TypeError):
        return 0


def _topological_sort(tasks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Sort tasks topologically based on dependencies using Kahn's algorithm.
    
    Tasks without dependencies come first. If cycles exist, tasks involved
    in the cycle will be appended at the end in their original relative order.
    
    Args:
        tasks: List of task objects
        
    Returns:
        Topologically sorted list of tasks
    """
    # Build graph and in-degree count
    id_to_task = {t['id']: t for t in tasks}
    adj = {t['id']: [] for t in tasks}
    in_degree = {t['id']: 0 for t in tasks}
    
    for task in tasks:
        task_id = task['id']
        deps_str = task.get('dependencies', '')
        
        if not deps_str:
            continue
            
        # Parse dependencies
        deps = [d.strip() for d in deps_str.split(',') if d.strip()]
        
        for dep_id in deps:
            if dep_id in id_to_task:
                adj[dep_id].append(task_id)
                in_degree[task_id] += 1

    # Initialize queue with nodes having 0 in-degree
    queue = [t['id'] for t in tasks if in_degree[t['id']] == 0]
    
    # Sort queue to ensure deterministic output for independent tasks
    # (preserve original relative order or sort by ID/Start)
    # Here we preserve original order implicitly if queue construction is stable?
    # Actually, let's sort the initial queue by start date to have a nice waterfall
    # for independent tasks
    queue.sort(key=lambda tid: id_to_task[tid]['start'])
    
    result_ids = []
    
    while queue:
        u_id = queue.pop(0)
        result_ids.append(u_id)
        
        # We sort neighbors to ensure deterministic processing order
        neighbors = sorted(adj[u_id], key=lambda tid: id_to_task[tid]['start'])
        
        for v_id in neighbors:
            in_degree[v_id] -= 1
            if in_degree[v_id] == 0:
                queue.append(v_id)
                
    # If graph has cycles, some nodes weren't added. 
    # Append them at the end.
    if len(result_ids) < len(tasks):
        processed_set = set(result_ids)
        remaining = [t for t in tasks if t['id'] not in processed_set]
        # Sort remaining by start date
        remaining.sort(key=lambda t: t['start'])
        
        result_ids.extend([t['id'] for t in remaining])
        
        logger.warning(
            f"Topological sort incomplete due to cycles. "
            f"Sorted {len(result_ids)-len(remaining)} tasks, appended {len(remaining)} remaining."
        )

    # Reconstruct task list
    return [id_to_task[tid] for tid in result_ids]
