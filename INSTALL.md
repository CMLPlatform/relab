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

> **Note:**  
> For contributing code or setting up a development environment, see [CONTRIBUTING.md](CONTRIBUTING.md).

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

   Start the application using Docker Compose:

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
   docker compose -f compose.yml -f compose.prod.yml up --build -d
   ```

   The application will be available at your configured domain through Cloudflare.

1. **Manage Containers**
   To monitor logs, run:

   ```bash
   docker compose logs -f
   ```

   To stop the application, run:

   ```bash
   docker compose down
   ```

______________________________________________________________________

## Raspberry Pi Camera Plugin

If you want to use a Raspberry Pi Camera for image and video capture, see the [Raspberry Pi Camera Plugin](https://github.com/CMLPlatform/relab-rpi-cam-plugin).
______________________________________________________________________

## Need Help?

- 📖 Documentation: [docs.cml-relab.org](https://docs.cml-relab.org)
- 📧 Contact: <info@cml-relab.org>
