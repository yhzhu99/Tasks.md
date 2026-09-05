#!/bin/sh
set -eu
export TASKS_DIR="${TASKS_DIR:-/tasks}"
export CONFIG_DIR="${CONFIG_DIR:-/config}"
mkdir -p "$TASKS_DIR" "$CONFIG_DIR/stylesheets" "$CONFIG_DIR/images"
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
base_path="${BASE_PATH:-}"
base_path="${base_path%/}"
# User CSS lives in the volume. Built-in themes are served from the image.
if [ ! -f "$CONFIG_DIR/stylesheets/custom.css" ]; then
  printf '@import url(%s/stylesheets/color-themes/adwaita.css);\n' "$base_path" > "$CONFIG_DIR/stylesheets/custom.css"
fi
exec node /api/server.js
