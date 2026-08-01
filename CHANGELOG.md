# Changelog

## 2.1.0

- Added a complete phone-controlled ping-pong game.
- Added single-player AI with three difficulty levels.
- Added two-phone local multiplayer, touch controls, keyboard fallback, scoring, rally tracking, sound, and visual effects.
- Added tested reusable game logic for phone address parsing, tilt mapping, paddle physics, and win conditions.
- Added a Play Ping Pong entry point to the desktop dashboard.

## 2.0.0

- Added a built-in HTTPS phone controller with motion, touch, and buttons.
- Added QR pairing with a per-launch session token.
- Added guided iPhone certificate installation with persistent per-computer trust.
- Added phone-to-OSC mapping and configurable UDP forwarding.
- Added live desktop diagnostics and connected-phone status.
- Added streaming JSONL recording.
- Added wildcard and recursive route matching with unsubscribe support.
- Fixed compatibility with current array-shaped `node-osc` messages.
- Added safer Electron window behavior, input validation, and graceful shutdown.
- Improved phone reconnection and screen wake-lock recovery after Wi-Fi or visibility changes.
- Added automated tests, packaging validation, and cross-platform release builds.
