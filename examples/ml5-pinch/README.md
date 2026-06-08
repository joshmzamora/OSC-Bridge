# ML5.js Pinch
- Tested w/ OSC Bridge app on Windows 11 & Zig Sim free on iOS

## Usage

- Ensure computer has internet access & no other applications are using the webcam
- Start OSC bridge app
- Pinch the on-screen slider to move it
- Sends OSC messages with ```/slider``` address when slider is moved
- (optional) edit line 53 of sketch.js (```OSC.send(`/slider`, pinch_location[0]);```)
    - Add OSC destination IP address and port as optional 3rd and 4th arguments (default ```localhost``` port 4243)