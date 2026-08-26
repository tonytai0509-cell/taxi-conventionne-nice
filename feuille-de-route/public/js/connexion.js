// Si un chauffeur deja connecte revient sur la page d'accueil (lien
// partage, favori...), on l'envoie directement sur son tableau de bord au
// lieu de lui remontrer le bouton de connexion.
fetch("/api/me", { credentials: "same-origin" })
  .then((r) => (r.ok ? location.replace("/app") : null))
  .catch(() => {});
