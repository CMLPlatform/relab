---
title: RPI camera integration
description: Set up and use the RELab Raspberry Pi camera workflow from the platform side.
---

This page covers the platform side: pairing a camera, checking that it is online, and using it during documentation. For device installation and plugin deployment, use the [RPI camera plugin repository](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

## When it's worth setting up

- you want consistent, repeatable image capture across many products
- a workstation is used regularly for disassembly documentation
- remote triggering is more convenient than manual photo transfer
- a live preview while documenting is useful

## How it works

The camera connects to the platform via **WebSocket relay**. The Raspberry Pi opens an outbound WebSocket connection to the backend, which relays commands (capture, preview, stream) through the tunnel. No public IP, port forwarding, or reverse proxy is needed.

From the app's perspective, the backend remains the only public API surface.
The device/plugin uses a smaller private backend-facing contract for pairing,
relay, and direct upload flows.

For endpoint-level details, use the generated [RPi camera device API reference](/api/rpi-cam/).

## Platform setup

### Option A: automatic pairing (recommended)

This is the quickest way to add a camera. No manual credential exchange is needed.

1. **Start the RPi in pairing mode.** When the RPi plugin boots without relay credentials but has `PAIRING_BACKEND_URL` set, it enters pairing mode and displays a 6-character code on its setup page (`/setup`). For headless setups, the same code is also printed in a boxed `PAIRING READY` banner, so you can read it over SSH, `docker compose logs`, or `journalctl`.

1. **Add a camera in the app.** Go to Cameras > Add Camera. Enter the pairing code shown on the RPi.

1. **Wait for the connection.** The platform claims the code, creates the camera record, and sends credentials back to the RPi automatically. The camera should come online within seconds.

### Option B: manual registration

Use this when automatic pairing is unavailable.

1. **Add a camera in the app.** Go to Cameras > Add Camera > Manual setup. The platform generates relay credentials.
1. **Copy credentials to the Pi.** Save the displayed JSON to `~/.config/relab/relay_credentials.json`, or set the equivalent `RELAY_*` environment variables.
1. **Restart the plugin** if it was already running.

### Verify the registration

- Open the camera detail screen in the app and check the connection status.
- The status indicator should show "Online".
- Run a test capture before relying on the setup for real product documentation.

## Using cameras during documentation

1. Start from a known product or component record.
1. Trigger image capture or preview through the platform.
1. The backend relays the request to the device via the WebSocket tunnel.
1. Captured images are uploaded back to RELab and linked to the record automatically.

When the camera is already paired and the client is on the same LAN, the RELab
app can also switch into local direct mode for lower-latency preview and
capture. Relay remains the default path and the control-plane source of truth;
local mode is an optimization, not a separate registration flow.

Camera management (inspecting, updating, removing registered cameras) is available through the app's Cameras section.

## Managing cameras

From the camera detail screen you can:

- View the live preview (LL-HLS) and connection status.
- Edit the camera name and description.
- Delete the camera.

## Practical advice

- Test the full setup before documenting a real product.
- Use clear, descriptive camera names so the physical workstation is obvious at a glance.
- Keep device configuration notes somewhere outside the platform as well.
- The camera is a capture aid, not a replacement for good documentation practice.

## Troubleshooting

### Camera shows as offline

- Verify the Raspberry Pi is powered on and has internet access.
- Check that the RPi plugin is running and relay credentials are configured.
- Look at the RPi plugin logs for WebSocket connection errors.
- If the camera was intentionally unpaired or re-paired, confirm the current relay credentials are present on the Pi.

## Device setup

For device installation, deployment, and hardware-specific details, see the external plugin documentation:

[RPI camera plugin documentation](https://github.com/CMLPlatform/relab-rpi-cam-plugin)
