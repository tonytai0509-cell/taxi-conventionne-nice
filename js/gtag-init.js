// Initialisation Google tag (gtag.js) - suivi des conversions Google Ads
// ("Réservation formulaire site"). Fichier externe plutôt qu'un <script>
// inline dans le <head> : la CSP du site (voir _headers/worker.js) n'admet
// aucun script inline (script-src 'self' ...), et un <script src="..."> du
// même domaine passe par 'self' sans affaiblir la CSP. Le dataLayer.push()
// fonctionne indépendamment de l'ordre de chargement par rapport au script
// externe googletagmanager.com/gtag/js (chargé en async juste avant) :
// c'est le principe même du snippet officiel Google.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('js', new Date());
gtag('config', 'AW-18403307378');
