// Point d'entree du Worker Cloudflare (config : wrangler.jsonc). Sert les
// fichiers statiques du site (HTML/CSS/JS/images) via le binding ASSETS, et
// route la seule requete dynamique (soumission du formulaire de reservation)
// vers la meme logique que functions/.netlify/functions/reserver.js —
// chemin d'URL identique a celui deja appele par js/main.js, donc aucune
// modification du frontend n'est necessaire.

import { onRequestPost } from "./functions/.netlify/functions/reserver.js";

const CHEMIN_RESERVATION = "/.netlify/functions/reserver";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === CHEMIN_RESERVATION) {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ ok: false, error: "Methode non autorisee" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        });
      }
      return onRequestPost({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};
