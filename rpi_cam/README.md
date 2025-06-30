# Raspberry Pi Camera API

A FastAPI-based REST API to control Raspberry Pi cameras remotely. Tested and verified on Raspberry Pi 5 with Camera Module 3. This API is a component of the CML Reverse Engineering Lab platform.

## Features

- Remote camera control via REST API
- Secure authentication with API keys
- Integration with CML Reverse Engineering Lab platform
- Support for Raspberry Pi Camera Module 3
- Configurable CORS and networking settings

## Requirements

- Raspberry Pi (tested on Pi 5)
- Raspberry Pi Camera Module (tested with Module 3)
- Python 3.11+

## Quick Start

1. **Clone the Repository**

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab/rpi_cam
   ```

1. **Run Setup Script**

   ```bash
   ./setup.sh
   ```

   This script:

   - Verifies environment configuration
   - Sets up audio streaming capabilities
   - Installs dependencies using `uv`
   - Creates a Python virtual environment

1. **Register Your Camera**

   Access the main platform's `plugins/rpi-cam/cameras` endpoint and provide:

   - Name
   - Description (optional)
   - Camera API URL (where this API will be running)
   - Additional auth headers required to access the Camera API URL (optional)

   💡 Save the provided API key - it will only be shown once.

1. **Configure Environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your settings:

   ```ini
   # Camera API URL (default: 127.0.0.1:8018)
   BASE_URL='http://127.0.0.1:8018'

   # Allowed CORS origins (comma-separated, in double quotes)
   ALLOWED_CORS_ORIGINS=["http://127.0.0.1:8000", "https://cml-relab.org"]

   # Generated API keys from main platform
   AUTHORIZED_API_KEYS=["YOUR_API_KEY_HERE"]
   ```

   **Note:** Keep your API keys secure and never commit them to version control.

1. **Launch the API**

   ```bash
   uv run fastapi run app/main.py --port 8018
   ```

   Access the API documentation at `http://127.0.0.1:8018/docs`

1. **Platform Integration**

   - Access camera from main platform at the `/plugins/rpi-cam/camera/{camera_id}` endpoint

## Development

To set up a development environment:

- Install dev dependencies: `uv sync`
- Start development server: `uv run fastapi dev app/main.py`

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full development workflow and guidelines.
