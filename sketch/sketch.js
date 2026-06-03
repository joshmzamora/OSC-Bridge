let touch = [0, 0]; 
let radius = 50;
let gravity = [0, 0, 0];
let miclevel = -30;

OSC.route("/*/*/touch0", (vals) => {touch = vals;});
OSC.route("/*/*/touchradius0", (vals) => {radius = vals;});
OSC.route("/*/*/gravity", (vals) => {gravity = vals;});
OSC.route("/*/*/miclevel", (vals) => {miclevel = vals[1];});

function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(220,0,0); 
  push();
  translate(    
    map(touch[0], -1, 1, 0, width),
    map(touch[1], -1, 1, 0, height)
  );
  rotate(map(gravity[0], -1, 1, 0, PI));
  fill(map(miclevel, -60, 0, 255, 0));
  ellipse(0, 0, radius, radius/2);
  pop();
}