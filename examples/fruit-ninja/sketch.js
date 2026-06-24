let compass = 0;
let compassOffset = 0;
let angle = 0;

let position = [0, 0];
let prevPosition = [0, 0];
let history = [];

const fruits = [];
const fruitParts = [];
let fruitCount = 0;

let lastFruit = 0;
let nextFruit = 180;

let speed = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0);
  OSC.route("/compass", (vals) => compass = vals[0]);
  OSC.route("/touch*", () => compassOffset = compass);
  OSC.route("/gravity", (vals) => angle = vals[1]);
  rectMode(CORNERS);
}

function draw() {
  background(0,0,0);
  fill(255);
  let compassValue = (compass - compassOffset) % 360; 
  let targetX = width/2 + compassValue * 15;
  let targetY = map(angle, -.5, .5, 0, height);
  const newPosition = [
    lerp(position[0], targetX, 0.2),
    lerp(position[1], targetY, 0.2)
  ];
  speed = dist(...position, ...newPosition);
  history.push([...position, speed]);
  if (history.length > 10) history.shift();

  if (history.length > 1) {
    noFill();
    for (let i = 1; i < history.length; i++) {
      strokeWeight(history[i][2] * 0.3 + 2);
      stroke(map(i, 0, history.length - 1, 0, 255))
      line(history[i-1][0], history[i-1][1], history[i][0], history[i][1]);
    }
  }

  strokeWeight(1);

  if (history.length > 1) {
    const sliceBox = [
      history[history.length - 1][0], history[history.length - 1][1],
      history[history.length - 2][0], history[history.length - 2][1]
    ];
    for (const fruit of fruits) {
      fruit.draw();
      const sliceAngle = speed > 40 && fruit.isSliced(sliceBox);
      if (sliceAngle) {
        fruitParts.push(new FruitPart(fruit, true, sliceAngle));
        fruitParts.push(new FruitPart(fruit, false, sliceAngle));
      }
    }
  }

  for (const part of fruitParts) {
    part.draw();
  }

  if (frameCount - lastFruit >= nextFruit) {
    fruits.push(new Fruit());
    nextFruit = Math.round(random(60, 180) * map(fruitCount, 0, 20, 1, 0.5, true))
    lastFruit = frameCount;
  }

  for (let i = fruits.length - 1; i >= 0; i--) {
    const fruit = fruits[i];
    if (fruit.sliced || fruit.y >= height + 100) fruits.splice(i, 1);
  }
  position = [...newPosition];
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

class Fruit {
  y;
  x;

  xSpeed;
  ySpeed;

  radius;
  color = color(random(100, 255), random(100, 255), random(100, 255));

  sliced = false;

  constructor() {
    fruitCount++;
    this.y = height;
    this.x = random(0, width);
    const xBias = map(this.x, 0, width, 8, -8);
    this.xSpeed = xBias + random(-6, 6);
    this.ySpeed = random(10, 25);
    this.radius = random(100, 160);
  }

  draw() {
    fill(this.color);
    noStroke();
    circle(this.x, this.y, this.radius);
    this.x += this.xSpeed;
    this.y -= this.ySpeed;
    this.ySpeed -= .3;
  }

  //return angle of slice (if sliced)
  isSliced(sliceBox) {
    const [x1, y1, x2, y2] = sliceBox;
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return dist(x1, y1, this.x, this.y) < this.radius;
    const t = Math.max(0, Math.min(1, ((this.x - x1) * dx + (this.y - y1) * dy) / lenSq));
    this.sliced = dist(x1 + t * dx, y1 + t * dy, this.x, this.y) < this.radius;
    return this.sliced && (atan2(dy, dx) + TWO_PI) % TWO_PI; // return angle in radians
  }
}

class FruitPart {
  i;
  x; 
  y;
  xSpeed;
  ySpeed;
  angle;
  half;
  radius;
  color;

  constructor(fruit, half, angle) {
    this.x = fruit.x;
    this.y = fruit.y;
    this.xSpeed = fruit.xSpeed + (half ? 4 : -4);
    this.ySpeed = fruit.ySpeed > 0 ? fruit.ySpeed - 10 : fruit.ySpeed;
    this.angle = angle;
    this.half = half;
    this.radius = fruit.radius;
    this.color = fruit.color;
    if (this.y > height + 100) fruitParts.splice(fruitParts.indexOf(this), 1);
  }

  //draw semicircle
  draw() {
    fill(this.color);
    noStroke();
    push();
    translate(this.x, this.y);
    rotate(this.angle);
    arc(0, 0, this.radius, this.radius, this.half ? 0 : PI, this.half ? PI : TWO_PI);
    pop();
    this.x += this.xSpeed;
    this.y -= this.ySpeed;
    this.ySpeed -= .3;
  }
}