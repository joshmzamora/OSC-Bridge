let touch = [0, 0, 0]; //[x, y, radius]
let gravity = [0, 0, 0];
let miclevel = -30;

OSC.route("/*/touch.", (addr, vals) => {touch = vals;});
OSC.route("/*/touchradius.", (addr, vals) => {touch[2] = vals;});
OSC.route("/*/gravity", (addr, vals) => {gravity = vals;});
OSC.route("/*/miclevel", (addr, vals) => {miclevel = vals[1];});

function setup() {
  createCanvas(400, 400);
}

function draw() {
  background(220); 
  push();
  translate(    
    map(touch[0], -1, 1, 0, width),
    map(touch[1], -1, 1, 0, height)
  );
  rotate(map(gravity[0], -1, 1, 0, PI));
  fill(map(miclevel, -60, 0, 255, 0));
  ellipse(0, 0, touch[2], touch[2]/2);
  pop();
}