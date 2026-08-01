# Changelog

## Unreleased

- Replaced the basic side-view Pong prototype with Palm Cove Table Tennis, a complete original clean-room motion-controlled table-tennis game.
- Added configurable solo play with four original opponents and five CPU difficulty levels.
- Added local two-player matches using two real phones with independent calibration, handedness, and optional Player 2 mirroring.
- Added 2.5D ball physics with gravity, drag, Magnus-force spin, table restitution, surface friction, net contact, legal serving, lets, alternating service, win-by-two scoring, and best-of match presets.
- Added responsive racket tracking, forehand/backhand swing recognition, timing, directional placement, topspin, backspin, sidespin, motion assistance, sensitivity, and smoothing controls.
- Added original Palm Cove resort visuals, procedural animation, particles, camera feedback, synthesized impact audio, expressive opponents, and instant rematches.
- Added mouse, keyboard, touch, and phone-button fallback controls plus reduced-motion and high-contrast options.
- Added clean-room source extraction, deterministic physics tests, source validation, and an Electron renderer end-to-end smoke test.
- Updated the phone controller for 60 Hz motion-racket tracking while retaining a 30 Hz battery-saving mode.

## 2.1.0

- Added the initial phone-controlled Pong prototype.
- Added single-player AI, two-phone local multiplayer, touch controls, keyboard fallback, scoring, rally tracking, sound, and visual effects.
- Added tested reusable game logic for phone address parsing, tilt mapping, paddle physics, and win conditions.
- Added a game entry point to the desktop dashboard.

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
