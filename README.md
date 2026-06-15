# OSC Bridge App

__Docs in progress.__

A simple program that runs static HTML/JavaScript files as full-screen desktop applications and enables OSC communication for new networking possibilities.

Tested on Windows 11, functional on Mac but needs testing

## Installation

- Download and install latest [release](https://github.com/yonatanrozin/OSC-Bridge/releases)
  - Opening installed app may show security warning on Mac computers (first launch only). After showing warning, allow permission in "Privacy & Security" section of system preferences.

## Usage

- Modify files in ```<app_contents>/sketch``` 
  - To locate sketch folder easily, launch osc_bridge app and enter Ctrl-E
  - (optional) See API notes below for sending/receiving OSC messages from JavaScript
- Launch osc_bridge app
- Use ```ctrl-F``` / ```cmd-F``` to toggle fullscreen
- Use ```ctrl-R``` / ```cmd-R``` to refresh page
- Use ```ctrl-E``` / ```cmd-E``` to open sketch files folder
  - __Editing these files while app is running will refresh the sketch!__

## API

__This API is NOT available in the browser! It is only available within the OSC Bridge application context.__

### Sending OSC

To send OSC messages: ```OSC.send("<address>", <args>, "<IP_Addr>", <port>)```
- ```<address>``` - a valid OSC message address, i.e. ```"/mousePosition"```
- ```<args>``` - a string, number, boolean, or array of strings/numbers/bools
  - Boolean arguments are converted to integers (0 or 1)
- ```<IP_Addr>``` & ```<port>``` - destination IP address and port for the OSC message. Leave out for default: ```"localhost"``` port 4243

### Receiving OSC

App receives OSC messages on port __4242__.

Use ```OSC.route("<pattern>", <handler>)``` to create OSC message handlers
- ```<pattern>``` - OSC address pattern
  - Use ```*``` as a single-level wildcard (e.g. ```/*/temperature``` will match addresses ```/device1/temperature```, ```/anything/temperature```, etc.)
- ```<handler>``` - a callback function with up to 2 arguments: ```(vals, address)```
  - ```vals``` - either a single value or an array of values, depending on the number of OSC message arguments
  - ```address``` - the full OSC message address

See example sketches [here](https://github.com/yonatanrozin/OSC-Bridge/blob/main/examples) 

To try out an example sketch, copy the sketch files into the application sketch folder
- Launch app and enter Ctrl-E (or cmd-E) to open the application sketch folder.
- __Copy the example sketch files only - NOT the entire folder!__
