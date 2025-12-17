#!/usr/bin/env bash
set -euo pipefail

# Generates GIFs from asciinema cast files under docs/images/casts
# Requirements (install if missing):
#   npm i -g svg-term-cli    (or use npx svg-term)
#   ImageMagick (convert) or gifski

OUT_DIR="docs/images"
CAST_DIR="docs/images/casts"

mkdir -p "$OUT_DIR"

function gen() {
  local cast="$1"
  local base="$2"
  local svg="$OUT_DIR/${base}.svg"
  local gif="$OUT_DIR/${base}.gif"

  echo "Generating $gif from $cast"

  # Use svg-term (prefer local install, else fall back to npx) to render cast to SVG
  SVG_TERM_CMD=""
  if [ -x "./node_modules/.bin/svg-term" ]; then
    SVG_TERM_CMD="./node_modules/.bin/svg-term"
  elif command -v npx >/dev/null 2>&1; then
    SVG_TERM_CMD="npx --yes svg-term"
  else
    echo "Error: svg-term not found. Please install svg-term-cli (npm i -D svg-term-cli) or ensure npx is available."
    exit 1
  fi

  # Render using a fixed width (columns)
  $SVG_TERM_CMD --in "$cast" --out "$svg" --window --width 80 >/dev/null 2>&1 || {
    echo "svg-term failed to render $cast to $svg"; exit 1; }


  # Convert SVG to GIF. Prefer gifski if available (higher quality), else use ImageMagick convert
  if command -v gifski >/dev/null 2>&1; then
    # Render SVG to PNG frames using rsvg-convert if available
    if command -v rsvg-convert >/dev/null 2>&1; then
      echo "Rendering frames from $svg"
      rsvg-convert -w 800 -h 400 "$svg" -o "$OUT_DIR/${base}.png"
      echo "Converting to GIF with gifski"
      gifski -o "$gif" "$OUT_DIR/${base}.png"
      rm "$OUT_DIR/${base}.png"
    else
      echo "rsvg-convert not found; attempting ImageMagick convert to make GIF"
      convert "$svg" "$gif"
    fi
  elif command -v convert >/dev/null 2>&1; then
    echo "Using ImageMagick convert to generate GIF"
    convert "$svg" "$gif"
  else
    echo "No GIF conversion tool found. SVG output is available at: $svg"
    echo "Install gifski and rsvg-convert (librsvg) or ImageMagick to create GIFs from SVGs."
    return
  fi

  echo "Generated: $gif"
}

# Generate list
gen "$CAST_DIR/sql-editing.cast" "sql-editing"
gen "$CAST_DIR/history-navigation.cast" "history-navigation"

echo "Done. Open the generated GIFs under docs/images/ or run the script again after installing missing tools."