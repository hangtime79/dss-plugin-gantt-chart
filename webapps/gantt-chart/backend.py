"""
Backend Flask endpoints for Gantt chart webapp.

Provides two main endpoints:
- /get-tasks: Transform dataset into Frappe Gantt task format
- /get-config: Return frontend configuration
"""

import dataiku
from dataiku.customwebapp import *
from flask import request
import json
import traceback
import logging
from functools import reduce

# Import our transformation logic
from ganttchart.task_transformer import TaskTransformer, TaskTransformerConfig
from ganttchart.sort_utils import sort_tasks, group_and_sort_tasks

logger = logging.getLogger(__name__)
logger.info("Gantt Chart backend module loading...")


@app.route('/get-tasks')
def get_tasks():
    """
    Transform dataset rows into Frappe Gantt task format.
    """
    logger.info("ENTER /get-tasks")
    try:
        # Parse request parameters
        config_str = request.args.get('config', '{}')
        filters_str = request.args.get('filters', '[]')
        logger.info(f"Received params - config: {len(config_str)} chars, filters: {len(filters_str)} chars")
        
        config = json.loads(config_str)
        filters = json.loads(filters_str)

        # Extract dataset name
        dataset_name = config.get('dataset')
        logger.info(f"Target dataset: {dataset_name}")
        
        if not dataset_name:
            logger.error("Dataset name missing in config")
            return json.dumps({
                'error': {
                    'code': 'DATASET_NOT_SPECIFIED',
                    'message': 'No dataset selected. Please select a dataset to visualize.'
                }
            }), 400

        # Read dataset
        max_tasks = int(config.get('maxTasks', 1000))
        logger.info(f"Reading dataset: {dataset_name}")
        try:
            dataset = dataiku.Dataset(dataset_name)
            df = dataset.get_dataframe()
            # Track if we'll hit the display limit (0 = unlimited)
            row_limit_hit = max_tasks > 0 and len(df) > max_tasks
        except Exception as e:
            logger.error(f"Failed to read dataset: {e}")
            return json.dumps({
                'error': {
                    'code': 'DATASET_NOT_FOUND',
                    'message': f"Dataset '{dataset_name}' not found or access denied.",
                    'details': {'error': str(e)}
                }
            }), 400

        # Apply filters if provided
        if filters:
            try:
                df = apply_dataiku_filters(df, filters)
            except Exception as e:
                logger.warning(f"Error applying filters: {e}")
                # Continue without filters rather than failing

        # Check for empty dataset
        if df.empty:
            return json.dumps({
                'error': {
                    'code': 'EMPTY_DATASET',
                    'message': 'Dataset is empty or all rows were filtered out.',
                    'details': {'rowCount': 0}
                }
            }), 400

        # Build transformer config
        try:
            transformer_config = TaskTransformerConfig(
                id_column=config.get('idColumn'),
                name_column=config.get('nameColumn'),
                start_column=config.get('startColumn'),
                end_column=config.get('endColumn'),
                progress_column=config.get('progressColumn'),
                dependencies_column=config.get('dependenciesColumn'),
                color_column=config.get('colorColumn'),
                color_palette=config.get('colorPalette', 'classic'),  # (#49)
                tooltip_columns=config.get('tooltipColumns'),
                group_by_columns=config.get('groupByColumns'),
                max_tasks=int(config.get('maxTasks', 1000))
            )
        except Exception as e:
            return json.dumps({
                'error': {
                    'code': 'INVALID_CONFIGURATION',
                    'message': 'Invalid configuration parameters.',
                    'details': {'error': str(e)}
                }
            }), 400

        # Transform data
        logger.info(f"Transforming {len(df)} rows")
        transformer = TaskTransformer(transformer_config)

        try:
            result = transformer.transform(df)

            # Apply grouping and sorting
            group_by = config.get('groupByColumns', [])
            sort_by = config.get('sortBy', 'none')

            if group_by:
                result['tasks'] = group_and_sort_tasks(result['tasks'], group_by, sort_by)
            elif sort_by and sort_by != 'none':
                result['tasks'] = sort_tasks(result['tasks'], sort_by)
        except ValueError as e:
            # Configuration validation error
            logger.error(f"Validation error: {e}")
            return json.dumps({
                'error': {
                    'code': 'COLUMN_NOT_FOUND',
                    'message': str(e),
                    'details': {
                        'availableColumns': list(df.columns)
                    }
                }
            }), 400

        # Check if any valid tasks
        if not result['tasks']:
            return json.dumps({
                'error': {
                    'code': 'NO_VALID_TASKS',
                    'message': 'No valid tasks found. Check that your date columns contain valid dates and start dates are before end dates.',
                    'details': result['metadata']
                }
            }), 400

        # Add row limit indicator to metadata
        if row_limit_hit:
            result['metadata']['rowLimitHit'] = True
            result['metadata']['rowLimit'] = max_tasks

        logger.info(
            f"Transformed {result['metadata']['displayedRows']} tasks "
            f"({result['metadata']['skippedRows']} skipped)"
            f"{' [LIMIT HIT]' if row_limit_hit else ''}"
        )
        return json.dumps(result)

    except KeyError as e:
        logger.error(f"Column not found: {e}")
        logger.error(traceback.format_exc())
        return json.dumps({
            'error': {
                'code': 'COLUMN_NOT_FOUND',
                'message': f'Column not found: {str(e)}',
                'details': {'missingColumn': str(e)}
            }
        }), 400

    except Exception as e:
        logger.error(f"Error in get-tasks: {e}")
        logger.error(traceback.format_exc())
        return json.dumps({
            'error': {
                'code': 'INTERNAL_ERROR',
                'message': f'Internal error: {str(e)}',
                'details': {'traceback': traceback.format_exc()}
            }
        }), 500


@app.route('/get-config')
def get_config():
    """
    Return frontend configuration derived from webapp params.

    Returns:
        Frappe Gantt options object as JSON
    """
    try:
        config = get_webapp_config()

        # Map webapp params to Frappe Gantt options
        gantt_config = {
            'view_mode': config.get('viewMode', 'Week'),
            'view_mode_select': config.get('viewModeSelect', True),
            'bar_height': int(config.get('barHeight', 30)),
            'bar_corner_radius': int(config.get('barCornerRadius', 3)),
            'column_width': int(config.get('columnWidth', 45)),
            'padding': int(config.get('padding', 18)),
            'readonly': config.get('readonly', True),
            'popup_on': config.get('popupOn', 'click'),
            'today_button': config.get('todayButton', True),
            'scroll_to': config.get('scrollTo', 'today'),
            'language': config.get('language', 'en')
        }

        # Handle weekend highlighting
        if config.get('highlightWeekends', True):
            gantt_config['holidays'] = {
                'var(--g-weekend-highlight-color)': 'weekend'
            }

        return json.dumps(gantt_config)

    except Exception as e:
        logger.error(f"Error in get-config: {e}")
        logger.error(traceback.format_exc())
        return str(e), 500


def apply_dataiku_filters(df, filters):
    """
    Apply filters from Dataiku's built-in filtering UI.

    Supports NUMERICAL_FACET, ALPHANUM_FACET, and DATE_FACET filter types.

    Args:
        df: Input DataFrame
        filters: List of filter dictionaries from Dataiku

    Returns:
        Filtered DataFrame
    """
    import pandas as pd
    import numpy as np

    def numerical_filter(df, filter):
        """Apply numerical range filter."""
        conditions = []
        if filter.get("minValue"):
            conditions.append(df[filter['column']] >= filter['minValue'])
        if filter.get("maxValue"):
            conditions.append(df[filter['column']] <= filter['maxValue'])
        return conditions

    def alphanum_filter(df, filter):
        """Apply alphanumeric facet filter."""
        conditions = []
        excluded_values = []
        for k, v in filter.get('excludedValues', {}).items():
            if k != '___dku_no_value___':
                if v:
                    excluded_values.append(k)
            else:
                if v:
                    conditions.append(~df[filter['column']].isnull())
        if excluded_values:
            if filter.get('columnType') == 'NUMERICAL':
                excluded_values = [float(x) for x in excluded_values]
            conditions.append(~df[filter['column']].isin(excluded_values))
        return conditions

    def date_filter(df, filter):
        """Apply date filter."""
        if filter.get("dateFilterType") == "RANGE":
            return date_range_filter(df, filter)
        else:
            return special_date_filter(df, filter)

    def date_range_filter(df, filter):
        """Apply date range filter."""
        conditions = []
        if filter.get("minValue"):
            conditions.append(
                df[filter['column']] >= pd.Timestamp(filter['minValue'], unit='ms')
            )
        if filter.get("maxValue"):
            conditions.append(
                df[filter['column']] <= pd.Timestamp(filter['maxValue'], unit='ms')
            )
        return conditions

    def special_date_filter(df, filter):
        """Apply special date filters (year, month, day, etc.)."""
        conditions = []
        excluded_values = []
        for k, v in filter.get('excludedValues', {}).items():
            if v:
                excluded_values.append(k)

        if not excluded_values:
            return conditions

        filter_type = filter.get("dateFilterType")
        if filter_type == "YEAR":
            conditions.append(~df[filter['column']].dt.year.isin(excluded_values))
        elif filter_type == "QUARTER_OF_YEAR":
            conditions.append(~df[filter['column']].dt.quarter.isin([int(k)+1 for k in excluded_values]))
        elif filter_type == "MONTH_OF_YEAR":
            conditions.append(~df[filter['column']].dt.month.isin([int(k)+1 for k in excluded_values]))
        elif filter_type == "WEEK_OF_YEAR":
            conditions.append(~df[filter['column']].dt.isocalendar().week.isin([int(k)+1 for k in excluded_values]))
        elif filter_type == "DAY_OF_MONTH":
            conditions.append(~df[filter['column']].dt.day.isin([int(k)+1 for k in excluded_values]))
        elif filter_type == "DAY_OF_WEEK":
            conditions.append(~df[filter['column']].dt.dayofweek.isin(excluded_values))
        elif filter_type == "HOUR_OF_DAY":
            conditions.append(~df[filter['column']].dt.hour.isin(excluded_values))

        return conditions

    def apply_conditions(df, conditions):
        """Apply list of conditions to DataFrame."""
        if not conditions:
            return df
        elif len(conditions) == 1:
            return df[conditions[0]]
        else:
            return df[reduce(lambda c1, c2: c1 & c2, conditions)]

    # Apply each filter
    for f in filters:
        try:
            filter_type = f.get("filterType")
            if filter_type == "NUMERICAL_FACET":
                df = apply_conditions(df, numerical_filter(df, f))
            elif filter_type == "ALPHANUM_FACET":
                df = apply_conditions(df, alphanum_filter(df, f))
            elif filter_type == "DATE_FACET":
                df = apply_conditions(df, date_filter(df, f))
        except Exception as e:
            logger.warning(
                f"Error applying filter on column {f.get('column')}: {e}"
            )

    if df.empty:
        raise ValueError("DataFrame is empty after filtering")

    return df
