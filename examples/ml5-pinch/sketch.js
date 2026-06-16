/*
  Handpose + OSC example
  Built using the ml5.js handpose model: https://docs.ml5js.org/#/reference/handpose
*/

let handPose;
let video;
let hands = [];

let thumb_tip;
let index_finger_tip;

let slider;

function preload() {
  // Load the handPose model
  handPose = ml5.handPose();
}

function setup() {
  const canvas = createCanvas(640, 480);
  video = createCapture(VIDEO);
  video.size(640, 480);
  video.hide();
  handPose.detectStart(video, gotHands);
  slider = createSlider(0, 1, .5, 0);
  slider.position(0, canvas.elt.offsetTop + height/2);
  slider.size(width);
  slider.input((e) => OSC.send(`/slider`, slider.value()));
}

function draw() {
  image(video, 0, 0, width, height);

  for (const hand of hands) {
    const side = hand.handedness === 'Left' ? 'R' : 'L'; //swap L and R to undo webcam mirror effect

    const thumb_tip = hand.keypoints.find(point => point.name === 'thumb_tip');
    const index_finger_tip = hand.keypoints.find(point => point.name === 'index_finger_tip');
    const pinch_distance = Math.max(0,
      dist(thumb_tip.x, thumb_tip.y, index_finger_tip.x, index_finger_tip.y) - 15
    );
    const is_pinched = pinch_distance < 20;

    if (is_pinched) {
      const pinch_location = [ //calculate midpoint between fingers
        (thumb_tip.x + index_finger_tip.x) / 2 / width, 
        1 - (thumb_tip.y + index_finger_tip.y) / 2 / height
      ];
      //if pinch y is near slider: update slider value according to horizontal pinch location
      if (Math.abs(pinch_location[1] - .5) < .1) {
        slider.value(pinch_location[0]); 
        OSC.send(`/slider`, slider.value()); 
      }
    }

    strokeWeight(map(pinch_distance, 0, 200, 10, 1, true));
    if (!is_pinched) stroke(255, 0, 0); 
    else stroke(0, 255, 0);
    line(thumb_tip.x, thumb_tip.y, index_finger_tip.x, index_finger_tip.y);
  }
}

// Callback function for when handPose outputs data
function gotHands(results) {
  // save the output to the hands variable
  hands = results;
}
