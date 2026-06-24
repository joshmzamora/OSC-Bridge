let speed = .2;
let position = 0;

let road;
let car_x;
let steering = 0;

function setup() {
  OSC.route("/gyro", (vals) => steering = vals[2]);
  OSC.route("/gravity", (vals) => {
    speed = map(vals[0], -1, 0, .2, 1.5);
    car_x = map(vals[1], -1, 1, width, 0);
  })
  noStroke();
  createCanvas(windowWidth, windowHeight);
  const road = new Array(100).fill().map((_, i) => noise((position + i/3) / 100).toFixed(2))
    .reverse();
  car_x = road[road.length - 1] * width;
}

function draw() {
  background("skyblue");
  fill("green");
  rectMode(CORNER);
  rect(0, height * 0.2, width, height * 0.8);

  const road = new Array(100).fill().map((_, i) => noise((position + i) / 200).toFixed(2))
    .reverse();

  rectMode(CENTER);
  fill(0);
  for (let i = 0; i < road.length; i++) {
    const y = map(i, 0, road.length - 1, height * 0.2, height);
    const x_center = road[i] * width;
    const w = Math.floor(map(i, 0, road.length - 1, width/20, width/3 * 2) / 10) * 10;
    rect(x_center, y, w, 10);
    if ((position - i) % 50 < 20) {
      fill("white");
      rect(x_center, y, w/10, 10);
      fill(0);  
    }
  }
  position += speed;

  fill("red");
  noStroke();
  push();
  translate(car_x, height - 50);
  rotate(steering * -0.1);
  rect(0, 0, width/30, width/15);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
