# Raspberry Pi Camera Setup

Set up automated image capture during data collection using a Raspberry Pi camera system.

## What You Need

**Hardware:**

- Raspberry Pi 5 (recommended) or Pi 4
- Raspberry Pi Camera Module 3 (recommended) or v2
- MicroSD card (8GB or larger)
- Power supply (wall adapter or power bank)
- Network connection (Ethernet or WiFi)
- Camera mount (tripod, clamp, or custom)

**Software Requirements:**

- Python 3.11+
- Raspberry Pi OS

## Quick Setup

### Step 1: Prepare Your Raspberry Pi

1. **Install Raspberry Pi OS**: Follow the installation guide on the [Raspberry Pi website](https://www.raspberrypi.com/documentation/computers/getting-started.html).
1. **Enable camera**: Run `sudo raspi-config`, go to Interface Options → Camera → Enable

### Step 2: Install Camera Software

1. **Get the code**: Clone the repository and navigate to the `rpi_cam` directory

   ```bash
   git clone github.com/CMLPlatform/relab
   cd relab/rpi_cam
   ```

1. **Run setup script**: Execute `./setup.sh` which automatically:

   - Verifies your environment configuration
   - Sets up audio streaming capabilities
   - Installs dependencies using uv
   - Creates Python virtual environment

### Step 3: Register Your Camera

TODO: Add link to main platform camera registration page

1. **Access registration**: Go to the main platform's camera registration page
1. **Provide details**:
   - Camera name and description
   - Camera API URL (where your Pi will run, e.g., `http://192.168.1.100:8018`)
   - Any additional auth headers (optional)
1. **Save API key**: Copy the generated API key - it's only shown once

### Step 4: Configure Your Camera

1. **Copy config file**: Use `cp .env.example .env` to create configuration
1. **Edit settings**:
   - **BASE_URL**: Your Pi's IP and port (e.g., `http://192.168.1.100:8018`)
   - **ALLOWED_CORS_ORIGINS**: Include main platform URL in quotes: `["http://127.0.0.1:8000", "https://cml-relab.org"]`
   - **AUTHORIZED_API_KEYS**: Add your API key in quotes: `["YOUR_API_KEY_HERE"]`

**Important**: Keep API keys secure and never commit them to version control.

### Step 5: Start Camera Service

1. **Launch API**: Run `uv run fastapi run app/main.py --port 8018`
1. **Test connection**: Visit `http://your-pi-ip:8018/docs` for API documentation
1. **Verify integration**: Check that your camera appears in the main platform

## Using Your Camera

### Local testing

1. **Live preview**: Access the camera feed at `http://your-pi-ip:8018/stream/watch`
1. **Capture images**: Use the `/capture` endpoint to take photos

### During Data Collection

1. **Start session** on the main platform
1. **Access camera**: TODO: Add link to main platform camera interface
1. **Position subject** in camera's field of view
1. **Capture images** via the platform interface

## Troubleshooting

**Camera not detected**:

- Verify camera module is properly connected
- Check that camera is enabled in raspi-config
- Restart the Pi if needed

**API won't start**:

- Check that port 8018 is available
- Verify all dependencies installed correctly
- Review error logs for specific issues

**Platform can't connect**:

- Confirm API key is correct in both places
- Check network connectivity between Pi and platform
- Verify CORS origins include platform URL
- Test API directly at `http://pi-ip:8018/docs`

**Poor image quality**:

- Clean camera lens
- Improve lighting conditions
- Check camera module connection
- Adjust camera settings through API

## Development Mode

For development and testing on the Raspberry Pi:

- **Install dev dependencies**: `uv sync`
- **Start dev server**: `uv run fastapi dev app/main.py`
- **Access dev docs**: Available at `http://127.0.0.1:8000/docs`

## Additional Resources

- [Raspberry Pi Camera Module Documentation](https://www.raspberrypi.com/documentation/accessories/camera.html)
- [Technical Architecture of Raspberry Pi Camera Plugin](../architecture/rpi-cam.md)
