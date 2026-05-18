# Smart Home DHT22 - Application securisee

Application web locale pour visualiser les mesures envoyees par l'ESP32/Wokwi vers EMQX Cloud en MQTT avec TLS.

## Fonctionnalites

- Authentification forte: mot de passe hache avec `scrypt`, session signee `HttpOnly`, protection CSRF, limitation des tentatives et MFA TOTP.
- Connexion serveur vers EMQX en `mqtts` sur le port `8883`.
- Dashboard temps reel: temperature, humidite, statuts `LOW/NORMAL/HIGH`, alertes, historique et messages bruts.
- Donnees stockees localement dans `data/telemetry.json`.
- Panneau de controle des seuils avec publication vers `smart-home/dht22/control`.

## Lancer

```powershell
node server.js
```

Puis ouvrir:

```text
http://localhost:3000
```

Identifiants par defaut:

```text
Utilisateur: admin
Mot de passe: Admin@12345!
```

A la premiere connexion, l'application affiche une cle TOTP a ajouter dans Google Authenticator, Microsoft Authenticator, 1Password ou equivalent. Entrez ensuite le code a 6 chiffres pour activer la MFA.

## Configuration

La configuration est dans `.env`:

- `MQTT_HOST`: endpoint EMQX Cloud.
- `MQTT_PORT`: `8883`.
- `MQTT_USERNAME` / `MQTT_PASSWORD`: acces EMQX.
- `MQTT_TELEMETRY_TOPIC`: topic publie par Wokwi.
- `MQTT_STATUS_TOPIC`: topic de statut.
- `MQTT_CONTROL_TOPIC`: topic reserve aux commandes.

Avant de partager le projet, changez `APP_SESSION_SECRET`, `APP_ADMIN_PASSWORD` et les identifiants MQTT.
