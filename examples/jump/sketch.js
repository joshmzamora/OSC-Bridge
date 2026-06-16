let x = 50;
let yOffset = 0;
let ySpeed = 0;

let accel = [];
let lastJump = 0;

const obstacles = [];
let nextObstacleTime = 3000;

const playerRadius = 30;

let score = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  background(200);
  strokeWeight(0);
  OSC.route("/accel", (vals) => accel = vals[1]);
}

//draw ellipse: position from touch position, rotation from orientation
function draw() {
  background(200);
  fill(0);
  rect(0, height - 50, width, 50);
  fill(0, 255, 0);
  ellipse(x, height - 50 - yOffset - playerRadius, playerRadius * 2, playerRadius * 2);
  fill(0);
  textSize(48);
  text(score, 10, 50);

  yOffset += ySpeed;

  if (accel > 1 && millis() - lastJump > 1000) {
    ySpeed = 10;
    lastJump = millis();
  }

  if (yOffset < 0) {
    yOffset = 0;
    ySpeed = 0;
  }
  if (yOffset > 0) ySpeed -= 0.3;

  if (millis() > nextObstacleTime) {
    obstacles.push(new Obstacle());
    const interval = max(2000, 4000 - millis() / 30) * random(0.75, 1.25);
    nextObstacleTime = millis() + interval;
  }

  for (const obstacle of obstacles) {
    if (obstacle.isCollided()) {
      noLoop();
      window.alert("Game over!");
      window.location.reload(); 
    }
    else if (obstacle.x < -obstacle.width) {
      score++;
      obstacles.splice(obstacles.indexOf(obstacle), 1);
    }
    obstacle.draw();
  }
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }

class Obstacle {

  x;
  width;
  height;
  speed;

  constructor() {
    this.x = width;
    this.width = random(20, 30) * Math.min(1 + millis() / 10000, 6);
    this.height = random(20, 50) * Math.min(1 + millis() / 10000, 6);
    this.speed = random(5, 10) + Math.min(millis() / 20000, 3);
  }

  draw() {
    fill(255, 0, 0);
    rect(this.x, height - 50, -this.width, -this.height);
    this.x -= this.speed;
  }

  isCollided() {
    const playerX = x;
    const playerY = height - 50 - yOffset - playerRadius;
    const obstacleLeft = this.x - this.width;
    const obstacleRight = this.x;
    const obstacleTop = height - 50 - this.height;
    return playerX + playerRadius > obstacleLeft &&
           playerX - playerRadius < obstacleRight &&
           playerY + playerRadius > obstacleTop;
  }
}