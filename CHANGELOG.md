# Changelog

## 2.3.0

- Added automatic update checks for installed Windows builds using the public GitHub Releases feed.
- Added verified background downloads with exact file-size checks and SHA-256 verification when GitHub publishes a digest.
- Added a Restart and install flow that silently replaces the existing per-user installation and relaunches OSC Bridge.
- Preserved OSC settings, recordings, and locally generated iPhone certificate data across updates.
- Added pending-update recovery, retry behavior, old-download cleanup, release filtering, safe installer-name validation, and update-disable support.
- Made the NSIS application identity and one-install replacement behavior explicit.
- Added unit tests and a real Windows acceptance test that installed v2.2.1, replaced it with v2.3.0 at the same path, and verified only one installed copy remained.

## 2.2.1

- Fixed the Palm Cove startup overlay remaining above a running match in packaged Windows builds.
- Replaced asynchronous document-write hydration with an explicit document head/body swap.
- Added a startup timeout with a visible error state instead of an indefinite loading spinner.
- Expanded the Electron end-to-end test to verify the loader, loading title, and duplicate document structure are removed.

## 2.2.0

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
