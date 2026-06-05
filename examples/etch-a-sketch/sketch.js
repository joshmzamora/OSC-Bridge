//default values - will be updated at runtime with OSC arguments
let position;
let accel = [0,0,0];
let radius = 30;

//route incoming OSC messages
//OSC addresses from Zig Sim: "/ZIGSIM/<device_uuid>/<sensor>", 
OSC.route("/ZIGSIM/*/touch0", (vals) => {position = vals;}); //[x, y] (-1 to 1)
OSC.route("/ZIGSIM/*/touchradius0", (val) => {radius = val;}); //int (in mm?)
OSC.route("/ZIGSIM/*/accel", (vals) => {accel = vals;}); //[x, y, z]

function setup() {
  createCanvas(400, 400);
  background(200,200,200);
  fill(0);
}

//draw ellipse: position from touch position, rotation from orientation
function draw() {
  if (position) circle(
    map(position[0], -1, 1, 0, width), 
    map(position[1], -1, 1, 0, height), 
    radius/3
  );
  const shake = (Math.abs(accel[0]) + Math.abs(accel[1]) + Math.abs(accel[2]))/3;
  if (shake > 1) background(200,200,200,20);
}

//when mouse moved on screen, send mouse position w/ OSC
function mouseMoved(e) {
  OSC.send("/mouse", [mouseX/width, 1 - mouseY/height], "10.23.11.7", 4242);
}

//when mouse pres
function mousePressed() {
  OSC.send("/mousePress", true);
}
function mouseReleased() {
  OSC.send("/mousePress", false);
}

function keyPressed() {
  OSC.send("/key", key);
}