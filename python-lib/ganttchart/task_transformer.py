"""
Task transformation logic for Gantt chart plugin.

Main orchestrator that transforms DataFrame rows into Frappe Gantt task objects.
Handles all edge cases and coordinates date parsing, color mapping, and dependency validation.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import pandas as pd
import logging

from ganttchart.date_parser import parse_date_to_iso, validate_date_range
from ganttchart.color_mapper import create_color_mapping, get_task_color_class
from ganttchart.dependency_validator import validate_all_dependencies
from ganttchart.sort_utils import sort_tasks

logger = logging.getLogger(__name__)


@dataclass
class TaskTransformerConfig:
    """Configuration for the task transformer."""
    id_column: str
    start_column: str
    end_column: str
    name_column: Optional[str] = None
    progress_column: Optional[str] = None
    dependencies_column: Optional[str] = None
    color_column: Optional[str] = None
    tooltip_columns: Optional[List[str]] = None
    sort_by: str = 'none'
    max_tasks: int = 1000


class TaskTransformer:
    """
    Transform DataFrame rows into Frappe Gantt task objects.

    Pipeline:
    1. Validate configuration
    2. Create color mapping (if colorColumn specified)
    3. Process each row
    4. Validate dependencies
    5. Apply maxTasks limit
    6. Return {tasks, metadata}
    """

    def __init__(self, config: TaskTransformerConfig):
        """
        Initialize transformer with configuration.

        Args:
            config: TaskTransformerConfig object
        """
        self.config = config
        self.stats = {
            'total_rows': 0,
            'displayed_rows': 0,
            'skipped_rows': 0,
            'skip_reasons': {}
        }
        self.warnings = []

    def transform(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Main transformation method.

        Args:
            df: Input DataFrame with task data

        Returns:
            Dictionary with structure:
            {
                'tasks': [Task, ...],
                'metadata': {
                    'totalRows': int,
                    'displayedRows': int,
                    'skippedRows': int,
                    'skipReasons': {...},
                    'warnings': [...]
                },
                'colorMapping': {...}  # Optional, if color column specified
            }

        Raises:
            ValueError: If configuration is invalid or DataFrame is empty
        """
        # Reset stats
        self.stats = {
            'total_rows': 0,
            'displayed_rows': 0,
            'skipped_rows': 0,
            'skip_reasons': {}
        }
        self.warnings = []

        # Validate
        self._validate_config(df)

        self.stats['total_rows'] = len(df)

        # Create color mapping if needed
        color_mapping = None
        if self.config.color_column:
            color_mapping = create_color_mapping(df, self.config.color_column)
            if color_mapping:
                logger.info(f"Created color mapping with {len(color_mapping)} categories")

        # Process rows
        tasks = []
        seen_ids = {}  # Track duplicate IDs

        for row_idx, row in df.iterrows():
            task = self._process_row(row, row_idx, color_mapping)
            if task:
                # Handle duplicate IDs
                task_id = task['id']
                if task_id in seen_ids:
                    seen_ids[task_id] += 1
                    task['id'] = f"{task_id}_{seen_ids[task_id]}"
                    self.warnings.append(
                        f"Duplicate task ID '{task_id}' at row {row_idx}. "
                        f"Renamed to '{task['id']}'."
                    )
                else:
                    seen_ids[task_id] = 0

                tasks.append(task)

        logger.info(f"Processed {len(tasks)} valid tasks from {self.stats['total_rows']} rows")

        # Validate dependencies
        if tasks:
            tasks, dep_warnings = validate_all_dependencies(tasks)
            self.warnings.extend(dep_warnings)

            # Sort tasks
            tasks = sort_tasks(tasks, self.config.sort_by)

        # Apply maxTasks limit
        if self.config.max_tasks > 0 and len(tasks) > self.config.max_tasks:
            original_count = len(tasks)
            tasks = tasks[:self.config.max_tasks]
            self.warnings.append(
                f"Dataset has {original_count} tasks. Displaying first {self.config.max_tasks} "
                f"due to maxTasks limit. Consider filtering the data or increasing maxTasks."
            )

        # Update stats
        self.stats['displayed_rows'] = len(tasks)
        self.stats['skipped_rows'] = self.stats['total_rows'] - self.stats['displayed_rows']

        # Build result
        result = {
            'tasks': tasks,
            'metadata': {
                'totalRows': self.stats['total_rows'],
                'displayedRows': self.stats['displayed_rows'],
                'skippedRows': self.stats['skipped_rows'],
                'skipReasons': self.stats['skip_reasons'],
                'warnings': self.warnings
            }
        }

        if color_mapping:
            result['colorMapping'] = color_mapping

        return result

    def _validate_config(self, df: pd.DataFrame) -> None:
        """
        Validate configuration and DataFrame.

        Args:
            df: Input DataFrame

        Raises:
            ValueError: If validation fails
        """
        if df.empty:
            raise ValueError("DataFrame is empty")

        # Check required columns exist
        required_cols = [
            self.config.id_column,
            self.config.start_column,
            self.config.end_column
        ]

        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(
                f"Required columns not found: {', '.join(missing_cols)}. "
                f"Available columns: {', '.join(df.columns)}"
            )

        # Check optional columns if specified
        optional_cols = []
        if self.config.name_column:
            optional_cols.append(self.config.name_column)
        if self.config.progress_column:
            optional_cols.append(self.config.progress_column)
        if self.config.dependencies_column:
            optional_cols.append(self.config.dependencies_column)
        if self.config.color_column:
            optional_cols.append(self.config.color_column)
        if self.config.tooltip_columns:
            optional_cols.extend(self.config.tooltip_columns)

        missing_optional = [col for col in optional_cols if col not in df.columns]
        if missing_optional:
            logger.warning(f"Optional columns not found: {', '.join(missing_optional)}")

    def _process_row(
        self,
        row: pd.Series,
        row_idx: int,
        color_mapping: Optional[Dict[Any, str]]
    ) -> Optional[Dict[str, Any]]:
        """
        Process a single DataFrame row into a task object.

        Args:
            row: DataFrame row
            row_idx: Row index for generating fallback values
            color_mapping: Optional color mapping dictionary

        Returns:
            Task dictionary or None if row should be skipped
        """
        # Parse dates
        start_val = row[self.config.start_column]
        end_val = row[self.config.end_column]

        start_date, start_error = parse_date_to_iso(start_val)
        end_date, end_error = parse_date_to_iso(end_val)

        # Skip if dates invalid
        if not start_date or not end_date:
            self._increment_skip_reason('invalid_dates')
            return None

        # Skip if start > end
        if not validate_date_range(start_date, end_date):
            self._increment_skip_reason('start_after_end')
            logger.warning(
                f"Row {row_idx}: Start date {start_date} is after end date {end_date}. Skipping."
            )
            return None

        # Extract task ID (generate if null)
        raw_id = row[self.config.id_column]
        if pd.isna(raw_id) or str(raw_id).strip() == '':
            task_id = f"task_{row_idx}"
        else:
            logger.info(f"DEBUG: Task raw ID: {repr(raw_id)} (type: {type(raw_id)})")
            task_id = self._normalize_id(raw_id)
            logger.info(f"DEBUG: Task normalized ID: {repr(task_id)}")

        # Extract task name (use ID if column not configured or value missing)
        task_name = None
        if self.config.name_column:
            val = row[self.config.name_column]
            if not pd.isna(val) and str(val).strip() != '':
                task_name = str(val).strip()
        
        if not task_name:
            task_name = task_id

        # Build task object
        task = {
            'id': task_id,
            'name': task_name,
            'start': start_date,
            'end': end_date
        }

        # Add progress if column specified
        if self.config.progress_column:
            progress = self._extract_progress(row[self.config.progress_column])
            if progress is not None:
                task['progress'] = progress

        # Add dependencies if column specified
        if self.config.dependencies_column:
            raw_value = row[self.config.dependencies_column]
            logger.info(f"DEBUG: Task {task_id} - raw dependency value: {repr(raw_value)} (type: {type(raw_value)})")
            deps = self._extract_dependencies(raw_value)
            logger.info(f"DEBUG: Task {task_id} - extracted deps string: {repr(deps)}")
            task['dependencies'] = [d.strip() for d in deps.split(',') if d.strip()] if deps else []
            logger.info(f"DEBUG: Task {task_id} - final deps array: {task['dependencies']}")

        # Add color class if column specified
        if self.config.color_column and color_mapping:
            color_value = row[self.config.color_column]
            color_class = get_task_color_class(color_value, color_mapping)
            task['custom_class'] = color_class

        # Add custom tooltip fields
        if self.config.tooltip_columns:
            custom_fields = []  # Use list to preserve order explicitly
            cols = self.config.tooltip_columns
            if isinstance(cols, str):
                cols = [cols]

            for col in cols:
                if col in row.index:
                    val = row[col]
                    # Format value (handle null, dates, numbers)
                    if pd.isna(val):
                        formatted_val = None  # Will be handled by frontend as "-"
                    elif hasattr(val, 'strftime'):
                        formatted_val = val.strftime('%Y-%m-%d')
                    elif isinstance(val, (int, float)):
                        # Preserve numeric types for display
                        if pd.isna(val):
                            formatted_val = None
                        else:
                            formatted_val = val
                    else:
                        formatted_val = str(val).strip()

                    custom_fields.append({
                        'label': col,
                        'value': formatted_val
                    })

            if custom_fields:
                task['custom_fields'] = custom_fields

        return task

    def _extract_progress(self, value: Any) -> Optional[int]:
        """
        Extract and validate progress value (0-100).

        Args:
            value: Progress value from DataFrame

        Returns:
            Integer 0-100 or None if invalid
        """
        if pd.isna(value):
            return None

        try:
            progress = int(float(value))
            # Clamp to [0, 100]
            progress = max(0, min(100, progress))
            return progress
        except (ValueError, TypeError):
            logger.warning(f"Invalid progress value: {value}. Using None.")
            return None

    def _normalize_id(self, value: Any) -> str:
        """
        Normalize an ID value to a consistent string format.
        Used for both task IDs and dependency IDs to ensure they match.

        Handles all data types: int, float, str, Decimal, etc.

        Args:
            value: ID value from DataFrame

        Returns:
            Normalized string representation
        """
        if pd.isna(value):
            return ''

        # Convert to string and strip whitespace
        # This preserves the exact representation:
        # - int 61 -> "61"
        # - float 61.0 -> "61.0"
        # - float 3.14 -> "3.14"
        # - str "abc" -> "abc"
        # - Decimal("123.45") -> "123.45"
        return str(value).strip()

    def _extract_dependencies(self, value: Any) -> str:
        """
        Extract dependencies as comma-separated string.
        Uses _normalize_id() to ensure dependency IDs match task IDs exactly.

        Args:
            value: Dependencies value from DataFrame (can be str, int, float, etc.)

        Returns:
            Comma-separated string of task IDs, or empty string
        """
        # Handle NaN, None, or empty string
        if pd.isna(value):
            return ''

        # Normalize the value using the same logic as task IDs
        value_str = self._normalize_id(value)

        # Check if empty after normalization
        if not value_str:
            return ''

        # Split by comma, strip whitespace
        # This handles both "50" and "50,51,52" formats
        if ',' in value_str:
            # Multiple dependencies - each is already normalized by _normalize_id
            deps_list = [d.strip() for d in value_str.split(',') if d.strip()]
            return ','.join(deps_list) if deps_list else ''
        else:
            # Single dependency
            return value_str

    def _increment_skip_reason(self, reason: str) -> None:
        """Increment skip reason counter."""
        self.stats['skip_reasons'][reason] = self.stats['skip_reasons'].get(reason, 0) + 1
