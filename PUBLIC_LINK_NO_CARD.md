# Lien public sans carte bancaire

Render demande parfois une verification de paiement meme pour le plan gratuit. Si tu n'as pas de carte ou pas de ressources cloud, utilise cette solution:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-public-demo.ps1
```

Le script:

1. lance l'application locale sur `http://localhost:3000`;
2. telecharge `cloudflared` portable si besoin;
3. cree un lien public temporaire Cloudflare du type:

```text
https://xxxxx.trycloudflare.com
```

Tu peux ouvrir ce lien sur ton telephone ou le donner au jury.

## Pourquoi c'est acceptable pour la demo

- Aucun compte cloud et aucune carte bancaire.
- Le backend Node.js reste sur ton PC.
- L'authentification forte reste active: mot de passe + MFA TOTP.
- Les identifiants EMQX restent cote serveur local.
- Wokwi publie toujours vers EMQX Cloud en MQTT/TLS.
- Le dashboard public affiche les donnees recues en temps reel.

## Limite

Le lien `trycloudflare.com` est temporaire et change a chaque lancement. Pour la soutenance, lance le script avant la demo et garde la fenetre PowerShell ouverte.

## Ordre de demo

1. Lance:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-public-demo.ps1
```

2. Copie l'URL `https://...trycloudflare.com`.
3. Ouvre l'URL sur ton telephone.
4. Connecte-toi au dashboard.
5. Lance Wokwi.
6. Montre les valeurs qui changent dans le dashboard.
