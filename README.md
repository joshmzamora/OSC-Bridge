# OSC Bridge

OSC Bridge is a standalone Electron app that connects browser-based desktop sketches, phones, and Open Sound Control software on the same local network.

Version 2 adds a built-in phone controller, secure QR pairing, motion and touch streaming, configurable OSC forwarding, diagnostics, recording, and automated tests. A separate phone app such as Zig Sim is no longer required for the standard motion-controller workflow.

Original project by [Yonatan Rozin](https://yonatanrozin.com/project/osc-bridge/). Version 2 enhancements are maintained in this fork by Joshua Zamora.

## What it does

- Receives UDP OSC on port `4242` and forwards messages into the active desktop sketch.
- Hosts a local HTTPS phone controller on port `4244`.
- Streams phone orientation, acceleration, rotation rate, touch, and buttons.
- Converts phone events into consistent `/phone/<device-id>/...` OSC addresses.
- Optionally forwards phone messages to another OSC program at `127.0.0.1:4243` by default.
- Records all bridge traffic to newline-delimited JSON files.
- Reloads the desktop sketch automatically when its files change.

## Install and run from source

Requires Node.js 20 or newer.

```bash
npm install
npm start
```

The desktop dashboard opens full screen. Press `Esc` or `Ctrl/Cmd + F` to leave full screen.

## Connect a phone

1. Put the phone and computer on the same Wi-Fi network.
2. Start OSC Bridge.
3. Scan the QR code shown on the desktop dashboard.
4. Your browser may show a one-time warning because the bridge creates a local self-signed certificate. Continue to the local site.
5. Tap **Enable motion** on the phone and approve the sensor permission.

The pairing token changes every time the desktop app starts. A copied controller link from an older session will not reconnect.

### Firewall note

The operating system may ask whether OSC Bridge can accept local network connections. Allow private-network access so the phone can reach ports `4242` and `4244`.

## Phone OSC addresses

Each connected phone receives a short session ID. Messages use this prefix:

```text
/phone/<device-id>
```

| Address | Arguments |
| --- | --- |
| `/phone/<id>/orientation` | `alpha, beta, gamma, absolute, screenAngle` |
| `/phone/<id>/quaternion` | `x, y, z, w` |
| `/phone/<id>/accel` | `x, y, z` |
| `/phone/<id>/accel-gravity` | `x, y, z` |
| `/phone/<id>/rotation-rate` | `alpha, beta, gamma` |
| `/phone/<id>/touch` | `x, y, pressure, phase, pointerId` |
| `/phone/<id>/button/a` | `pressed, value` |
| `/phone/<id>/button/b` | `pressed, value` |
| `/phone/<id>/status` | `event, detail` |

Touch coordinates are normalized from `0` to `1`. The phone's **Calibrate** button zeroes the current orientation before future values are sent.

## Desktop sketch API

The API is injected only inside the Electron sketch window.

### Receive OSC

```js
const stop = OSC.route('/phone/*/touch', (args, address, metadata) => {
  const [x, y, pressure, phase] = args;
  console.log({ x, y, pressure, phase, address, metadata });
});

stop();
```

Patterns support:

- `*` to receive every OSC address.
- `*` inside a path to match one segment, such as `/phone/*/touch`.
- `**` to match any remaining path depth, such as `/phone/**`.

Use `OSC.once(pattern, callback)` for a one-time route.

### Send OSC

```js
await OSC.send('/slider', 0.5);
await OSC.send('/color', [255, 100, 40], '192.168.1.50', 7000);
```

When the destination is omitted, OSC Bridge uses the output host and port selected on the dashboard.

### Bridge controls

```js
const status = await Bridge.getStatus();
await Bridge.startRecording();
await Bridge.stopRecording();
await Bridge.openSketchFolder();
await Bridge.openRecordingsFolder();
```

Existing sketches using `window.localIP` and `window.openSketchDir()` remain supported.

## Recording

Select **Start recording** on the dashboard or press `Ctrl/Cmd + Shift + R`.

Recordings are saved as `.jsonl` files in:

```text
Documents/OSC Bridge Recordings
```

Each line contains a timestamp, OSC address, arguments, and source metadata. JSONL makes large recordings streamable without loading the entire file into memory.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + F` | Toggle full screen |
| `Esc` | Leave full screen |
| `Ctrl/Cmd + E` | Open the live sketch folder |
| `Ctrl/Cmd + Shift + R` | Start or stop recording |
| `Ctrl/Cmd + R` | Reload the sketch through Electron's standard shortcut |

## Use a custom sketch

Press `Ctrl/Cmd + E` and replace the files in the opened `sketch` folder. The window reloads when a file changes.

The examples in `examples/` can still receive ordinary UDP OSC from Zig Sim or other software. Version 2 also normalizes both the current array-shaped `node-osc` message format and the older object-shaped format.

## Ports and environment variables

| Purpose | Default | Override |
| --- | ---: | --- |
| UDP OSC input | `4242` | `OSC_BRIDGE_INPUT_PORT` |
| HTTPS phone controller | `4244` | `OSC_BRIDGE_CONTROLLER_PORT` |
| OSC output | `127.0.0.1:4243` | Desktop dashboard |

## Test and build

```bash
npm run check
npm test
npm run build
```

Installers are written to `dist/` by electron-builder.

## Protocol documentation

See [`docs/PROTOCOL.md`](docs/PROTOCOL.md) for the phone WebSocket payloads, validation behavior, and OSC mapping.

## License

Distributed under the MIT License. Preserve attribution to the original OSC Bridge project when publishing derivative work.
