# RPI Camera Integration

This page covers the platform side only. For device installation and plugin deployment, see the [RPI Camera Plugin repository](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

## When It Is Worth Setting Up

- you want consistent, repeatable image capture across many products
- a workstation is used regularly for disassembly documentation
- remote triggering is more convenient than manual photo transfer
- a live preview while documenting is useful

## Platform Setup

### Step 1: Register Your Camera

Register the camera through the `rpi-cam` plugin endpoints, typically `/plugins/rpi-cam/cameras`.

You will need to provide:

- camera name
- description
- camera API URL
- optional authentication headers for the device endpoint

See the [API documentation](https://api.cml-relab.org/docs#/rpi-cam-management/register_user_camera_plugins_rpi_cam_cameras_post) for required fields. Save the generated API key when it is issued, it is only shown once.

### Step 2: Configure the Raspberry Pi

Configure the Raspberry Pi plugin with the API key from the platform. If you self-host, make sure the backend can reach the device over the network.

### Step 3: Verify the Registration

- Query the camera list and status endpoints.
- Confirm the device appears with the expected URL and status.
- Run a test capture before relying on the setup for real product documentation.

## Using Cameras During Documentation

1. Start from a known product or component record.
1. Trigger image capture or preview through the platform.
1. The backend proxies the request to the device API.
1. The returned image or stream metadata is stored in RELab and linked to the record.

Camera management (inspecting, updating, removing registered cameras) is available through the plugin management endpoints.

## Practical Advice

- Test the full setup before documenting a real product.
- Use clear, descriptive camera names so the physical workstation is obvious at a glance.
- Keep device configuration notes somewhere outside the platform as well.
- The camera is a capture aid, not a replacement for good documentation practice.

## Troubleshooting (Platform Side)

### Camera shows as disconnected

- Verify the Raspberry Pi is powered on and reachable on the network.
- Check that the stored camera API URL is still correct.
- Confirm the platform and device are using matching API credentials.

### Platform cannot connect to the camera

- Test direct access to the device API from the network where the backend runs.
- Verify firewall or reverse-proxy rules allow backend-to-device traffic.
- Check the device-side plugin configuration as well as the RELab registration.

## Device Setup

For device installation, deployment, and hardware-specific details, see the external plugin documentation:

[RPI Camera Plugin Documentation](https://github.com/CMLPlatform/relab-rpi-cam-plugin)
