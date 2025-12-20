# Gantt Chart Plugin for Dataiku DSS

Visualize your project timelines, dependencies, and progress with an interactive Gantt chart. This plugin integrates the [Frappe Gantt](https://github.com/frappe/gantt) library directly into Dataiku DSS webapps.

## Features

- **Interactive Visualization**: Zoom, scroll, and drag to explore your timeline.
- **Multiple Views**: Switch between Hour, Quarter Day, Half Day, Day, Week, Month, and Year views.
- **Task Dependencies**: Visualize dependencies with automatic arrow rendering.
- **Progress Tracking**: Display task completion status (0-100%).
- **Categorical Coloring**: Color-code tasks based on categories (e.g., Team, Status, Priority).
- **Custom Tooltips (v0.2.0)**: Select specific columns to display in task details.
- **Offline Capable**: Bundled dependencies ensure functionality in air-gapped environments.

## Configuration

The plugin provides a standard webapp with the following configuration options:

### Required Columns
- **Task ID**: Unique identifier for each task.
- **Start Date**: Date column indicating when the task begins.
- **End Date**: Date column indicating when the task finishes.

### Optional Columns
- **Task Name**: Display label for the task (defaults to Task ID if unspecified).
- **Progress**: Numerical column (0-100) representing completion.
- **Dependencies**: Column containing comma-separated IDs of tasks that must complete first.
- **Color By**: Categorical column to assign colors (supports 12 distinct colors).
- **Tooltip Fields**: Additional columns to display in the task details popup.

### View Settings
- **Default View**: Initial time scale (e.g., "Week", "Month").
- **Sort By**: Order tasks by date, name, duration, or dependencies.
- **Behavior**: Toggle read-only mode, weekend highlighting, and "Today" button.

## Usage

1. **Prepare your dataset**: Ensure you have columns for ID, Start Date, and End Date.
2. **Create a webapp**: Select "Gantt Chart" from the plugin list.
3. **Configure columns**: Map your dataset columns to the chart parameters.
4. **Run**: The chart will render automatically.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

This plugin is distributed under the Apache License 2.0.
The bundled Frappe Gantt library is MIT licensed.