# Installation Guide

## Overview

- [Use Our Platform (Recommended)](#use-our-platform-recommended)
- [Self-Hosting](#self-hosting)
  - [Docker Setup](#docker-setup)
  - [Local Development](#local-development)
    - [Backend Setup](#backend-setup)
    - [Documentation Setup](#documentation-setup)
    - [Frontend Setup](#frontend-setup)
    - [Raspberry Pi Camera Setup (Optional)](#raspberry-pi-camera-setup-optional)
- [Production Deployment](#production-deployment)
- [Need Help?](#need-help)

## Use Our Platform (Recommended)

**The easiest way to use Reverse Engineering Lab:**

🌐 **[cml-relab.org](https://cml-relab.org)** - No installation required, just register and start collecting data.

📱 **Mobile App** - Coming soon

______________________________________________________________________

## Self-Hosting

Only needed for: custom development, institutional deployment, offline usage, or evaluation.

- 🐳 **[Docker Setup](#docker-setup)** - Quick testing and evaluation
- 💻 **[Local Development](#local-development)** - Contributing code and customization
- 🏢 **[Production Deployment](#production-deployment)** - Institutional hosting

### Docker Setup

**Prerequisites**:

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)

**Steps**:

1. **Clone the Repository**

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab/backend
   ```

1. **Configure Environment**

   ```bash
   cd backend
   cp .env.example .env
   ```

   Set up the necessary values in `.env` (marked with 🔀).

1. **Build and Run Containers**

   Start the application using Docker Compose:

   ```bash
   docker compose -p cml_relab up --build
   ```

1. **Access Your Local Instance**

   - Platform: <http://127.0.0.1:8010>
   - Interactive API Documentation: <http://127.0.0.1:8011/swagger/full>
   - Documentation: <http://127.0.0.1:8012>

   > 💡 **Note**: Ports **8010** through **8012** are used to avoid conflicts with other local services.

   Log in with the superuser credentials from your .env file to explore the platform.

______________________________________________________________________

### Local Development

**Prerequisites**:

- [uv](https://docs.astral.sh/uv/getting-started/installation) (Python package manager)
- [PostgreSQL](https://www.postgresql.org/download/) installed and running

#### Backend Setup

1. **Install Dependencies**

   Navigate to the backend directory:

   ```bash
   cd backend
   ```

   Install dependencies using uv:

   ```bash
   uv sync --no-dev
   ```

1. **Configure Environment**

   Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   Configure the necessary values in `.env` (marked with 🔀).

   > 💡 Note: Make sure to create the PostgreSQL database and user as specified in your `.env` file.

1. **Run Setup Script**
   The [`local_setup.sh`](backend/local_setup.sh) script creates the database tables, runs the migrations, and sets up initial test data.

   **For Linux/macOS**: `./local_setup.sh`

   **For Windows**: It is recommended to use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) or a Linux VM for development.

1. **Start the Application**

   Run the FastAPI server:

   ```bash
   uv run fastapi run app/main.py
   ```

   The API is now available at <http://127.0.0.1:8000>.

   You can log in with the superuser details specified in the `.env` file. This gives you access to:

   - Interactive API documentation at <http://127.0.0.1:8000/swagger/full>
   - Admin panel for database management at <http://127.0.0.1:8000/dashboard>

#### Documentation Setup

You can use docker to run the MkDocs documentation server for the Reverse Engineering Lab platform.

```bash
docker compose up mkdocs
```

The documentation is now available at <http://127.0.0.1:8012> with live reload.

#### Frontend Setup

<!--- TODO: Document Expo dev setup --->

#### Raspberry Pi Camera Setup (Optional)

If you want to use the Raspberry Pi Camera module with the platform, follow these steps on a Raspberry Pi device. For more information, see the [README](rpi_cam/README.md) in the `rpi_cam` directory.

1. **Navigate to the rpi_cam directory**

   ```bash
   cd rpi_cam
   ```

1. **Configure Environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` to set:

   - Base URL for the Camera API
   - Allowed CORS origins (including your main API)
   - Authorized API keys

1. **Run Setup Script**

   ```bash
   ./setup.sh
   ```

1. **Start the Camera API**

   ```bash
   uv run fastapi run app/main.py --port 8018
   ```

1. **Register the Camera**
   Access the main platform's `plugins/rpi-cam/cameras` endpoint to register your camera.

______________________________________________________________________

## Production Deployment

**Perfect for**: Research institutions, universities, or organizations deploying for multiple users.

To publicly host the Reverse Engineering Lab platform using Cloudflare and Docker, follow these steps:

1. **Configure Backend Environment**

   In the [`backend`](backend) directory, copy the example environment file:

   ```bash
   cd backend
   cp .env.example .env
   ```

   Set up the necessary values in `.env` (marked with 🔀).

1. **Configure Cloudflare Tunnel**
   Ensure you have set up a domain and [remotely managed tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/cloudflared-parameters/) with Cloudflare.

   Set the `TUNNEL_TOKEN` in your root directory [`.env`](.env) file.

1. **Build and Run Containers**

   To deploy, run:

   ```bash
   docker compose -p cml_relab -f compose.yml -f compose.prod.yml up --build -d
   ```

   The application will be available at your configured domain through Cloudflare.

1. **Manage Containers**
   To monitor logs, run:

   ```bash
   docker compose -p cml_relab logs -f
   ```

   To stop the application, run:

   ```bash
   docker compose -p cml_relab down
   ```

______________________________________________________________________

## Need Help?

- 📖 Documentation: [docs.cml-relab.org](https://docs.cml-relab.org)
- 📧 Contact: <info@cml-relab.org>
