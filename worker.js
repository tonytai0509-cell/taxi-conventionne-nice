// Point d'entree du Worker Cloudflare (config : wrangler.jsonc). Sert les
// fichiers statiques du site (HTML/CSS/JS/images) via le binding ASSETS, et
// route la seule requete dynamique (soumission du formulaire de reservation)
// vers la meme logique que functions/.netlify/functions/reserver.js —
// chemin d'URL identique a celui deja appele par js/main.js, donc aucune
// modification du frontend n'est necessaire.

import { onRequestPost } from "./functions/.netlify/functions/reserver.js";

const CHEMIN_RESERVATION = "/.netlify/functions/reserver";

// Memes valeurs que le fichier _headers, mais appliquees ici a *toutes* les
// reponses, y compris celles generees par le Worker lui-meme (l'endpoint de
// reservation), que _headers ne couvre pas. Les deux se recoupent sans
// conflit : on ne remplace un en-tete que s'il n'est pas deja pose.
const ENTETES_SECURITE = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; " +
    "frame-src https://www.openstreetmap.org; base-uri 'self'; form-action 'self'; " +
    "object-src 'none'; frame-ancestors 'none'",
};

function avecEntetesSecurite(reponse) {
  // La reponse d'ASSETS est immuable : on la reconstruit pour pouvoir
  // completer ses en-tetes.
  const sortie = new Response(reponse.body, reponse);
  for (const [nom, valeur] of Object.entries(ENTETES_SECURITE)) {
    if (!sortie.headers.has(nom)) sortie.headers.set(nom, valeur);
  }
  return sortie;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === CHEMIN_RESERVATION) {
      if (request.method !== "POST") {
        return avecEntetesSecurite(
          new Response(JSON.stringify({ ok: false, error: "Methode non autorisee" }), {
            status: 405,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          })
        );
      }
      const reponse = await onRequestPost({ request, env });
      return avecEntetesSecurite(reponse);
    }

    return avecEntetesSecurite(await env.ASSETS.fetch(request));
  },
};
