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
js/main.js                → menu mobile, animations, carte à la demande, formulaire → WhatsApp
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

Le formulaire de la section "Réserver" ne nécessite aucun serveur : au clic
sur "Envoyer", il ouvre WhatsApp avec un message pré-rempli contenant la
demande, envoyé directement au numéro de la centrale.

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
