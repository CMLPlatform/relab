# Installation Guide

## Overview

- [Use Our Platform (Recommended)](#use-our-platform-recommended)
- [Self-Hosting](#self-hosting)
  - [Docker Setup](#docker-setup)
- [Production Deployment](#production-deployment)
- [Raspberry Pi Camera Plugin](#raspberry-pi-camera-plugin)
- [Need Help?](#need-help)

## Use Our Platform (Recommended)

**The easiest way to use Reverse Engineering Lab:**

🌐 **[cml-relab.org](https://cml-relab.org)** - No installation required, just register and start collecting data.

📱 **Mobile App** - Coming soon

______________________________________________________________________

## Self-Hosting

Only needed for: custom development, institutional deployment, offline usage, or evaluation.

- 🐳 **[Docker Setup](#docker-setup)** - Quick testing and evaluation
- 🏢 **[Production Deployment](#production-deployment)** - Institutional hosting

> 💡Note: For contributing code or setting up a development environment, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Docker Setup

**Prerequisites**:

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)

**Steps**:

1. **Clone the Repository**

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. **Configure Environment**

   ```bash
   cd backend
   cp .env.example .env
   ```

   Set up the necessary values in `.env` (marked with 🔀).

1. **Build and Run Containers**

   To seed the database for the first time, run the `migrations` profile:

   ```bash
   docker compose --profile migrations up
   ```

   After the initial setup, you can start the application as usual:

   ```bash
   docker compose up
   ```

1. **Access Your Local Instance**

   - Platform: <http://127.0.0.1:8010>
   - API Documentation: <http://127.0.0.1:8011>
   - Documentation: <http://127.0.0.1:8012>

   Log in with the superuser credentials from your `backend/.env` file to explore the platform.

______________________________________________________________________

## Production Deployment

**Perfect for**: Research institutions, universities, or organizations deploying for multiple users.

To host the Reverse Engineering Lab platform using Cloudflare and Docker, follow these steps:

1. **Configure Cloudflare Tunnel**

   - Ensure you have set up a domain and [remotely managed tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/cloudflared-parameters/) with Cloudflare.

   - Configure the tunnel to forward traffic directly from the docker services:

     - `frontend:8081`
     - `backend:8000`
     - `docs:8000`

   - Set the `TUNNEL_TOKEN` in your root directory [`.env`](.env) file.

1. **Configure Backend Environment**

   In the [`backend`](backend) directory, copy the example environment file:

   ```bash
   cd backend
   cp .env.example .env
   ```

   Set up the necessary values in `.env` (marked with 🔀).

1. **Build and Run Containers**

   To deploy, run:

   ```bash
   docker compose -f compose.yml -f compose.prod.yml up -d
   ```

   The application will be available at your configured domain.

1. **Seed the Database**

   If this is your first launch or after schema changes, run the migrations profile:

   ```bash
   docker compose -f compose.yml -f compose.prod.yml --profile migrations up
   ```

1. **Enable Backups (optional, but recommended):**
   You can automate backups of user uploads and the database on the host machine.

   - Set `BACKUP_DIR` in your root `.env` file.

   - Run the backups profile:

     ```bash
     docker compose -f compose.yml -f compose.prod.yml --profile backups up -d
     ```

1. **Manage Containers**
   To monitor logs, run:

   ```bash
   docker compose -p relab_prod logs -f
   ```

   To stop the application, run:

   ```bash
   docker compose -p relab_prod down
   ```

______________________________________________________________________

## Raspberry Pi Camera Plugin

If you want to use a Raspberry Pi Camera for image and video capture, see the [Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

______________________________________________________________________

## Need Help?

- 📖 Documentation: [docs.cml-relab.org](https://docs.cml-relab.org)
- 📧 Contact: <relab@cml.leidenuniv.nl>
