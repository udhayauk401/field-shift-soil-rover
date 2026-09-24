#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <ESP32Servo.h>

// =====================================================
// WIFI
// =====================================================

const char* ssid = "udhaya";
const char* password = "123456789";

WebServer server(80);

// =====================================================
// PINS
// =====================================================

// Sensors
#define SOIL_PIN   34
#define RAIN_PIN   35
#define DHT_PIN    19
#define MQ135_PIN  32

#define DHT_TYPE DHT11

// Ultrasonic
#define TRIG_PIN 5
#define ECHO_PIN 18

// L298N
#define IN1 26
#define IN2 27
#define ENA 25

#define IN3 14
#define IN4 12
#define ENB 33

// SG90 Servo
#define SERVO_PIN 13

// Buzzer
#define BUZZER_PIN 23

// LCD
#define SDA_PIN 21
#define SCL_PIN 22

// =====================================================
// OBJECTS
// =====================================================

DHT dht(DHT_PIN, DHT_TYPE);

LiquidCrystal_I2C lcd(0x27, 16, 2);

Servo probeServo;

// =====================================================
// VARIABLES
// =====================================================

int motorSpeed = 100;

bool roverRunning = false;
bool obstacleDetected = false;
bool collectionInProgress = false;

int soilValue = 0;
int rainValue = 0;
int mq135Value = 0;

float temperature = 0;
float humidity = 0;

long distanceCM = 999;

// Servo
const int SERVO_HOME = 0;
const int SERVO_COLLECT = 90;

// =====================================================
// MOTOR STOP
// =====================================================

void motorStop()
{
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);

  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);

  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

// =====================================================
// MOTOR FORWARD
// =====================================================

void motorForward()
{
  // Left side
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);

  // Right side
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);

  analogWrite(ENA, motorSpeed);
  analogWrite(ENB, motorSpeed);
}

// =====================================================
// HC-SR04
// =====================================================

long getDistance()
{
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0)
  {
    return 999;
  }

  return duration * 0.034 / 2;
}

// =====================================================
// SENSOR READ
// =====================================================

void readSensors()
{
  soilValue = analogRead(SOIL_PIN);

  rainValue = analogRead(RAIN_PIN);

  mq135Value = analogRead(MQ135_PIN);

  temperature = dht.readTemperature();

  humidity = dht.readHumidity();

  distanceCM = getDistance();
}

// =====================================================
// OBSTACLE CHECK
// =====================================================

void checkObstacle()
{
  distanceCM = getDistance();

  if (distanceCM > 0 && distanceCM < 20)
  {
    obstacleDetected = true;

    motorStop();

    digitalWrite(BUZZER_PIN, HIGH);

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print("OBSTACLE!");

    lcd.setCursor(0, 1);
    lcd.print(distanceCM);
    lcd.print(" cm");
  }
  else
  {
    obstacleDetected = false;

    digitalWrite(BUZZER_PIN, LOW);
  }
}

// =====================================================
// SERVO SOIL COLLECTION
// =====================================================

void servoCollect()
{
  collectionInProgress = true;

  // Stop rover
  roverRunning = false;
  motorStop();

  digitalWrite(BUZZER_PIN, LOW);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Collecting...");

  Serial.println();
  Serial.println("===== SOIL COLLECTION START =====");

  // ---------------------------------------------------
  // SERVO 0 -> 90
  // ---------------------------------------------------

  for (int angle = SERVO_HOME;
       angle <= SERVO_COLLECT;
       angle++)
  {
    probeServo.write(angle);
    delay(15);
  }

  Serial.println("Servo = 90");

  // Wait for soil mechanism
  delay(1000);

  // ---------------------------------------------------
  // READ SENSOR DATA
  // ---------------------------------------------------

  readSensors();

  Serial.print("Soil: ");
  Serial.println(soilValue);

  Serial.print("Rain: ");
  Serial.println(rainValue);

  Serial.print("Temperature: ");
  Serial.println(temperature);

  Serial.print("Humidity: ");
  Serial.println(humidity);

  Serial.print("MQ135: ");
  Serial.println(mq135Value);

  Serial.print("Distance: ");
  Serial.println(distanceCM);

  // ---------------------------------------------------
  // LCD
  // ---------------------------------------------------

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Soil:");
  lcd.print(soilValue);

  lcd.setCursor(0, 1);
  lcd.print("Temp:");

  if (isnan(temperature))
  {
    lcd.print("NA");
  }
  else
  {
    lcd.print(temperature);
  }

  // Keep servo at 90
  probeServo.write(SERVO_COLLECT);

  delay(3000);

  // ---------------------------------------------------
  // SERVO 90 -> 0
  // ---------------------------------------------------

  for (int angle = SERVO_COLLECT;
       angle >= SERVO_HOME;
       angle--)
  {
    probeServo.write(angle);
    delay(15);
  }

  Serial.println("Servo = 0");
  Serial.println("===== SOIL COLLECTION DONE =====");

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Collection Done");

  delay(1500);

  lcd.clear();
  lcd.print("Rover Ready");

  collectionInProgress = false;
}

// =====================================================
// ROOT WEB PAGE
// =====================================================

void handleRoot()
{
  readSensors();

  String html = "";

  html += "<!DOCTYPE html>";
  html += "<html>";
  html += "<head>";

  html += "<meta name='viewport' ";
  html += "content='width=device-width, initial-scale=1'>";

  html += "<title>Field Shift Rover</title>";

  html += "<style>";

  html += "body{";
  html += "font-family:Arial;";
  html += "text-align:center;";
  html += "background:#eeeeee;";
  html += "}";

  html += ".box{";
  html += "background:white;";
  html += "margin:10px;";
  html += "padding:15px;";
  html += "border-radius:12px;";
  html += "}";

  html += "button{";
  html += "font-size:18px;";
  html += "padding:14px 22px;";
  html += "margin:6px;";
  html += "border-radius:8px;";
  html += "}";

  html += "</style>";

  html += "</head>";
  html += "<body>";

  html += "<h1>Field Shift Rover</h1>";

  // =================================================
  // WIFI
  // =================================================

  html += "<div class='box'>";
  html += "<h2>Wi-Fi Status</h2>";

  if (WiFi.status() == WL_CONNECTED)
  {
    html += "<p>CONNECTED</p>";
    html += "<p>IP: ";
    html += WiFi.localIP().toString();
    html += "</p>";
  }
  else
  {
    html += "<p>NOT CONNECTED</p>";
  }

  html += "</div>";

  // =================================================
  // CAR CONTROL
  // =================================================

  html += "<div class='box'>";

  html += "<h2>Car Control</h2>";

  html += "<a href='/start'>";
  html += "<button>START</button>";
  html += "</a>";

  html += "<a href='/stop'>";
  html += "<button>STOP</button>";
  html += "</a>";

  html += "<h3>Speed</h3>";

  html += "<form action='/speed'>";

  html += "<input type='range' ";
  html += "min='0' max='255' ";
  html += "name='value' value='";
  html += motorSpeed;
  html += "'>";

  html += "<br><br>";

  html += "<input type='submit' value='SET SPEED'>";

  html += "</form>";

  html += "</div>";

  // =================================================
  // CRU SOIL COLLECTION
  // =================================================

  html += "<div class='box'>";

  html += "<h2>Soil Collection</h2>";

  html += "<p>Servo: 0° → 90° → 0°</p>";

  html += "<a href='/collect'>";
  html += "<button>CRU SOIL COLLECTOR</button>";
  html += "</a>";

  html += "</div>";

  // =================================================
  // SENSOR DATA
  // =================================================

  html += "<div class='box'>";

  html += "<h2>Sensor Data</h2>";

  html += "<p>Soil Moisture: ";
  html += soilValue;
  html += "</p>";

  html += "<p>Rain: ";
  html += rainValue;
  html += "</p>";

  html += "<p>Temperature: ";

  if (isnan(temperature))
  {
    html += "NA";
  }
  else
  {
    html += String(temperature);
    html += " C";
  }

  html += "</p>";

  html += "<p>Humidity: ";

  if (isnan(humidity))
  {
    html += "NA";
  }
  else
  {
    html += String(humidity);
    html += " %";
  }

  html += "</p>";

  html += "<p>MQ135: ";
  html += mq135Value;
  html += "</p>";

  html += "<p>Distance: ";
  html += distanceCM;
  html += " cm</p>";

  html += "</div>";

  // =================================================
  // STATUS
  // =================================================

  html += "<div class='box'>";

  html += "<h2>Status</h2>";

  if (collectionInProgress)
  {
    html += "<h3>SOIL COLLECTION</h3>";
  }
  else if (obstacleDetected)
  {
    html += "<h3>OBSTACLE DETECTED</h3>";
  }
  else if (roverRunning)
  {
    html += "<h3>ROVER RUNNING</h3>";
  }
  else
  {
    html += "<h3>ROVER STOPPED</h3>";
  }

  html += "</div>";

  html += "</body>";
  html += "</html>";

  server.send(200, "text/html", html);
}

// =====================================================
// API — SENSOR DATA
// =====================================================

void handleSensorsAPI()
{
  readSensors();

  String json = "{";

  json += "\"soil\":";
  json += String(soilValue);

  json += ",\"rain\":";
  json += String(rainValue);

  json += ",\"temperature\":";

  if (isnan(temperature))
  {
    json += "null";
  }
  else
  {
    json += String(temperature, 2);
  }

  json += ",\"humidity\":";

  if (isnan(humidity))
  {
    json += "null";
  }
  else
  {
    json += String(humidity, 2);
  }

  json += ",\"mq135\":";
  json += String(mq135Value);

  json += ",\"distance\":";
  json += String(distanceCM);

  json += ",\"roverRunning\":";
  json += roverRunning ? "true" : "false";

  json += ",\"obstacle\":";
  json += obstacleDetected ? "true" : "false";

  json += ",\"collectionInProgress\":";
  json += collectionInProgress ? "true" : "false";

  json += ",\"servo\":";
  json += String(collectionInProgress ? SERVO_COLLECT : SERVO_HOME);

  json += "}";

  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.send(
    200,
    "application/json",
    json
  );
}

// =====================================================
// START
// =====================================================

void handleStart()
{
  if (obstacleDetected)
  {
    server.send(
      409,
      "text/plain",
      "Obstacle detected"
    );

    return;
  }

  if (collectionInProgress)
  {
    server.send(
      409,
      "text/plain",
      "Soil collection in progress"
    );

    return;
  }

  roverRunning = true;

  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.sendHeader(
    "Location",
    "/"
  );

  server.send(303);
}

// =====================================================
// STOP
// =====================================================

void handleStop()
{
  roverRunning = false;

  motorStop();

  digitalWrite(
    BUZZER_PIN,
    LOW
  );

  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.sendHeader(
    "Location",
    "/"
  );

  server.send(303);
}

// =====================================================
// SPEED
// =====================================================

void handleSpeed()
{
  if (server.hasArg("value"))
  {
    motorSpeed =
      server.arg("value").toInt();

    motorSpeed =
      constrain(
        motorSpeed,
        0,
        255
      );
  }

  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.sendHeader(
    "Location",
    "/"
  );

  server.send(303);
}

// =====================================================
// COLLECTION
// =====================================================

void handleCollect()
{
  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  // Must be stopped
  if (roverRunning)
  {
    server.send(
      409,
      "application/json",
      "{\"error\":\"Please stop the rover before soil collection.\"}"
    );

    return;
  }

  if (collectionInProgress)
  {
    server.send(
      409,
      "application/json",
      "{\"error\":\"Soil collection is already in progress.\"}"
    );

    return;
  }

  servoCollect();

  String json = "{";
  json += "\"time\":\"";
  json += millis();
  json += "\",\"soil\":";
  json += soilValue;
  json += ",\"rain\":";
  json += rainValue;
  json += ",\"temperature\":";
  json += isnan(temperature) ? "null" : String(temperature, 2);
  json += ",\"humidity\":";
  json += isnan(humidity) ? "null" : String(humidity, 2);
  json += ",\"mq135\":";
  json += mq135Value;
  json += ",\"distance\":";
  json += distanceCM;
  json += ",\"servo\":90}";

  server.send(
    200,
    "application/json",
    json
  );
}

// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);

  // =================================================
  // MOTOR
  // =================================================

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);

  motorStop();

  // =================================================
  // ULTRASONIC
  // =================================================

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // =================================================
  // BUZZER
  // =================================================

  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(
    BUZZER_PIN,
    LOW
  );

  // =================================================
  // DHT
  // =================================================

  dht.begin();

  // =================================================
  // SERVO
  // =================================================

  probeServo.setPeriodHertz(50);

  probeServo.attach(
    SERVO_PIN,
    500,
    2400
  );

  probeServo.write(
    SERVO_HOME
  );

  // =================================================
  // LCD
  // =================================================

  Wire.begin(
    SDA_PIN,
    SCL_PIN
  );

  lcd.init();

  lcd.backlight();

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print("Field Shift");

  lcd.setCursor(0, 1);
  lcd.print("Starting...");

  delay(2000);

  // =================================================
  // WIFI
  // =================================================

  WiFi.mode(WIFI_STA);

  WiFi.begin(
    ssid,
    password
  );

  Serial.println();
  Serial.println("Connecting WiFi...");

  lcd.clear();
  lcd.print("WiFi Connecting");

  int attempts = 0;

  while (
    WiFi.status() != WL_CONNECTED &&
    attempts < 30
  )
  {
    delay(500);

    Serial.print(".");

    attempts++;
  }

  Serial.println();

  // =================================================
  // WIFI SUCCESS
  // =================================================

  if (
    WiFi.status() ==
    WL_CONNECTED
  )
  {
    Serial.println(
      "WiFi Connected!"
    );

    Serial.print(
      "IP Address: "
    );

    Serial.println(
      WiFi.localIP()
    );

    lcd.clear();

    lcd.print(
      "WiFi Connected"
    );

    lcd.setCursor(0, 1);

    lcd.print(
      WiFi.localIP()
    );

    delay(3000);
  }

  // =================================================
  // WIFI FAILED
  // =================================================

  else
  {
    Serial.println(
      "WiFi Connection FAILED"
    );

    lcd.clear();

    lcd.print(
      "WiFi FAILED"
    );

    delay(2000);
  }

  // =================================================
  // WEB ROUTES
  // =================================================

  server.on(
    "/",
    handleRoot
  );

  server.on(
    "/start",
    handleStart
  );

  server.on(
    "/stop",
    handleStop
  );

  server.on(
    "/speed",
    handleSpeed
  );

  server.on(
    "/collect",
    handleCollect
  );

  server.on(
    "/api/collect",
    handleCollect
  );

  server.on(
    "/api/sensors",
    handleSensorsAPI
  );

  server.begin();

  Serial.println(
    "Web Server Started"
  );

  lcd.clear();

  lcd.print(
    "Rover Ready"
  );
}

// =====================================================
// LOOP
// =====================================================

void loop()
{
  server.handleClient();

  // =================================================
  // ROVER
  // =================================================

  if (roverRunning)
  {
    checkObstacle();

    if (!obstacleDetected)
    {
      motorForward();
    }
    else
    {
      motorStop();

      digitalWrite(
        BUZZER_PIN,
        HIGH
      );
    }
  }
  else
  {
    motorStop();

    digitalWrite(
      BUZZER_PIN,
      LOW
    );
  }

  // =================================================
  // SERIAL SENSOR DATA
  // =================================================

  static unsigned long lastRead = 0;

  if (
    millis() - lastRead > 2000
  )
  {
    lastRead = millis();

    readSensors();

    Serial.println(
      "--------------------"
    );

    Serial.print("Soil: ");
    Serial.println(soilValue);

    Serial.print("Rain: ");
    Serial.println(rainValue);

    Serial.print("Temperature: ");
    Serial.println(temperature);

    Serial.print("Humidity: ");
    Serial.println(humidity);

    Serial.print("MQ135: ");
    Serial.println(mq135Value);

    Serial.print("Distance: ");
    Serial.println(distanceCM);

    Serial.println(
      "--------------------"
    );
  }
}