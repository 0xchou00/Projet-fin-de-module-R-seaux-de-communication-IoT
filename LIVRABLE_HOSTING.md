# Livrable linkable et hebergeable gratuitement

## Objectif

Obtenir un lien public du type:

```text
https://smart-home-dht22-dashboard.onrender.com
```

Ce lien affiche le dashboard temps reel, protege par authentification forte, et connecte au broker EMQX Cloud utilise par Wokwi.

## Pourquoi Render

Render permet d'heberger gratuitement un vrai service web Node.js. C'est important pour ce projet, car le backend garde les identifiants MQTT/EMQX cote serveur. Une simple page statique exposerait les identifiants MQTT dans le navigateur.

Limite a connaitre: l'offre gratuite peut mettre le service en veille apres environ 15 minutes sans trafic. Avant la soutenance, ouvre le lien 2 minutes avant la demo pour le reveiller.

## Fichiers du livrable

- `server.js`: backend HTTP, authentification forte, client MQTT/TLS et SSE temps reel.
- `public/`: interface dashboard.
- `render.yaml`: configuration Render prete a deployer.
- `.env.example`: modele de variables d'environnement.
- `DEMO_JURY.md`: scenario de demonstration devant jury.
- `README.md`: documentation complete du projet, des technologies et des parties securite.

## Etapes pour obtenir le lien public

### 1. Mettre le projet sur GitHub

Depuis le dossier du projet:

```powershell
git init
git add .
git commit -m "Smart Home DHT22 secure dashboard"
```

Puis cree un repo GitHub et pousse le projet:

```powershell
git remote add origin https://github.com/TON_COMPTE/smart-home-dht22-dashboard.git
git branch -M main
git push -u origin main
```

Important: `.env` et `data/` sont ignores par Git. Ne publie pas tes secrets dans GitHub.

### 2. Creer le service Render

1. Va sur `https://dashboard.render.com`.
2. Clique `New` puis `Web Service`.
3. Connecte ton repo GitHub.
4. Choisis le plan `Free`.
5. Render detecte `render.yaml`, sinon utilise:

```text
Build Command: echo No build step required
Start Command: npm start
Health Check Path: /api/health
```

### 3. Ajouter les variables d'environnement Render

Dans Render, ajoute:

```text
APP_HOST=0.0.0.0
APP_SESSION_SECRET=une-longue-valeur-aleatoire
APP_ADMIN_USERNAME=admin
APP_ADMIN_PASSWORD=un-mot-de-passe-fort
APP_COOKIE_SECURE=true
MQTT_HOST=na7a271a.ala.eu-central-1.emqxsl.com
MQTT_PORT=8883
MQTT_USERNAME=dht22
MQTT_PASSWORD=mot-de-passe-emqx
MQTT_TELEMETRY_TOPIC=smart-home/dht22/telemetry
MQTT_STATUS_TOPIC=smart-home/dht22/status
MQTT_CONTROL_TOPIC=smart-home/dht22/control
MQTT_REJECT_UNAUTHORIZED=true
```

Pour la soutenance, tu peux garder `admin`, mais choisis un mot de passe fort et note-le.

### 4. Verifier le lien public

Ouvre:

```text
https://TON-SERVICE.onrender.com/api/health
```

Tu dois voir:

```json
{
  "ok": true,
  "mqtt": {
    "connected": true
  }
}
```

Puis ouvre:

```text
https://TON-SERVICE.onrender.com
```

Connecte-toi avec le compte admin et active le MFA TOTP.

## Demo temps reel avec Wokwi

1. Ouvre le lien public Render.
2. Connecte-toi au dashboard.
3. Lance Wokwi.
4. Verifie dans Wokwi:

```text
Connecting to EMQX Cloud using MQTT/TLS... connected
Telemetry published successfully
```

5. Les donnees doivent apparaitre dans le dashboard heberge.

## Ce que le jury peut verifier

- EMQX Cloud recoit les messages MQTT/TLS.
- L'application hebergee recoit les memes messages en temps reel.
- Le dashboard est protege par mot de passe + MFA.
- Le navigateur ne contient pas les identifiants MQTT.
- `/api/health` confirme l'etat backend + MQTT sans exposer de secrets.
