/*
Arduino OSC UDP receiver example
Yonatan Rozin

- Enter WiFi network name and password (case sensitive)
- Enter a port #
- Enter an OSC address
- (optional) - connect a servomotor to digital pin 4

- Upload sketch, open serial monitor
- Arduino will print its IP address when connected to the WiFi network
- Use this IP address and port to send OSC messages to this Arduino!
- Make sure the sending device is on the same WiFi network as this one.
*/

#include <WiFiNINA.h> //use <WiFi.h> or <WiFiNINA.h>, depending on your Arduino model
#include <OSCMessage.h>
#include <Servo.h>

const int servoPin = 4; //connect your servo's signal pin here

const char WIFI_SSID[] = ""; //WiFi network name
const char WIFI_PASS[] = ""; //WiFi network password

const int port = 4243; //choose a port # (2000+ recommended)

const char OSC_address[] = "/slider"; //choose an OSC address

WiFiUDP Udp;
Servo servo;

float val = 0;

const int SERVO_INTERVAL_MS = 20;
unsigned long lastServoWrite = 0;

void setup() {
  Serial.begin(9600);
  servo.attach(servoPin);
  pinMode(LED_BUILTIN, OUTPUT);
  digitalWrite(LED_BUILTIN, LOW);
  
  delay(4000);

  while (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.print(".");
    delay(500);
  }
  Serial.print("\nIP: ");
  Serial.println(WiFi.localIP());

  Udp.begin(port);
  digitalWrite(LED_BUILTIN, HIGH);
}

void loop() {
  int size = Udp.parsePacket();

  if (size > 0) {
    byte buffer[256];
    int len = Udp.read(buffer, min(size, 256));

    OSCMessage msg;
    for (int i = 0; i < len; i++) msg.fill(buffer[i]);

    if (!msg.hasError()) {
      if (msg.fullMatch(OSC_address)) {
        val = msg.getFloat(0) * 180;
      }
    } else {
      Serial.print("OSC error: ");
      Serial.println(msg.getError());
    }
  }

  unsigned long now = millis();
  if (now - lastServoWrite >= SERVO_INTERVAL_MS) {
    servo.write(val);
    lastServoWrite = now;
  }
}