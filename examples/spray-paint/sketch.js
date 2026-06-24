let compass = 0;
let compassOffset = 0;
let angle = 0;

let position = [0, 0];
let prevPosition = [0, 0];

let radius = 16;
let touch = -1;

let paintBuffer;
let colorButtons;
let saveButton;
let lastSave = 0;

let chosenColor;

function setup() {
  rectMode(CENTER);
  frameRate(120);

  colorButtons = [
    new ColorButton(100, 100, [255, 255, 255]),
    new ColorButton(200, 100, [255, 0, 0]),
    new ColorButton(300, 100, [0, 255, 0]),
    new ColorButton(400, 100, [0, 0, 255]),
    new ColorButton(500, 100, [255, 255, 0]),
    new ColorButton(600, 100, [255, 0, 255]),
    new ColorButton(700, 100, [0, 255, 255]),
  ];
  saveButton = new SaveButton(800, 100);
  chosenColor = colorButtons[0];

  createCanvas(windowWidth, windowHeight);
  background(0);

  paintBuffer = createGraphics(windowWidth, windowHeight);
  paintBuffer.strokeWeight(5);
  paintBuffer.stroke(255, 255, 255, 20);
  OSC.route("/compass", (vals) => compass = vals[0]);
  OSC.route("/touch02", (y) => {
    if (y[0] > 0.75) {
      chosenColor = colorButtons.find(button => button.isHovered());
      if (chosenColor) paintBuffer.stroke(...chosenColor.color, 30);
      else if (saveButton.isHovered()) {
        if (millis() - lastSave < 3000) return;
        paintBuffer.save("painting.png");
        lastSave = millis();
      }
      else compassOffset = compass
    }
    else touch = millis();
  });
  OSC.route("/touchradius0", (vals) => {
    const newRadius = Math.pow(vals[0] * .5, 1.2);
    radius = (radius ?? newRadius) * .90 + newRadius * .1;
    paintBuffer.strokeWeight(radius);
  });
  OSC.route("/gravity", (vals) => angle = vals[1]);
  OSC.route("/accel", (vals) => {
    const shake = Math.abs(vals[0]/3 + vals[1]/3 + vals[2]/3);
    if (shake > .8) paintBuffer.background(0, 0, 0, 15);
  });
}

function draw() {
  let compassValue = (compass - compassOffset) % 360; 
  let targetX = width/2 + compassValue * 15;
  let targetY = map(angle, -.5, .5, 0, height);
  const newPosition = [
    lerp(position[0], targetX, 0.2),
    lerp(position[1], targetY, 0.2)
  ];

  if (touch !== -1 && millis() - touch < 50) paintBuffer.line(prevPosition[0], prevPosition[1], newPosition[0], newPosition[1]);

  background(0);
  image(paintBuffer, 0, 0, width, height);
  fill(255);

  for (const button of colorButtons) {
    if (chosenColor === button) stroke(255);
    button.draw();
  }
  saveButton.draw();

  fill(255);
  circle(newPosition[0], newPosition[1], 5);

  strokeWeight(1);

  prevPosition = [...position];
  position = [...newPosition];
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  paintBuffer.resizeCanvas(windowWidth, windowHeight);
}

class ColorButton {
  x; y; color;
  radius = 80;

  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
  }

  draw() {
    fill(this.color);
    stroke(150);
    strokeWeight(chosenColor === this ? 4 : 0);
    circle(this.x, this.y, this.isHovered() ? this.radius + 20 : this.radius);
  }

  isHovered() {
    const d = dist(...position, this.x, this.y);
    return d < this.radius / 2;
  }
}

class SaveButton extends ColorButton {
  constructor(x, y) {
    super(x, y, [255, 255, 255]);
  }

  draw() {
    fill(!this.isHovered() ? [255, 255, 255] : [150, 150, 150]);
    rectMode(CENTER);
    rect(this.x, this.y, this.radius, this.radius);
    textAlign(CENTER, CENTER);
    textSize(16);
    fill(0);
    text("Save", this.x, this.y);
  }

  isHovered() {
    return position[0] > this.x - this.radius / 2 && position[0] < this.x + this.radius / 2 &&
      position[1] > this.y - this.radius / 2 && position[1] < this.y + this.radius / 2;
  }
}