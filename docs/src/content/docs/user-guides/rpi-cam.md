---
title: RPi camera integration
description: Set up and use the Relab Raspberry Pi camera workflow from the platform side.
---

This page covers the platform side: pairing a camera, checking that it is online, and using it
during documentation. For device installation and plugin deployment, use the
[RPi camera plugin repository](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

## When it's worth setting up

- you want consistent, repeatable image capture across many products
- a workstation is used regularly for disassembly documentation
- remote triggering is more convenient than manual photo transfer
- a live preview while documenting is useful

## How it works

The Raspberry Pi opens an outbound WebSocket connection to the backend, which relays commands
(capture, preview, stream) through it. No public IP, port forwarding, or reverse proxy is needed.

For endpoints, see the [API reference overview](/api-reference/).

## Platform setup

### Option A: automatic pairing (recommended)

1. **Start the RPi in pairing mode.** The plugin enters pairing mode when it boots without relay
   credentials but with `PAIRING_BACKEND_URL` set. It shows a 6-character code on its setup page
   (`/setup`) and prints the same code in a boxed `PAIRING READY` banner, readable over SSH,
   `docker compose logs`, or `journalctl`.

1. **Add a camera in the app.** Go to Cameras > Add Camera. Enter the pairing code shown on the RPi.

1. **Wait for the connection.** The platform claims the code, creates the camera record, and sends
   credentials to the RPi. The camera should come online within seconds.

### Option B: manual registration

Use this when automatic pairing is unavailable.

1. **Add a camera in the app.** Go to Cameras > Add Camera > Manual setup. The platform generates
   relay credentials.
1. **Copy credentials to the Pi.** Save the displayed JSON to
   `~/.config/relab/relay_credentials.json`, or set the equivalent `RELAY_*` environment variables.
1. **Restart the plugin** if it was already running.

### Verify the registration

- Open the camera detail screen in the app and check the connection status.
- The status indicator should show "Online".
- Run a test capture before relying on the setup for real product documentation.

## Using cameras during documentation

1. Open the product or component record.
1. Trigger image capture or preview. The backend relays the request to the device.
1. Captured images are uploaded to Relab and linked to the record.

When your device is on the same network as a paired camera, the app can switch to direct local
access for faster preview and capture. No extra setup is needed; the relay stays the default.

## Managing cameras

From the camera detail screen you can:

- View the live preview (LL-HLS) and connection status.
- Edit the camera name and description.
- Delete the camera.

## Practical advice

- Test the full setup before documenting a real product.
- Name cameras after their physical workstation.
- Keep device configuration notes outside the platform as well.

## Troubleshooting

### Camera shows as offline

- Verify the Raspberry Pi is powered on and has internet access.
- Check that the RPi plugin is running and relay credentials are configured.
- Look at the RPi plugin logs for WebSocket connection errors.
- If the camera was intentionally unpaired or re-paired, confirm the current relay credentials are
  present on the Pi.

## Device setup

For device installation, deployment, and hardware details, see the
[RPi camera plugin documentation](https://github.com/CMLPlatform/relab-rpi-cam-plugin).
