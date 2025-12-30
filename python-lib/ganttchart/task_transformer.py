"""
Task transformation logic for Gantt chart plugin.

Main orchestrator that transforms DataFrame rows into Frappe Gantt task objects.
Handles all edge cases and coordinates date parsing, color mapping, and dependency validation.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime, date
import pandas as pd
import logging
import re

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
    color_palette: str = 'classic'  # (#49) Color palette selection
    custom_colors: Optional[List[str]] = None  # (#79) Custom palette hex colors
    tooltip_columns: Optional[List[str]] = None
    group_by_columns: Optional[List[str]] = None
    sort_by: str = 'none'
    max_tasks: int = 1000
    duplicate_id_handling: str = 'rename'  # (#76) 'rename' or 'skip'


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
            color_mapping = create_color_mapping(
                df,
                self.config.color_column,
                self.config.color_palette,  # (#49) Pass palette selection
                self.config.custom_colors  # (#79) Pass custom palette colors
            )
            if color_mapping:
                logger.info(f"Created color mapping with {len(color_mapping)} categories")

        # Process rows with enhanced duplicate tracking (#76)
        tasks = []
        seen_ids = {}  # Track duplicate IDs: {id: [list of row indices]}
        duplicate_info = {}  # Structured duplicate data for metadata

        for row_idx, row in df.iterrows():
            task = self._process_row(row, row_idx, color_mapping)
            if task:
                task_id = task['id']

                if task_id in seen_ids:
                    # Duplicate found - compute suffix before appending
                    suffix = len(seen_ids[task_id])
                    seen_ids[task_id].append(row_idx)

                    if self.config.duplicate_id_handling == 'skip':
                        # Skip mode: don't add duplicate, track it
                        self._increment_skip_reason('duplicate_id')
                        if task_id not in duplicate_info:
                            duplicate_info[task_id] = {
                                'originalId': task_id,
                                'occurrences': [{'rowIndex': seen_ids[task_id][0], 'status': 'kept'}]
                            }
                        duplicate_info[task_id]['occurrences'].append({
                            'rowIndex': row_idx,
                            'status': 'skipped'
                        })
                        continue  # Skip this row
                    else:
                        # Rename mode (default): rename and add
                        new_id = f"{task_id}_{suffix}"
                        task['id'] = new_id

                        # Track for structured metadata
                        if task_id not in duplicate_info:
                            duplicate_info[task_id] = {
                                'originalId': task_id,
                                'occurrences': [{'rowIndex': seen_ids[task_id][0], 'assignedId': task_id}]
                            }
                        duplicate_info[task_id]['occurrences'].append({
                            'rowIndex': row_idx,
                            'assignedId': new_id
                        })

                        self.warnings.append(
                            f"Duplicate task ID '{task_id}' at row {row_idx}. "
                            f"Renamed to '{new_id}'."
                        )
                else:
                    seen_ids[task_id] = [row_idx]

                tasks.append(task)

        # Store structured duplicate info in stats for metadata (#76)
        if duplicate_info:
            self.stats['duplicate_ids'] = list(duplicate_info.values())

            # Check for dependency impact when IDs were renamed (#76)
            if self.config.duplicate_id_handling == 'rename':
                renamed_ids = set()
                for dup in duplicate_info.values():
                    renamed_ids.add(dup['originalId'])

                # Check if any task dependencies reference renamed IDs
                for task in tasks:
                    deps = task.get('dependencies', [])
                    for dep_id in deps:
                        if dep_id in renamed_ids:
                            self.warnings.append(
                                f"Task '{task['name']}' depends on '{dep_id}' which has duplicates. "
                                f"Dependency may be ambiguous."
                            )

        logger.info(f"Processed {len(tasks)} valid tasks from {self.stats['total_rows']} rows")

        # Validate dependencies
        if tasks:
            tasks, dep_warnings = validate_all_dependencies(tasks)
            self.warnings.extend(dep_warnings)

            # Sort tasks
            tasks = sort_tasks(tasks, self.config.sort_by)

            # Resolve dependency IDs to task names for display (#65)
            id_to_name = {t['id']: t['name'] for t in tasks}
            for task in tasks:
                if task.get('dependencies'):
                    resolved_names = []
                    for dep_id in task['dependencies']:
                        # Lookup name, fallback to ID if not found
                        name = id_to_name.get(dep_id, dep_id)
                        resolved_names.append(name)
                    task['_display_dependencies'] = ', '.join(resolved_names)

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
                'warnings': self.warnings,
                'duplicateIds': self.stats.get('duplicate_ids', [])  # (#76) Structured duplicate info
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
        # Store both CSS-safe ID (for internal use) and display ID (for tooltips)
        raw_id = row[self.config.id_column]
        if pd.isna(raw_id) or str(raw_id).strip() == '':
            task_id = f"task_{row_idx}"
            display_id = task_id  # Generated IDs are already display-friendly
        else:
            task_id = self._normalize_id(raw_id)
            # Keep original value for display (handles floats, strings, etc.)
            display_id = str(raw_id).strip() if not isinstance(raw_id, float) else (
                str(int(raw_id)) if raw_id.is_integer() else str(raw_id)
            )

        # Extract task name (use ID if column not configured or value missing)
        task_name = None
        if self.config.name_column:
            val = row[self.config.name_column]
            if not pd.isna(val) and str(val).strip() != '':
                task_name = str(val).strip()

        if not task_name:
            task_name = display_id  # Use display ID for name, not CSS-safe ID

        # Build task object
        task = {
            'id': task_id,
            '_display_id': display_id,  # Original ID for tooltip display
            'name': task_name,
            'start': start_date,
            'end': end_date
        }

        # Add expected progress (where task should be based on today's date)
        # Prefix with _ to hide from frappe-gantt (it uses task properties for CSS classes)
        expected_progress = self._calculate_expected_progress(start_date, end_date)
        if expected_progress is not None:
            task['_expected_progress'] = expected_progress

        # Add progress if column specified
        if self.config.progress_column:
            progress = self._extract_progress(row[self.config.progress_column])
            if progress is not None:
                task['progress'] = progress

        # Add dependencies if column specified
        # Store both CSS-safe IDs (for internal use) and display values (for tooltips)
        if self.config.dependencies_column:
            raw_value = row[self.config.dependencies_column]
            deps = self._extract_dependencies(raw_value)
            task['dependencies'] = [d.strip() for d in deps.split(',') if d.strip()] if deps else []

            # Store original dependency string for display
            if not pd.isna(raw_value) and str(raw_value).strip():
                task['_display_dependencies'] = str(raw_value).strip()
            else:
                task['_display_dependencies'] = ''

        # Add color class based on color column OR progress-based default
        if self.config.color_column and color_mapping:
            color_value = row[self.config.color_column]
            color_class = get_task_color_class(color_value, color_mapping)
            task['custom_class'] = color_class
        else:
            # No color column: use default gray bar with progress-based overlay color
            # Single class (no spaces) - Frappe Gantt uses classList.add() which rejects whitespace
            progress = task.get('progress', 0) or 0
            progress_tier = self._get_progress_tier(progress)
            task['custom_class'] = f'bar-default-tier-{progress_tier}'

        # Add completion flag for all palettes (#31 - completion indicator)
        task_progress = task.get('progress', 0) or 0
        task['_is_complete'] = (task_progress == 100)

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

        # Add group column values for hierarchical sorting
        if self.config.group_by_columns:
            group_values = {}
            for col in self.config.group_by_columns:
                if col in row.index:
                    val = row[col]
                    if pd.isna(val):
                        group_values[col] = None
                    else:
                        group_values[col] = str(val).strip()
            if group_values:
                task['_group_values'] = group_values

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

    def _get_progress_tier(self, progress: int) -> int:
        """
        Get progress tier for CSS class assignment.

        Maps progress percentage to discrete tiers for styling:
        - 0%: tier 0 (invisible overlay - same as base)
        - 1-24%: tier 1
        - 25-49%: tier 25
        - 50-74%: tier 50
        - 75-99%: tier 75
        - 100%: tier 100 (complete - green tint)

        Args:
            progress: Progress value 0-100

        Returns:
            Tier value (0, 1, 25, 50, 75, or 100)
        """
        if progress == 0:
            return 0
        elif progress < 25:
            return 1
        elif progress < 50:
            return 25
        elif progress < 75:
            return 50
        elif progress < 100:
            return 75
        else:
            return 100

    def _normalize_id(self, value: Any) -> str:
        """
        Normalize an ID value to a consistent, CSS-safe string format.
        Used for both task IDs and dependency IDs to ensure they match.

        Handles all data types: int, float, str, Decimal, etc.
        Converts whole-number floats (61.0) to int representation ("61")
        to match how Pandas reads columns differently based on NaN presence.

        Also handles string representations of floats (e.g., "1.0" -> "1")
        which can occur when dependency strings contain float-formatted IDs.

        IMPORTANT: All IDs are made CSS-safe because frappe-gantt uses them
        in selectors like `.highlight-{id}`. Non-safe characters are hex-encoded.

        Args:
            value: ID value from DataFrame

        Returns:
            Normalized, CSS-safe string representation
        """
        if pd.isna(value):
            return ''

        # Handle numeric types - convert whole number floats to int representation
        # This solves the Pandas type mismatch where:
        # - ID column (no NaNs): read as int64 → 277 → "277"
        # - Dependency column (has NaNs): read as float64 → 276.0 → "276.0"
        # We normalize both to "276" so they match
        if isinstance(value, float):
            # Check if it's a whole number (e.g., 276.0)
            if value.is_integer():
                return str(int(value))
            else:
                # Non-integer float (e.g., 54.8) - make CSS-safe
                return self._make_css_safe(str(value).strip())

        # For strings, also check if they look like whole-number floats
        # This handles "1.0" -> "1" for dependency strings like "1.0, 2.0"
        if isinstance(value, str):
            stripped = value.strip()
            try:
                float_val = float(stripped)
                if float_val.is_integer():
                    return str(int(float_val))
                else:
                    # Non-integer float string - make CSS-safe
                    return self._make_css_safe(stripped)
            except (ValueError, TypeError):
                pass
            # General string - make CSS-safe
            return self._make_css_safe(stripped)

        # For all other types (int, Decimal, etc.), convert directly
        return self._make_css_safe(str(value).strip())

    def _make_css_safe(self, value: str) -> str:
        """
        Make a string safe for use in CSS class names and selectors.

        Frappe-gantt uses task IDs in CSS selectors like `.highlight-{id}`.
        Invalid characters cause querySelector to throw DOMException.

        Uses hex-encoding for non-safe characters to ensure:
        - Deterministic: same input always produces same output
        - Collision-free: different inputs produce different outputs
        - Reversible: can decode back to original if needed

        Examples:
            "54.8" -> "54_x2e_8"   (period encoded as hex 2e)
            "task 1" -> "task_x20_1" (space encoded as hex 20)
            "item#5" -> "item_x23_5" (hash encoded as hex 23)

        Args:
            value: String to sanitize

        Returns:
            CSS-safe string with non-alphanumeric chars hex-encoded
        """
        def encode_char(match: re.Match) -> str:
            return f'_x{ord(match.group(0)):02x}_'

        # Keep alphanumerics, underscores, and hyphens (CSS-safe)
        # Encode everything else as _xHH_ where HH is the hex code
        return re.sub(r'[^a-zA-Z0-9_-]', encode_char, value)

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

        # Convert to string first (handles numeric single values)
        value_str = str(value).strip()

        # Check if empty
        if not value_str:
            return ''

        # Split by comma, normalize each part
        # This handles both "50" and "50,51,52" and "1.0, 2.0" formats
        if ',' in value_str:
            # Multiple dependencies - normalize each individual one
            deps_list = []
            for d in value_str.split(','):
                d = d.strip()
                if d:
                    # Normalize each dependency ID (handles '1.0' -> '1')
                    deps_list.append(self._normalize_id(d))
            return ','.join(deps_list) if deps_list else ''
        else:
            # Single dependency - normalize it
            return self._normalize_id(value_str)

    def _increment_skip_reason(self, reason: str) -> None:
        """Increment skip reason counter."""
        self.stats['skip_reasons'][reason] = self.stats['skip_reasons'].get(reason, 0) + 1

    def _calculate_expected_progress(self, start_date: str, end_date: str) -> Optional[float]:
        """
        Calculate expected progress based on current date.

        Expected progress shows where a task's progress *should* be if work
        proceeded linearly from start to end date.

        Args:
            start_date: Task start date in YYYY-MM-DD format
            end_date: Task end date in YYYY-MM-DD format

        Returns:
            Expected progress percentage (0-100), or None if:
            - Task hasn't started yet (today < start_date)
            - Task is past its end date (today > end_date)
            - Dates are invalid
        """
        try:
            today = date.today()
            start = datetime.strptime(start_date, '%Y-%m-%d').date()
            end = datetime.strptime(end_date, '%Y-%m-%d').date()

            # Task not started yet - no expected progress marker
            if today < start:
                return None

            # Task already past end date - no expected progress marker
            if today > end:
                return None

            # Calculate expected progress
            total_duration = (end - start).days
            if total_duration <= 0:
                # Same day task - if today is that day, 100% expected
                return 100.0

            elapsed = (today - start).days
            expected = (elapsed / total_duration) * 100
            return min(100.0, max(0.0, expected))

        except (ValueError, TypeError):
            return None
