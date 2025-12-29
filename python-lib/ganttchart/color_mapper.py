"""
Color mapping utilities for Gantt chart plugin.

Maps categorical values to CSS class names for color-coded task bars.
Uses a 12-color palette that cycles for datasets with >12 categories.
Supports multiple palettes: classic, pastel, dark, dataiku (#49).
Supports custom palettes via parameter sets (#79).
"""

from typing import Dict, Any, Optional, List
import pandas as pd
import logging
import re

logger = logging.getLogger(__name__)

# ===== COLOR PALETTES (#49) =====
# Each palette has 12 colors that cycle for >12 categories

PALETTES = {
    'classic': [
        'bar-blue', 'bar-green', 'bar-orange', 'bar-purple',
        'bar-red', 'bar-teal', 'bar-pink', 'bar-indigo',
        'bar-cyan', 'bar-amber', 'bar-lime', 'bar-gray'
    ],
    'pastel': [
        'bar-pastel-blue', 'bar-pastel-green', 'bar-pastel-orange', 'bar-pastel-purple',
        'bar-pastel-red', 'bar-pastel-teal', 'bar-pastel-pink', 'bar-pastel-indigo',
        'bar-pastel-cyan', 'bar-pastel-amber', 'bar-pastel-lime', 'bar-pastel-gray'
    ],
    'dark': [
        'bar-dark-blue', 'bar-dark-green', 'bar-dark-orange', 'bar-dark-purple',
        'bar-dark-red', 'bar-dark-teal', 'bar-dark-pink', 'bar-dark-indigo',
        'bar-dark-cyan', 'bar-dark-amber', 'bar-dark-lime', 'bar-dark-gray'
    ],
    'dataiku': [
        'bar-dku-1', 'bar-dku-2', 'bar-dku-3', 'bar-dku-4',
        'bar-dku-5', 'bar-dku-6', 'bar-dku-7', 'bar-dku-8',
        'bar-dku-9', 'bar-dku-10', 'bar-dku-11', 'bar-dku-12'
    ]
}

# Default to classic palette for backwards compatibility
COLOR_PALETTE = PALETTES['classic']

DEFAULT_COLOR = 'bar-gray'


def get_palette(name: str = 'classic') -> List[str]:
    """
    Get color palette by name, defaults to classic.

    Args:
        name: Palette name ('classic', 'pastel', 'dark', 'dataiku')

    Returns:
        List of CSS class names for the palette

    Example:
        >>> palette = get_palette('pastel')
        >>> palette[0]
        'bar-pastel-blue'
    """
    return PALETTES.get(name, PALETTES['classic'])


# ===== CUSTOM PALETTE VALIDATION (#79) =====

def validate_custom_colors(colors: List[str]) -> Optional[List[str]]:
    """
    Validate and normalize custom hex colors.

    Args:
        colors: List of hex color strings

    Returns:
        List of normalized 6-digit hex colors (uppercase), or None if invalid.
        Returns None if fewer than 6 colors provided.

    Example:
        >>> validate_custom_colors(['#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#e74c3c', '#1abc9c'])
        ['#3498DB', '#2ECC71', '#E67E22', '#9B59B6', '#E74C3C', '#1ABC9C']
        >>> validate_custom_colors(['#abc', '#def', '#123', '#456', '#789', '#fed'])
        ['#AABBCC', '#DDEEFF', '#112233', '#445566', '#778899', '#FFEEDD']
        >>> validate_custom_colors(['#bad', '#format'])  # Invalid - too few colors
        None
    """
    if not colors or len(colors) < 6:
        logger.error(f"Custom palette must have at least 6 colors, got {len(colors) if colors else 0}")
        return None

    # Cap at 12 colors (matching built-in palette size)
    colors = colors[:12]

    hex_pattern = re.compile(r'^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$')
    validated = []

    for color in colors:
        if not isinstance(color, str):
            logger.error(f"Color must be string, got {type(color)}")
            return None

        color = color.strip()
        if not hex_pattern.match(color):
            logger.error(f"Invalid hex color format: {color}")
            return None

        # Normalize 3-digit to 6-digit hex (#RGB -> #RRGGBB)
        if len(color) == 4:
            color = f'#{color[1]*2}{color[2]*2}{color[3]*2}'

        validated.append(color.upper())

    return validated


def create_color_mapping(
    df: pd.DataFrame,
    column_name: str,
    palette_name: str = 'classic',
    custom_colors: Optional[List[str]] = None
) -> Dict[Any, str]:
    """
    Create a mapping from categorical values to CSS class names.

    Args:
        df: DataFrame containing the categorical column
        column_name: Name of the column to map
        palette_name: Name of color palette to use ('classic', 'pastel', 'dark', 'dataiku', 'custom')
        custom_colors: List of hex colors for custom palette (#79)

    Returns:
        Dictionary mapping category values to CSS class names.
        Empty dict if column doesn't exist.

    Example:
        >>> df = pd.DataFrame({'category': ['Dev', 'QA', 'Dev', 'Ops']})
        >>> mapping = create_color_mapping(df, 'category')
        >>> mapping
        {'Dev': 'bar-blue', 'Ops': 'bar-green', 'QA': 'bar-orange'}
        >>> mapping = create_color_mapping(df, 'category', 'pastel')
        >>> mapping
        {'Dev': 'bar-pastel-blue', 'Ops': 'bar-pastel-green', 'QA': 'bar-pastel-orange'}
    """
    # Check if column exists
    if column_name not in df.columns:
        logger.error(f"Column '{column_name}' not found in DataFrame")
        return {}

    # Get the specified palette (#79 - handle custom palettes)
    if palette_name == 'custom' and custom_colors:
        validated = validate_custom_colors(custom_colors)
        if validated:
            palette = [f'bar-custom-{i+1}' for i in range(len(validated))]
            logger.info(f"Using custom palette with {len(validated)} colors")
        else:
            logger.warning("Invalid custom colors, falling back to classic palette")
            palette = get_palette('classic')
    else:
        palette = get_palette(palette_name)

    try:
        # Extract unique values, excluding NaN
        unique_values = df[column_name].dropna().unique()

        # Sort for consistent assignment across runs
        # Convert to string for comparison if mixed types
        try:
            unique_values = sorted(unique_values)
        except TypeError:
            # Can't sort mixed types, convert to strings
            unique_values = sorted(unique_values, key=str)

        # Create mapping
        mapping = {}
        for idx, value in enumerate(unique_values):
            # Cycle through palette for >12 categories
            color_class = palette[idx % len(palette)]
            mapping[value] = color_class

        # Warn if too many categories
        if len(unique_values) > 50:
            logger.warning(
                f"Column '{column_name}' has {len(unique_values)} unique values. "
                "Consider using a column with fewer categories for better visualization."
            )

        logger.info(
            f"Created color mapping for '{column_name}' with {len(unique_values)} categories "
            f"using '{palette_name}' palette"
        )

        return mapping

    except Exception as e:
        logger.error(f"Error creating color mapping for '{column_name}': {e}")
        return {}


def get_task_color_class(value: Any, mapping: Dict[Any, str]) -> str:
    """
    Get CSS class name for a specific value using the color mapping.

    Args:
        value: The categorical value
        mapping: Color mapping dictionary from create_color_mapping()

    Returns:
        CSS class name (e.g., 'bar-blue')
        Returns DEFAULT_COLOR ('bar-gray') if value not in mapping or is None

    Example:
        >>> mapping = {'Dev': 'bar-blue', 'QA': 'bar-green'}
        >>> get_task_color_class('Dev', mapping)
        'bar-blue'
        >>> get_task_color_class(None, mapping)
        'bar-gray'
        >>> get_task_color_class('Unknown', mapping)
        'bar-gray'
    """
    # Handle None/NaN
    if value is None:
        return DEFAULT_COLOR

    if isinstance(value, float):
        try:
            import numpy as np
            if np.isnan(value):
                return DEFAULT_COLOR
        except (ImportError, TypeError):
            pass

    try:
        if pd.isna(value):
            return DEFAULT_COLOR
    except (TypeError, ValueError):
        pass

    # Look up in mapping
    return mapping.get(value, DEFAULT_COLOR)


def get_color_mapping_summary(mapping: Dict[Any, str]) -> Dict[str, Any]:
    """
    Generate a summary of the color mapping for logging/debugging.

    Args:
        mapping: Color mapping dictionary

    Returns:
        Summary dictionary with statistics

    Example:
        >>> mapping = {'A': 'bar-blue', 'B': 'bar-green', 'C': 'bar-orange'}
        >>> summary = get_color_mapping_summary(mapping)
        >>> summary['total_categories']
        3
    """
    color_counts = {}
    for color in mapping.values():
        color_counts[color] = color_counts.get(color, 0) + 1

    return {
        'total_categories': len(mapping),
        'unique_colors': len(color_counts),
        'color_distribution': color_counts,
        'palette_cycles': (len(mapping) + len(COLOR_PALETTE) - 1) // len(COLOR_PALETTE)
    }
