# Palm Cove Table Tennis

Palm Cove Table Tennis is the built-in motion-controlled game for OSC Bridge. It is an original clean-room implementation with original code, procedural artwork, synthesized sound, original opponents, and an original seaside-resort setting. It does not include or derive from Nintendo code, characters, branding, music, sound effects, artwork, UI, dialogue, stages, or other protected assets.

## Modes

### Solo Rally

Play against one of four original CPU opponents:

- **Marina** — friendly all-rounder.
- **Theo** — quick counter-hitter.
- **Noa** — spin and placement specialist.
- **Vale** — aggressive resort champion.

CPU difficulty is independently adjustable from level 1 through level 5. Difficulty changes reaction time, movement speed, timing error, placement accuracy, spin skill, power, and miss probability.

### Two Players

Connect two phones to the same OSC Bridge session. The first connected phone controls Player 1 and the second controls Player 2. Each player has a separate handedness setting and calibration profile. Player 2 motion can be mirrored so both people can stand comfortably in front of the same display.

Keyboard fallback remains available: Player 1 uses WASD with F/G to swing; Player 2 uses the arrow keys with J/K to swing.

## Motion controls

The game uses several phone signals together:

- Orientation positions the racket and controls its face angle.
- Rotation rate identifies swing direction, speed, and forehand/backhand motion.
- Acceleration helps reject small wrist jitter and identify deliberate swings.
- Screen orientation rotates sensor axes correctly when the phone is held in portrait or landscape.
- Touch input directly positions the racket as a fallback.
- A serves or performs an accessible manual swing; B pauses.

The phone controller defaults to 60 Hz for responsive play. A 30 Hz battery-saving option remains available.

## Calibration

Each human player can run a three-step calibration:

1. Hold the phone in a comfortable ready position.
2. Make one natural forehand swing.
3. Make one natural backhand swing.

The game records neutral orientation and learns the dominant gyroscope direction for each swing. Smart defaults are available when a player wants to start immediately. Motion assist, sensitivity, smoothing, handedness, and Player 2 mirroring can be adjusted at any time.

## Gameplay and physics

The ball simulation includes gravity, aerodynamic drag, Magnus-force spin curvature, table restitution, surface friction, net contact, bounce rules, legal serving, net lets, shot placement, topspin, backspin, sidespin, and timing-sensitive paddle contact.

Matches follow table-tennis-style rally scoring. Standard matches are first to 11, win by two, with service alternating every two points and every point at deuce. Quick and championship presets are also included.

## Fallback and accessibility controls

- Mouse movement positions Player 1's racket.
- Left click or F performs a forehand.
- Right click or G performs a backhand.
- WASD positions Player 1.
- Arrow keys position Player 2.
- J/K perform Player 2 forehand/backhand swings.
- Space serves.
- P or Escape pauses.
- Comfort assist expands the contact and timing window.
- Reduced-motion and high-contrast ball-trail settings are available.

## Verification

The implementation includes:

- Unit tests for orientation mapping, landscape-axis rotation, filters, swing classification, ball physics, paddle contact, serve rules, scoring, CPU planning, and deterministic rally simulation.
- Static integration tests that verify required UI surfaces, local-only assets, runtime element IDs, and the absence of protected-brand references.
- An Electron renderer end-to-end smoke test that boots the actual game page with the production preload, injects a controller, starts a match, performs a hit, advances the simulation, and checks for finite ball state and a valid canvas.
- The existing packaged-application smoke build on Linux.

Real-device testing with the target phones and network is still required before calling any motion-control release fully field-validated.
