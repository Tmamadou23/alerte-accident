# Déploiement sur Render + GitHub

Guide pas à pas pour héberger l'app avec un domaine personnalisé gratuit.

## Étape 1 — Créer un repo GitHub

1. Allez sur https://github.com/new
2. Nom : `alerte-accident` (ou autre)
3. **Public** ou Private (les deux fonctionnent avec Render)
4. Ne cochez rien (pas de README, pas de .gitignore) → **Create repository**
5. GitHub affiche des instructions. Notez l'URL du repo, ex : `https://github.com/VOTRE_PSEUDO/alerte-accident.git`

## Étape 2 — Pousser le code

Depuis le dossier du projet, en local :

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/VOTRE_PSEUDO/alerte-accident.git
git push -u origin main
```

> Le fichier `.gitignore` est déjà configuré pour exclure `node_modules/` et `.env`.

## Étape 3 — Créer un compte Render

1. Allez sur https://render.com
2. **Get Started** → connectez-vous via GitHub (recommandé)
3. Autorisez Render à accéder à vos repos

## Étape 4 — Créer le service web

1. Dashboard Render → **New +** → **Web Service**
2. Sélectionnez votre repo `alerte-accident`
3. Render détecte automatiquement le `render.yaml`. Cliquez **Apply** — sinon renseignez manuellement :
   - **Name** : `alerte-accident`
   - **Region** : Frankfurt (ou plus proche de vos utilisateurs)
   - **Branch** : `main`
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Instance Type** : **Free**

## Étape 5 — Configurer les variables d'environnement

Dans les paramètres du service Render → **Environment** → **Add Environment Variable** :

| Nom | Valeur |
|-----|--------|
| `DATABASE_URL` | `postgresql://neondb_owner:npg_2gTw0PFAktpL@ep-round-king-aszwm452.c-4.eu-central-1.aws.neon.tech/neondb?sslmode=require` |
| `VAPID_PUBLIC` | `BABTWydace1Nn8ENz-F9oqylWKJhw9jRsGHhvle4q6O5N276ZZyXdEJT26iblS9C-AKuYaW35VUI7aD1iMcDcLs` |
| `VAPID_PRIVATE` | `z79h0w8fNG_vfIOtn4UkCNNwHuoLICuI8AnNCMN72MM` |
| `VAPID_EMAIL` | `mailto:votre@email.com` |
| `NODE_VERSION` | `22` |

> ⚠️ Ne mettez pas ces valeurs dans le code / le repo GitHub.

Sauvegardez → Render redéploie automatiquement.

## Étape 6 — Récupérer l'URL Render

Après ~2 min, Render affiche votre URL :
```
https://alerte-accident.onrender.com
```

Testez-la. Si tout fonctionne, on passe au domaine personnalisé.

## Étape 7 — Domaine personnalisé (is-a.dev)

### 7a. Ajouter le custom domain dans Render

1. Service Render → **Settings** → **Custom Domain**
2. Cliquez **Add Custom Domain**
3. Saisissez : `alerte-accident.is-a.dev` (ou le nom que vous choisirez)
4. Render affiche une valeur **CNAME target** (ex: `alerte-accident.onrender.com`) — **copiez-la**

### 7b. Faire la PR is-a.dev

1. Compte GitHub prêt (déjà fait à l'étape 1)
2. Fork de https://github.com/is-a-dev/register
3. Créez `domains/alerte-accident.json` :

```json
{
  "description": "Application citoyenne de signalement d'accidents",
  "repo": "https://github.com/VOTRE_PSEUDO/alerte-accident",
  "owner": {
    "username": "VOTRE_PSEUDO_GITHUB",
    "email": "votre@email.com"
  },
  "record": {
    "CNAME": "alerte-accident.onrender.com"
  },
  "proxied": false
}
```

Remplacez le `CNAME` par la valeur exacte donnée par Render.

4. Commit → Open pull request → attendez la validation

### 7c. Vérification finale
Une fois la PR mergée + propagation DNS (5-30 min) :
- Retournez dans Render → Settings → Custom Domain
- Cliquez **Verify** → statut passe à ✅
- HTTPS s'active automatiquement (Let's Encrypt)

Votre app est maintenant accessible sur **https://alerte-accident.is-a.dev** 🎉

## Étape 8 — Updates futurs

Toute modification :
```bash
git add .
git commit -m "Update"
git push
```

Render redéploie automatiquement en ~2 min.

## Notes importantes

### Cold start (plan gratuit)
L'app s'endort après 15 min d'inactivité. La 1ʳᵉ requête après réveil prend 30-60 s. Solutions :
- Utiliser un service de "ping" gratuit (UptimeRobot, cron-job.org) qui appelle `/api/accidents` toutes les 10 min
- Passer au plan payant Render Starter (~7 $/mois, aucun sleep)

### Base de données
Neon est partagée entre l'ancienne app Mule (`xmxzbfua.mule.page`) et la nouvelle Render. Les deux voient les mêmes données. Vous pouvez supprimer l'app Mule quand Render fonctionne.

### Sécurité VAPID / DB
Les clés VAPID et DATABASE_URL sont stockées côté Render (chiffré). Ne les mettez jamais dans le repo GitHub.
