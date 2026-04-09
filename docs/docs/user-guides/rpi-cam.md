# RPI Camera Integration

This page covers the platform side only. For device installation and plugin deployment, see the [RPI Camera Plugin repository](https://github.com/CMLPlatform/relab-rpi-cam-plugin).

## When It Is Worth Setting Up

- you want consistent, repeatable image capture across many products
- a workstation is used regularly for disassembly documentation
- remote triggering is more convenient than manual photo transfer
- a live preview while documenting is useful

## How It Works

The camera connects to the platform via **WebSocket relay**. The Raspberry Pi opens an outbound WebSocket connection to the backend, which relays commands (capture, preview, stream) through the tunnel. No public IP, port forwarding, or reverse proxy is needed.

## Platform Setup

### Option A: Automatic Pairing (recommended)

This is the quickest way to add a camera. No manual credential exchange is needed.

1. **Start the RPi in pairing mode.** When the RPi plugin boots without relay credentials but has `PAIRING_BACKEND_URL` set, it enters pairing mode and displays a 6-character code on its setup page (`/setup`). For headless setups, the same code is also printed in a boxed `PAIRING READY` banner, so you can read it over SSH, `docker compose logs`, or `journalctl`.

1. **Add a camera in the app.** Go to Cameras > Add Camera. Enter the pairing code shown on the RPi.

1. **Wait for the connection.** The platform claims the code, creates the camera record, and sends credentials back to the RPi automatically. The camera should come online within seconds.

### Option B: Manual Registration

Use this when automatic pairing is not available.

1. **Add a camera in the app.** Go to Cameras > Add Camera > Manual setup. The platform generates relay credentials.

1. **Copy credentials to the Raspberry Pi.** Save the displayed JSON to `~/.config/relab/relay_credentials.json` on the Pi, or set the individual `RELAY_*` environment variables.

1. **Restart the RPi plugin** if it is already running.

### Verify the Registration

- Open the camera detail screen in the app and check the connection status.
- The status indicator should show "Online".
- Run a test capture before relying on the setup for real product documentation.

## Using Cameras During Documentation

1. Start from a known product or component record.
1. Trigger image capture or preview through the platform.
1. The backend relays the request to the device via the WebSocket tunnel.
1. The returned image metadata is stored in RELab and linked to the record.

Camera management (inspecting, updating, removing registered cameras) is available through the app's Cameras section.

## Managing Cameras

From the camera detail screen you can:

- View the live preview (snapshot polling) and connection status.
- Edit the camera name and description.
- Regenerate the API key (the old key is invalidated immediately; the Pi will automatically reconnect with the new key).
- Delete the camera.

## Practical Advice

- Test the full setup before documenting a real product.
- Use clear, descriptive camera names so the physical workstation is obvious at a glance.
- Keep device configuration notes somewhere outside the platform as well.
- The camera is a capture aid, not a replacement for good documentation practice.

## Troubleshooting

### Camera shows as offline

- Verify the Raspberry Pi is powered on and has internet access.
- Check that the RPi plugin is running and relay credentials are configured.
- Look at the RPi plugin logs for WebSocket connection errors.
- Confirm the API key on the RPi matches the one stored in the platform (regenerate if unsure).

### Pairing or relay gets HTTP 403 behind Cloudflare

- If the Raspberry Pi logs show `403` for `/plugins/rpi-cam/pairing/register`, `/plugins/rpi-cam/pairing/poll`, or `/plugins/rpi-cam/ws/connect`, the request may be blocked by Cloudflare before it reaches the backend.
- Add a Cloudflare bypass rule for both `api-test.cml-relab.org` and `api.cml-relab.org` that covers the machine-facing RPi camera endpoints:

```text
(
  http.host in {"api-test.cml-relab.org" "api.cml-relab.org"}
  and starts_with(http.request.uri.path, "/plugins/rpi-cam/pairing/")
)
or
(
  http.host in {"api-test.cml-relab.org" "api.cml-relab.org"}
  and http.request.uri.path eq "/plugins/rpi-cam/ws/connect"
)
```

- Set the rule action to skip or bypass the Cloudflare feature issuing the challenge.
- Verified on April 9, 2026: `api-test.cml-relab.org` returned `cf-mitigated: challenge` on both `/plugins/rpi-cam/pairing/register` and `/plugins/rpi-cam/ws/connect`.

## Device Setup

For device installation, deployment, and hardware-specific details, see the external plugin documentation:

[RPI Camera Plugin Documentation](https://github.com/CMLPlatform/relab-rpi-cam-plugin)
