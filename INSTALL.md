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

🌐 **[app.cml-relab.org](https://app.cml-relab.org)** - No installation required, just register and start collecting data.

📱 **Mobile App** - Coming soon

> 💡 **Note**: For a high-level overview of the project and access to the live platform, please see the [README.md](README.md).

______________________________________________________________________

## Self-Hosting

Only needed for: custom development, institutional deployment, offline usage, or evaluation.

- 🐳 **[Docker Setup](#docker-setup)** - Quick testing and evaluation
- 🏢 **[Production Deployment](#production-deployment)** - Institutional hosting

> 💡Note: For contributing code or setting up a development environment, see [CONTRIBUTING.md](CONTRIBUTING.md).

### Docker Setup

**Prerequisites**:

- [Docker Desktop](https://docs.docker.com/get-started/get-docker/)
- [just](https://just.systems/man/en/) (optional, but recommended — simplifies commands)

**Steps**:

1. **Clone the Repository**

   ```bash
   git clone https://github.com/CMLPlatform/relab
   cd relab
   ```

1. **Install Local Tooling** (recommended if you plan to modify code as well)

   ```bash
   just setup
   ```

   This also installs the pre-commit hooks that keep repo policy checks and lockfiles in sync locally.

1. **Configure Environment**

   ```bash
   cp backend/.env.dev.example backend/.env.dev
   ```

   Set up the necessary values in `backend/.env.dev` (marked with 🔀).

1. **Seed the Database and Start**

   First run (creates tables and seeds initial data):

   ```bash
   just dev-migrate          # or: docker compose --profile migrations up backend-migrations
   ```

   Then start the application:

   ```bash
   just dev-up               # or: docker compose up
   ```

1. **Access Your Local Instance**

   - Platform: <http://127.0.0.1:8010>
   - API Documentation: <http://127.0.0.1:8011>
   - Documentation: <http://127.0.0.1:8012>
   - App: <http://127.0.0.1:8013>

   Log in with the superuser credentials from your `backend/.env.dev` file to explore the platform.

1. **Run Local Verification** (optional, but recommended before changing configuration)

   ```bash
   just check
   just test
   ```

______________________________________________________________________

## Production Deployment

**Perfect for**: Research institutions, universities, or organizations deploying for multiple users.

To host the Reverse Engineering Lab platform using Cloudflare and Docker, follow these steps:

1. **Configure Cloudflare Tunnel**

   - Ensure you have set up a domain and [remotely managed tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/cloudflared-parameters/) with Cloudflare.

   - Configure the tunnel to forward traffic directly from the docker services:

     - `frontend-app:8081`
     - `frontend-web:8081`
     - `backend:8000`
     - `docs:8000`

   - Set the `TUNNEL_TOKEN` in your root directory [`.env`](.env) file.

1. **Configure Backend Environment**

   In the [`backend`](backend) directory, copy the example environment file:

   ```bash
   cp backend/.env.prod.example backend/.env.prod
   ```

   Set up the necessary values in `backend/.env.prod` (marked with 🔀).

1. **Build and Run Containers**

   ```bash
   just prod-up              # or: docker compose -p relab_prod -f compose.yml -f compose.prod.yml up -d
   ```

   The application will be available at your configured domain.

1. **Seed the Database**

   If this is your first launch or after schema changes, run the migrations:

   ```bash
   just prod-migrate         # or: docker compose -p relab_prod -f compose.yml -f compose.prod.yml --profile migrations up backend-migrations
   ```

1. **Enable Backups (optional, but recommended):**
   You can automate backups of user uploads and the database on the host machine.

   - Set `BACKUP_DIR` in your root `.env` file.

   - Run the backups profile:

     ```bash
     just prod-backups-up    # or: docker compose -p relab_prod -f compose.yml -f compose.prod.yml --profile backups up -d
     ```

1. **Manage Containers**

   ```bash
   just prod-logs            # or: docker compose -p relab_prod -f compose.yml -f compose.prod.yml logs -f
   just prod-down            # or: docker compose -p relab_prod -f compose.yml -f compose.prod.yml down
   ```

______________________________________________________________________

## Raspberry Pi Camera Plugin

If you want to use a Raspberry Pi Camera for image and video capture, see the [Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

______________________________________________________________________

## Need Help?

- 📖 Documentation: [docs.cml-relab.org](https://docs.cml-relab.org)
- 📧 Contact: <relab@cml.leidenuniv.nl>
