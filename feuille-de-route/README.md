# Feuille de route — application chauffeurs

Application web indépendante (distincte du site vitrine à la racine du
dépôt) : chaque chauffeur se connecte avec **son propre compte Google**
(bouton "Se connecter avec Google", aucun mot de passe géré par nous) et
obtient sa feuille de route du jour, générée directement depuis son Google
Agenda. Remplace le script Google (Apps Script) précédent par une vraie
appli hébergée, avec gestion propre des erreurs, des jetons d'accès et de
plusieurs chauffeurs en même temps.

## Comment ça marche

- Connexion OAuth Google (lecture seule de l'agenda — `calendar.readonly`,
  jamais d'écriture). Le jeton d'accès n'est jamais visible du navigateur :
  seul le Worker en détient un, régénéré à la demande depuis un refresh
  token **chiffré** (AES-GCM) stocké dans une base Cloudflare D1.
- Chaque chauffeur ne voit que son propre agenda : les données ne sont
  jamais partagées entre comptes.
- La feuille de route reconnaît le format des événements créés par le site
  (`functions/.netlify/functions/reserver.js`) et le bot SMS
  (`PC : ... / DEST : ... / RDV : ... / TEL : ... / REF : ...` dans la
  description) pour afficher des champs propres. Un événement qui ne suit
  pas ce format (rendez-vous saisi à la main, invitation externe) reste
  affiché via son titre / lieu / description bruts — rien n'est perdu.
- Vue du jour avec navigation (veille/lendemain, sélecteur de date),
  changement de calendrier si un chauffeur en a plusieurs, bouton
  impression (mise en page dédiée à l'impression).

## Structure

```
worker.js                 → routage (connexion Google, API), sert public/ pour le reste
lib/google.js              → appels OAuth + Google Calendar API
lib/session.js             → cookie de session signé (HMAC), sans état côté serveur
lib/chiffrement.js          → chiffrement AES-GCM des refresh tokens avant stockage
lib/analyserEvenement.js    → transforme un événement Google Calendar en course structurée
schema.sql                 → schéma de la base D1 (une ligne = un chauffeur)
public/index.html           → page de connexion
public/app.html             → tableau de bord (feuille de route)
public/js, public/css       → frontend (aucune dépendance externe)
wrangler.jsonc              → config Cloudflare Worker (assets + D1)
```

## Mise en place (à faire une seule fois)

### 1. Créer les identifiants Google OAuth

1. Sur [Google Cloud Console](https://console.cloud.google.com/), créer un
   projet dédié (ex: "Feuille de route taxi").
2. **APIs & Services → Bibliothèque** → activer **Google Calendar API**.
3. **APIs & Services → Écran de consentement OAuth** :
   - Type : Externe.
   - Champs d'application (scopes) : `openid`, `email`, `profile`, et
     `.../auth/calendar.readonly`.
   - Tant que l'app reste en statut "Test" (par défaut), ajouter l'adresse
     Gmail de **chaque chauffeur** dans la liste "Utilisateurs test" (limite
     de 100 — largement suffisant pour une flotte de taxis). Sans ça,
     Google refusera la connexion des chauffeurs non listés. Pour ouvrir
     l'accès à tout le monde sans liste de test, il faut soumettre l'app à
     validation Google (pas nécessaire pour un usage interne).
4. **APIs & Services → Identifiants** → **Créer des identifiants → ID
   client OAuth** → type **Application Web**.
   - URI de redirection autorisée : `https://<votre-domaine-de-l-appli>/auth/google/callback`
     (à ajuster une fois l'appli déployée à l'étape 3 si vous ne connaissez
     pas encore l'URL — vous pourrez revenir modifier ce champ ensuite).
5. Noter le **Client ID** et le **Client Secret** générés.

### 2. Créer la base de données Cloudflare D1

Depuis le dossier `feuille-de-route/` :

```bash
npx wrangler d1 create feuille-de-route-taxi
```

Copier le `database_id` renvoyé dans `wrangler.jsonc` (remplacer
`A_REMPLACER_APRES_wrangler_d1_create`), puis créer la table :

```bash
npx wrangler d1 execute feuille-de-route-taxi --remote --file=schema.sql
```

### 3. Configurer les secrets

```bash
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET       # ex: openssl rand -base64 48
npx wrangler secret put ENCRYPTION_KEY       # ex: openssl rand -base64 32
```

`SESSION_SECRET` sert à signer les cookies de session, `ENCRYPTION_KEY` à
chiffrer les refresh tokens Google en base — les deux doivent rester
secrets et ne jamais être committés.

### 4. Déployer

```bash
npx wrangler deploy
```

Wrangler affiche l'URL de déploiement (`*.workers.dev`, ou un domaine
personnalisé si configuré dans le dashboard Cloudflare). Si l'URI de
redirection de l'étape 1 n'était pas encore connue, revenir dans Google
Cloud Console pour la renseigner avec cette URL exacte, sous la forme
`https://<url>/auth/google/callback`.

### 5. Partager le lien avec les chauffeurs

Chaque chauffeur ouvre l'URL, clique sur "Se connecter avec Google",
autorise l'accès en lecture seule à son agenda, et retrouve sa feuille de
route du jour.

## Développement local

```bash
cd feuille-de-route
cp .dev.vars.example .dev.vars   # si vous créez ce fichier, sinon voir ci-dessous
npx wrangler d1 execute feuille-de-route-taxi --local --file=schema.sql
npx wrangler dev
```

`.dev.vars` (non commité, voir `.gitignore`) doit contenir les 4 mêmes
variables que les secrets ci-dessus, avec des valeurs de test.
