# OSC Bridge App

__Docs in progress.__

A simple app that forwards incoming OSC messages to a static webpage.

Windows 11 tested, MacOS coming soon.

## Installation

- Download and install latest [release](https://github.com/yonatanrozin/OSC-Bridge/releases)

## Usage

- Add static files to ```<app_contents>/sketch```
  - See API notes below for routing incoming OSC messages in JavaScript
- Launch osc_bridge app
- Receive OSC messages on local port 4242
- Use ```ctrl-F``` / ```cmd-F``` to toggle fullscreen

## API

Use ```OSC.route(<pattern>, <handler>)``` to create OSC message handlers
- ```<pattern>``` - OSC address pattern
  - Use ```*``` as a single-level wildcard
    - e.g. ```/*/temperature``` will match addresses ```/device1/temperature```, ```/anything/temperature```, etc.
- ```<handler>``` - a callback function with up to 2 arguments: ```(vals, address)```
  - ```vals``` - either a single value or an array of values, depending on the number of OSC message arguments
  - ```address``` - the full OSC message address
   
See example at [sketch.js](https://github.com/yonatanrozin/OSC-Bridge/blob/main/sketch/sketch.js) 