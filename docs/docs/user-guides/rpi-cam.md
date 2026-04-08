# RPI Camera Integration

This page covers the platform side only. For device installation and plugin deployment, see the [RPI Camera Plugin repository](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

## When It Is Worth Setting Up

- you want consistent, repeatable image capture across many products
- a workstation is used regularly for disassembly documentation
- remote triggering is more convenient than manual photo transfer
- a live preview while documenting is useful

## Connection Modes

There are two ways to connect a camera to the platform:

### WebSocket Relay (recommended)

The camera opens an outbound WebSocket connection to the backend. The backend relays commands through this tunnel, so the camera does not need a public IP, port forwarding, or a reverse proxy. This is the default for new cameras.

### Direct HTTP

The backend makes outbound HTTP requests to the camera's URL. This requires the camera to be reachable from the backend over the network (public IP, VPN, Cloudflare Tunnel, etc.).

## Platform Setup

### Option A: Automatic Pairing (WebSocket)

This is the quickest way to add a camera. No manual credential exchange is needed.

1. **Start the RPi in pairing mode.** When the RPi plugin boots without relay credentials but has `PAIRING_BACKEND_URL` set, it enters pairing mode and displays a 6-character code on its setup page (`/setup`).

1. **Add a camera in the app.** Go to Cameras > Add Camera. Select WebSocket mode (the default), then enter the pairing code shown on the RPi or scan the QR code.

1. **Wait for the connection.** The platform claims the code, creates the camera record, and sends credentials back to the RPi automatically. The camera should come online within seconds.

### Option B: Manual Registration

Use this when automatic pairing is not available.

1. **Add a camera in the app.** Go to Cameras > Add Camera. Choose the connection mode (WebSocket or HTTP).

   - **WebSocket:** The platform generates relay credentials. Copy the displayed `relay_credentials.json` content and save it on the RPi.
   - **HTTP:** Provide the camera's API URL (e.g., `http://your-pi-ip:8018`). Save the generated API key.

1. **Configure the Raspberry Pi.** Add the credentials to the RPi plugin:

   - **WebSocket:** Save the JSON to `relay_credentials.json` in the plugin directory, or set the individual `RELAY_*` environment variables.
   - **HTTP:** Add the API key to `AUTHORIZED_API_KEYS` in `.env`.

1. **Restart the RPi plugin** if it is already running.

### Verify the Registration

- Open the camera detail screen in the app and check the connection status.
- The status indicator should show "Online".
- Run a test capture before relying on the setup for real product documentation.

## Using Cameras During Documentation

1. Start from a known product or component record.
1. Trigger image capture or preview through the platform.
1. The backend proxies the request to the device (via WebSocket relay or HTTP).
1. The returned image or stream metadata is stored in RELab and linked to the record.

Camera management (inspecting, updating, removing registered cameras) is available through the app's Cameras section.

## Managing Cameras

From the camera detail screen you can:

- View the live preview and connection status.
- Edit the camera name and description.
- Regenerate the API key (the old key is invalidated immediately; you will need to update the RPi with the new credentials).
- Delete the camera.

The connection mode cannot be changed after registration. To switch modes, delete the camera and add it again.

## Practical Advice

- Test the full setup before documenting a real product.
- Use clear, descriptive camera names so the physical workstation is obvious at a glance.
- Keep device configuration notes somewhere outside the platform as well.
- The camera is a capture aid, not a replacement for good documentation practice.

## Troubleshooting (Platform Side)

### Camera shows as offline (WebSocket)

- Verify the Raspberry Pi is powered on and has internet access.
- Check that the RPi plugin is running and relay credentials are configured.
- Look at the RPi plugin logs for WebSocket connection errors.
- Confirm the API key on the RPi matches the one stored in the platform (regenerate if unsure).

### Camera shows as offline (HTTP)

- Verify the Raspberry Pi is powered on and reachable on the network.
- Check that the stored camera API URL is still correct.
- Confirm the platform and device are using matching API credentials.
- Test direct access to the device API from the network where the backend runs.
- Verify firewall or reverse-proxy rules allow backend-to-device traffic.

## Device Setup

For device installation, deployment, and hardware-specific details, see the external plugin documentation:

[RPI Camera Plugin Documentation](https://github.com/CMLPlatform/relab-rpi-cam-plugin)
