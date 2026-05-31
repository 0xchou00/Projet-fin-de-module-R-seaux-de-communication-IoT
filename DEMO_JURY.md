# Demo jury - Smart Home DHT22 securise

## Architecture a expliquer

1. Wokwi simule un ESP32 connecte au capteur DHT22.
2. L'ESP32 publie les mesures vers EMQX Cloud avec MQTT chiffre en TLS sur le port 8883.
3. Le backend Node.js de l'application se connecte au broker EMQX et s'abonne au topic `smart-home/dht22/telemetry`.
4. Le dashboard web est protege par authentification forte: mot de passe + code TOTP.
5. Le telephone ou un autre PC consulte le dashboard via le reseau local.

## Preparation avant presentation

Dans PowerShell, depuis le dossier du projet:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-app.ps1
```

Le terminal affiche une URL de ce type:

```text
URL telephone/PC meme Wi-Fi: http://192.168.1.11:3000
```

Cette URL doit etre ouverte sur le telephone ou le PC du jury, connecte au meme Wi-Fi.

## Etapes de demo

1. Ouvrir EMQX Cloud et montrer le deployment `deployment-na7a271a`.
2. Montrer l'adresse du broker `na7a271a.ala.eu-central-1.emqxsl.com` et le port TLS `8883`.
3. Lancer la simulation Wokwi.
4. Montrer dans le moniteur serie Wokwi: connexion Wi-Fi, connexion MQTT/TLS, publication telemetry.
5. Ouvrir le dashboard sur le PC: `http://localhost:3000`.
6. Ouvrir le dashboard sur le telephone: URL LAN affichee par le script.
7. Se connecter avec:

```text
Utilisateur: admin
Mot de passe: valeur configuree dans APP_ADMIN_PASSWORD
```

8. Activer le MFA avec une application Authenticator si c'est la premiere connexion.
9. Montrer les valeurs temperature/humidite, les statuts et l'historique MQTT.

## Points securite a dire au jury

- La communication ESP32 vers cloud utilise MQTT avec TLS, donc les donnees sont chiffrees.
- Les identifiants MQTT ne sont pas exposes dans le navigateur; ils restent cote serveur.
- Le dashboard exige un mot de passe et un second facteur TOTP.
- Les sessions utilisent un cookie signe `HttpOnly`.
- Les requetes sensibles utilisent une protection CSRF.
- Les tentatives de connexion sont limitees.

## Si le telephone ne se connecte pas

- Verifier que le telephone et le PC sont sur le meme Wi-Fi.
- Utiliser l'IP Wi-Fi, pas les IP VMware.
- Autoriser Node.js dans Windows Firewall.
- Tester depuis le PC:

```powershell
Invoke-WebRequest http://localhost:3000/api/csrf
```

- Tester depuis un autre appareil:

```text
http://IP_DU_PC:3000
```
