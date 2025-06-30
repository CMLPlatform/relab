#!/usr/bin/env bash
# Exit immediately if a command exits with a non-zero status
set -e

# Create a null audio sink to stream null audio to YouTube, if it doesn't already exist
pactl list sinks short | grep -q "nullaudio" || pactl load-module module-null-sink sink_name=nullaudio

# Install uv if not already installed
command -v uv >/dev/null || wget -qO- https://astral.sh/uv/install.sh | sh

# Create venv (includes system site packages for access to PiCamera2) and sync dependencies
uv venv --system-site-packages
uv sync --frozen --no-cache --no-dev
