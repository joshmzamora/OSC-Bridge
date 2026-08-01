# Automatic updates

OSC Bridge checks the public GitHub Releases feed automatically on installed Windows builds.

## Behavior

1. Ten seconds after launch, OSC Bridge checks the latest non-draft, non-prerelease GitHub release.
2. If a newer Windows NSIS installer exists, the app downloads it in the background to its private user-data update directory.
3. The download must match GitHub's advertised file size. When GitHub provides a SHA-256 digest, OSC Bridge verifies that too.
4. OSC Bridge asks whether to restart and install the update.
5. Choosing **Restart and install** closes the bridge cleanly, installs the new build silently over the existing per-user installation, removes the downloaded installer, and relaunches OSC Bridge.
6. Choosing **Later** keeps the verified installer and asks again the next time OSC Bridge starts.

The updater checks again every six hours while the app remains open. It never updates to draft releases or prereleases.

## Preserved data

Updates replace application files but preserve the user-data directory. This includes:

- OSC output settings
- the local iPhone certificate authority and server certificates
- pending controller configuration
- recordings stored in `Documents/OSC Bridge Recordings`

The NSIS configuration uses the same stable application ID and a per-user one-click installation, so a newer installer replaces the existing OSC Bridge installation instead of creating a second version.

## First updater-enabled release

Versions installed before automatic updates were added cannot update themselves retroactively. Install the first updater-enabled release manually once. Every later Windows release can then download and replace itself.

## Troubleshooting

- Automatic updates only run in packaged Windows builds, not `npm start` development sessions.
- Set `OSC_BRIDGE_DISABLE_UPDATES=1` before launching to disable update checks for testing.
- Update failures are nonfatal. OSC Bridge continues running and retries later.
- The updater uses the public GitHub API and does not require a GitHub account or token.
- macOS automatic replacement is not enabled because unsigned macOS applications cannot safely use the normal automatic-update path. Linux continues to use a manually downloaded AppImage.
