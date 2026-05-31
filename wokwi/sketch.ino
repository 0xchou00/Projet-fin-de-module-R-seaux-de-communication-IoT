#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "DHT.h"

// =====================
// Wokwi Wi-Fi
// =====================
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// =====================
// EMQX Cloud MQTT/TLS
// =====================
#define MQTT_SERVER "na7a271a.ala.eu-central-1.emqxsl.com"
#define MQTT_PORT 8883

// Use a dedicated EMQX demo user. Do not publish a production password.
#define MQTT_USERNAME "dht22"
#define MQTT_PASSWORD "REPLACE_WITH_DEMO_MQTT_PASSWORD"

// =====================
// DHT22 configuration
// =====================
#define DHT_PIN 33
#define DHT_TYPE DHT22

DHT dht(DHT_PIN, DHT_TYPE);

// =====================
// Secure MQTT client
// =====================
WiFiClientSecure secureClient;
PubSubClient mqttClient(secureClient);

// =====================
// Topics
// =====================
#define TELEMETRY_TOPIC "smart-home/dht22/telemetry"
#define STATUS_TOPIC    "smart-home/dht22/status"

// =====================
// Wi-Fi connection
// =====================
void connectWiFi() {
  Serial.print("Connecting to WiFi");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

// =====================
// MQTT/TLS connection
// =====================
void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to EMQX Cloud using MQTT/TLS... ");

    String clientId = "ESP32_DHT22_TLS_" + String(random(0xffff), HEX);

    bool connected = mqttClient.connect(
      clientId.c_str(),
      MQTT_USERNAME,
      MQTT_PASSWORD
    );

    if (connected) {
      Serial.println("connected");

      mqttClient.publish(
        STATUS_TOPIC,
        "{\"device\":\"ESP32_DHT22\",\"status\":\"online\",\"security\":\"MQTT_TLS\"}"
      );
    } else {
      Serial.print("failed, error code = ");
      Serial.println(mqttClient.state());
      delay(3000);
    }
  }
}

// =====================
// Read DHT22 and send telemetry
// =====================
void sendTelemetry() {
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  if (isnan(humidity) || isnan(temperature)) {
    Serial.println("DHT22 reading failed");
    return;
  }

  bool highTemperature = temperature > 30.0;
  bool highHumidity = humidity > 70.0;

  String temperatureStatus;
  String humidityStatus;

  if (temperature < 18.0) {
    temperatureStatus = "LOW";
  } else if (temperature <= 30.0) {
    temperatureStatus = "NORMAL";
  } else {
    temperatureStatus = "HIGH";
  }

  if (humidity < 30.0) {
    humidityStatus = "LOW";
  } else if (humidity <= 70.0) {
    humidityStatus = "NORMAL";
  } else {
    humidityStatus = "HIGH";
  }

  String payload = "{";
  payload += "\"device\":\"ESP32_DHT22\",";
  payload += "\"temperature\":";
  payload += String(temperature, 2);
  payload += ",";
  payload += "\"humidity\":";
  payload += String(humidity, 2);
  payload += ",";
  payload += "\"high_temperature\":";
  payload += highTemperature ? "true" : "false";
  payload += ",";
  payload += "\"high_humidity\":";
  payload += highHumidity ? "true" : "false";
  payload += ",";
  payload += "\"temperature_status\":\"";
  payload += temperatureStatus;
  payload += "\",";
  payload += "\"humidity_status\":\"";
  payload += humidityStatus;
  payload += "\",";
  payload += "\"protocol\":\"MQTT_TLS\",";
  payload += "\"port\":8883";
  payload += "}";

  Serial.print("Sending telemetry: ");
  Serial.println(payload);

  bool published = mqttClient.publish(TELEMETRY_TOPIC, payload.c_str());

  if (published) {
    Serial.println("Telemetry published successfully");
  } else {
    Serial.println("Telemetry publish failed");
  }
}

// =====================
// Setup
// =====================
void setup() {
  Serial.begin(115200);
  delay(1000);

  dht.begin();

  connectWiFi();

  /*
    TLS encrypted connection.
    In Wokwi, setInsecure() allows TLS encryption without CA verification.
    For real ESP32 deployment, replace this with secureClient.setCACert(root_ca).
  */
  secureClient.setInsecure();
  secureClient.setTimeout(20000);

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(60);
  mqttClient.setSocketTimeout(30);
}

// =====================
// Main loop
// =====================
void loop() {
  if (!mqttClient.connected()) {
    connectMQTT();
  }

  mqttClient.loop();

  sendTelemetry();

  delay(5000);
}
