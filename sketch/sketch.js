//default values - will be updated at runtime with OSC arguments
let position;
let accel = [0,0,0];
let radius = 30;


function setup() {
  createCanvas(400, 400);
  background(200,200,200);
  fill(0);
  
  //route incoming OSC messages
  OSC.route("/touch0", (vals) => {
    circle(
      map(vals[0], -1, 1, 0, width), 
      map(vals[1], -1, 1, 0, height), 
      radius
    );
  }); 
  OSC.route("/touchradius0", (val) => {radius = val;}); //int (in mm?)
  OSC.route("/accel", (vals) => {accel = vals;}); //[x, y, z]
}

//draw ellipse: position from touch position, rotation from orientation
function draw() {
  const shake = (Math.abs(accel[0]) + Math.abs(accel[1]) + Math.abs(accel[2]))/3;
  if (shake > 1) background(200,200,200,20);
}