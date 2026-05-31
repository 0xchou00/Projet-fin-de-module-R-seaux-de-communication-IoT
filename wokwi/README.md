# Simulation Wokwi ESP32/DHT22

Ce dossier contient le code source complet de la partie embarquee:

- `sketch.ino`: firmware ESP32 Arduino.
- `diagram.json`: cablage de la simulation Wokwi.
- `libraries.txt`: bibliotheques Arduino necessaires.

## Lancer dans Wokwi

1. Creez un nouveau projet **ESP32 Arduino** sur Wokwi.
2. Copiez le contenu de `sketch.ino`, `diagram.json` et `libraries.txt`.
3. Remplacez `REPLACE_WITH_DEMO_MQTT_PASSWORD` par le mot de passe d'un utilisateur EMQX dedie a la demo.
4. Lancez la simulation.
5. Verifiez le Serial Monitor:

```text
Connecting to WiFi... connected
Connecting to EMQX Cloud using MQTT/TLS... connected
Telemetry published successfully
```

## Securite du lien public

Un projet Wokwi public expose le code source. Pour cette raison, il ne faut pas y mettre un mot de passe administrateur ou un compte EMQX principal.

Utilisez un utilisateur EMQX dedie a la simulation, avec des permissions limitees aux topics:

```text
smart-home/dht22/telemetry
smart-home/dht22/status
smart-home/dht22/control
```

Apres publication sur Wokwi, copiez le lien public dans le README principal du depot.
