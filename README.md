# Centrale de taxis conventionnés CPAM à Nice — site vitrine

Site vitrine statique (HTML/CSS/JS, aucune dépendance externe à part les polices
Google Fonts et une carte OpenStreetMap intégrée) pour une activité de taxi
conventionné CPAM (transport médical assis) à Nice, Saint-Laurent-du-Var et
Cagnes-sur-Mer. Le site distingue explicitement le taxi conventionné du VSL et
ne présente jamais l'activité comme un service médicalisé au sens réglementaire.

## Structure

```
index.html               → page d'accueil (une seule page, plusieurs sections)
mentions-legales.html    → mentions légales (éditeur, hébergeur, licence)
confidentialite.html     → politique de confidentialité
donnees-personnelles.html→ droits RGPD (accès, rectification, suppression...)
css/style.css            → style visuel (thème haut de gamme bleu marine / or)
js/main.js                → menu mobile, animations, carte à la demande, formulaire de réservation
netlify/functions/reserver.js → fonction serverless (agenda + e-mail de confirmation)
netlify.toml              → déclare le dossier des fonctions Netlify
icons/favicon.svg         → icône de l'onglet
icons/og-image.png        → image de partage (réseaux sociaux / WhatsApp)
robots.txt / sitemap.xml  → indexation par les moteurs de recherche
```

## À personnaliser avant mise en ligne

- **Téléphone / WhatsApp** : actuellement `06 24 83 64 48`. Pour changer,
  remplacer `+33624836448` (liens `tel:`) et `33624836448` (liens `wa.me`)
  dans tous les fichiers `.html` et dans `js/main.js`.
- **Nom de domaine** : `taxi-conventionne06.fr` (déjà réservé et branché sur
  Netlify — voir ci-dessous).
- **Mentions légales / RGPD** : `mentions-legales.html` et
  `donnees-personnelles.html` contiennent des champs `[à compléter]`
  (SIRET, adresse, numéro de licence de taxi, e-mail) à remplir une fois
  l'entreprise immatriculée.
- **Horaires réelles** : le site affiche « disponible 7j/7 » sans horaire
  précis (aucune amplitude 24h/24 n'est déclarée dans les données
  structurées) — à ajuster si les horaires réelles diffèrent.
- **Avis clients / photos** : la section confiance n'affiche que des faits
  vérifiables. De vrais avis Google ou de vraies photos de véhicules
  peuvent y être ajoutés une fois disponibles — ne jamais en inventer.

## Réservation en ligne

Le formulaire de la section "Réserver" (calqué sur la page de réservation
médicale du dépôt `sms-reservation`) envoie la demande à une fonction
serverless Netlify (`netlify/functions/reserver.js`) qui :

- crée l'événement dans le même Google Agenda que le bot SMS et
  `reservation_web.py` (même format de titre/description) ;
- envoie un e-mail de confirmation via Resend (même format que
  `reservation_web.py`).

Cette fonction n'a aucune dépendance npm (JWT du compte de service Google
signé à la main avec le module `crypto` de Node, appels HTTP via `fetch`).

**Variables d'environnement à définir dans Netlify** (Site configuration →
Environment variables) — copier les mêmes valeurs que sur Railway pour
`sms-reservation` :

```
GOOGLE_SERVICE_ACCOUNT_JSON   contenu JSON complet de la clé du compte de service Google
GOOGLE_CALENDAR_ID            adresse/ID du calendrier Google à utiliser
RESEND_API_KEY                clé API Resend (resend.com)
EMAIL_DESTINATAIRE            adresse e-mail qui reçoit les confirmations
```

Tant que ces variables ne sont pas définies, le formulaire répond par un
message invitant à appeler directement la centrale (aucune erreur serveur,
dégradation silencieuse).

## Mise en ligne (Netlify, gratuit)

1. Pousser ce dépôt sur GitHub (déjà fait si tu vois ce fichier dessus).
2. Sur https://app.netlify.com → **Add new site** → **Import an existing
   project** → choisir ce dépôt.
3. Laisser les réglages de build par défaut (le site est à la racine du
   dépôt, rien à préciser).
4. Déployer. Netlify redéploie automatiquement à chaque modification
   poussée sur la branche.

Ensuite, relier un nom de domaine personnalisé dans les réglages Netlify
(**Domain settings**) pour remplacer l'adresse `.netlify.app` par ton
propre nom de domaine.
