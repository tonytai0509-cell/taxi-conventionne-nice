// Initialisation Google Ads (gtag.js) — fichier séparé pour respecter la CSP
// du site (script-src 'self', pas de script inline autorisé).
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", "AW-18403307378");

// Deux actions de conversion distinctes (js/main.js) — aucune donnée du patient,
// aucune adresse ni numéro n'est envoyé : seulement « une action a eu lieu ».
//  - demande : demande de transport réellement enregistrée par la centrale ;
//  - appel   : CLIC sur un bouton / lien « Appeler » (ne prouve pas qu'un appel a abouti).
//    À remplir avec l'étiquette de l'action « Clic Appeler » créée dans Google Ads
//    (format "AW-18403307378/xxxxxxxx"). Vide = rien n'est envoyé.
window.ADS_CONVERSIONS = {
  demande: "AW-18403307378/lmN8CM-whO4cEPLesMdE",
  appel: "",
};
