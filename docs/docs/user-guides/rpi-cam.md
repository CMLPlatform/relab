# RPI Camera Integration

Integrate Raspberry Pi cameras with the RELab platform for automated image capture during data collection.

## Overview

This section covers **platform-side setup and management** of RPI cameras. For device installation and configuration, see the [RPI Camera Plugin Documentation](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

## Platform Setup

### Step 1: Register Your Camera

<!-- TODO: Describe frontend UI once available -->

Post a request to the `/plugins/rpi-cam/cameras` endpoint with the following data:

- **Camera name**: Descriptive name (e.g., "Assembly Station A Camera")
- **Description**: Location and purpose details
- **Camera API URL**: Where your Pi runs (e.g., `http://<your-rpi-ip>:8018`)
- **Auth headers**: Additional authentication if needed (optional)

See the [API documentation](https://api.cml-relab.org/docs#/rpi-cam-management/register_user_camera_plugins_rpi_cam_cameras_post) for details on required fields.

> 💡 **Note**: Save the generated API key - it's only shown once.

### Step 2: Configure Raspberry Pi Camera

Configure the RPI camera plugin with the API key provided during registration. If you are self-hosting the platform, be sure to add the platform URL to the allowed origins of the Raspberry Pi plugin. This allows the platform to communicate with your camera.

### Step 3: Verify Camera Registration

<!-- TODO: Describe frontend UI once available -->

- Use the `/plugins/rpi-cam/cameras/include_status` endpoint to list registered cameras
- Check that your camera appears with correct details

## Using RPI Cameras

### During Data Collection

<!-- TODO: Describe frontend UI once available -->

### Camera Management

<!-- TODO: Describe frontend UI once available -->

## Troubleshooting (Platform Side)

**Camera shows as "Disconnected"**:

- Verify RPI device is powered on and connected to network
- Check API URL is correct and accessible from platform
- Confirm API key matches on both platform and device

**Platform can't connect to camera**:

- Test direct access to `http://<your-rpi-ip>:8018/docs`
- Verify firewall rules allow platform → RPI communication
- Check CORS configuration includes platform URL

## Device Setup

For device installation, configuration, and deployment:

📱 **[RPI Camera Plugin Documentation →](https://github.com/CMLPlatform/relab-rpi-cam-plugin)**
