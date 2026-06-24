# OSC Bridge

__Currently in development - functionality NOT guaranteed!!__

A simple program that runs static HTML/JavaScript files as full-screen desktop applications and enables OSC communication for new networking possibilities.

![](https://yonatanrozin.com/wp-content/uploads/2026/06/IMG_8374-1-2.gif)

Read more about the project [here](https://yonatanrozin.com/project/osc-bridge/).

## Installation

- Tested and functional on Windows 11
- Functional on MacOS Sequoia - __Camera functionality currently NOT functional__

### Option 1 - download installer

Tested on Windows 11, functional on Mac but needs testing

- Download and install latest [release](https://github.com/yonatanrozin/OSC-Bridge/releases)
  - Opening installed app for the first time may show security warning on Mac computers. After receiving warning, allow permission in "Privacy & Security" section of computer system preferences.
 
### Option 2 - build from source

Requires [Node.js](https://nodejs.org/en/download) installed

- Clone this repository or download and extract .zip file
- In new terminal window, from repository folder:
  - ```npm install```
  - ```npm run build``` (takes 1-2 minutes)
  - Find newly-built installer in ```/dist``` folder
  - __This will replace your existing installer!__ See below for instructions on compiling multiple apps.

#### Building multiple apps

To build multiple apps (eg. to manage several concurrent projects), each app must be given a unique "product name":

- Before running ```npm run build``` in the instructions above, update your ```package.json``` file:
  - ```name```: set to something unique - must contain only lowercase numbers, letters and underscores
  - ```build.productName```: enter the name you'd like to use for the appliaction
  - ```build.appId```: set to something unique - convention is ```com.example.<name>```

## Usage

- Modify files in ```<app_contents>/sketch``` 
  - See API notes below for sending/receiving OSC messages within your sketch
- Launch osc_bridge app
- Use ```ctrl-E``` to open sketch files folder in file browser for easy location
  - __Editing these files while app is running will refresh the sketch!__
- Use ```ctrl-F``` to toggle fullscreen
- Use ```ctrl-R``` to refresh page
- Use ```ctrl-I``` to display computer's local IP address. Use this IP address and port 4242 when sending OSC messages to this sketch.

## API

__This API is only available within the OSC Bridge application context. It is NOT available within the web browser!__

- ```window.localIP``` - returns the computer's current local IP address. Send OSC messages to port 4242 with this IP address to interface with your sketch! 
  - You can also get your local IP address by running the app and entering ```ctrl-I```.

### Sending OSC

To send OSC messages from your sketch: ```OSC.send("<address>", <args>, "<IP_Addr>", <port>)```
- ```<address>``` - a valid OSC message address, i.e. ```"/mousePosition"```
- ```<args>``` - a string, number, boolean, or array of strings/numbers/bools
  - Boolean arguments are converted to integers (0 or 1)
- ```<IP_Addr>``` & ```<port>``` (optional) - destination IP address and port for the OSC message. Leave out for default ```"localhost"``` port 4243

### Receiving OSC

Sketch receives OSC messages on port __4242__.

Use ```OSC.route("<address>", <handler>)``` to create OSC message handlers
- ```<address>``` - OSC address to route
  - Use ```*``` as a single-level wildcard (e.g. ```/*/temperature``` will match addresses ```/device1/temperature```, ```/anything/temperature```, etc.)
- ```<handler>``` - a callback function with up to 2 arguments: ```(vals, address)```
  - ```vals``` - an array of arguments (numbers or strings)
  - ```address``` - the full OSC message address, in case needed

## Examples

__The Zig Sim mobile app (which most of the examples below use) was recently updated, including changes to the message OSC addresses. Be sure you are using the latest version of the Zig Sim app. The etch-a-sketch example is currently not working following the update. Fix coming soon! Rest of examples are functional.__

See sketch examples [here](https://github.com/yonatanrozin/OSC-Bridge/blob/main/examples)

To try out an example sketch, copy the sketch files into the application sketch folder
- Launch app and enter Ctrl-E (or cmd-E) to open the application sketch folder.
- __Copy the example sketch files only - NOT the entire folder!__

Example sketches are designed to work with free Zig Sim app on iOS and Android. _Zig Sim Pro uses different OSC addresses and will require adjustments to the sketch OSC routes._
- Ensure smartphone and computer are on the same WiFi network
- In Zig Sim "sensors" tab 
  - Enable required hardware data streams
  - See below for specific required sensors per example
- Zig Sim "settings" tab
  - Select ```other app``` destination, ```UDP``` protocol and ```OSC``` message format
  - Enter computer's local IP address and port 4242
  - Select frame rate (30 or 60 recommended)
- Enter "start" tab to begin - smartphone must stay on with the Zig Sim app open!

### OSC Log (default sketch)
- Displays all incoming OSC message addresses + arguments in an on-screen table
- See headers at top for computer's IP address. Use this IP address and port 4242 to send OSC messages to the sketch (from Zig Sim or other source)

### Etch-a-sketch
- Enable Zig Sim "2D Touch", "Accel" and "Touch Radius" sensors
- Touch phone screen to draw on the computer canvas. Press harder for thicker lines.
- Shake the phone to clear the canvas!

### Fruit Ninja
- Enable Zig Sim "2D Touch", "Gravity" and "Compass" sensors
- Point phone at computer/monitor and tap phone screen to calibrate pointer
- Slice fruit with the orientation sensor!

### Jump!
- Enable Zig Sim "accel" sensor
- Place phone in pocket with upper edge facing UP
- Jump to avoid the obstacles!

### Steering
- Enable Zig Sim "gyroscope" and "gravity" sensors
- Hold phone horizontally, top of phone facing left, with the touchscreen facing you
- Steer left and right to stay on the winding road!
- Tilt the phone towards/away from you to speed up and slow down.

### ML5 Pinch
- Does not use Zig Sim. Ensure computer has internet and camera access.
- Pinch the on-screen slider with a thumb and index finger to move it!
- Sketch will send OSC messages with the ```/slider``` address and slider position when moved.
  - Edit line 53 of sketch.js to set OSC destination (default is ```localhost``` port ```4243```)
    - i.e. ```OSC.send(`/slider`, pinch_location[0], "12,34,56,78", 7000);```

## License
This software is distributed under the MIT license. Feel free to use it but please do leave appropriate credit, especially in any online materials related to your project!
