# OSC Bridge phone protocol

The phone controller connects to:

```text
wss://<computer-ip>:4244/ws?token=<session-token>
```

The token is embedded in the QR URL and regenerated on every desktop launch. Messages larger than 64 KiB and connections with an invalid token are rejected.

## Server hello

```json
{
  "type": "hello",
  "deviceId": "a1b2c3d4",
  "serverTime": 1785552000000,
  "oscInputPort": 4242
}
```

## Identify

```json
{
  "type": "identify",
  "name": "Joshua's iPhone"
}
```

Names are trimmed and limited to 40 characters.

## Orientation

```json
{
  "type": "orientation",
  "alpha": 12.3,
  "beta": -4.1,
  "gamma": 8.8,
  "absolute": false,
  "screen": 0,
  "timestamp": 1785552000100
}
```

The bridge emits both Euler angles and a derived unit quaternion.

## Motion

```json
{
  "type": "motion",
  "acceleration": { "x": 0.1, "y": 0.2, "z": -0.1 },
  "accelerationIncludingGravity": { "x": 0.1, "y": 9.7, "z": -0.2 },
  "rotationRate": { "alpha": 1.2, "beta": 2.3, "gamma": 3.4 },
  "interval": 16.67,
  "timestamp": 1785552000116
}
```

Missing or non-finite numeric values are replaced with zero.

## Touch

```json
{
  "type": "touch",
  "phase": "move",
  "x": 0.5,
  "y": 0.25,
  "pressure": 1,
  "pointerId": 1
}
```

`x`, `y`, and `pressure` are clamped to `0..1`. Valid phases are `start`, `move`, `end`, and `cancel`.

## Button

```json
{
  "type": "button",
  "name": "a",
  "pressed": true,
  "value": 1
}
```

Button names are sanitized before becoming part of an OSC address.

## Status

```json
{
  "type": "status",
  "event": "calibrated",
  "detail": "Orientation zeroed"
}
```

## OSC forwarding

Validated phone messages are always dispatched to the active Electron sketch. When forwarding is enabled, the same messages are sent by UDP to the configured OSC output target.

See the root README for the complete address table.
