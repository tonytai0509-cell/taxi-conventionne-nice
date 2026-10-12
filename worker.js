// Point d'entree du Worker Cloudflare (config : wrangler.jsonc). Sert les
// fichiers statiques du site (HTML/CSS/JS/images) via le binding ASSETS, et
// route la seule requete dynamique (soumission du formulaire de reservation)
// vers la meme logique que functions/.netlify/functions/reserver.js —
// chemin d'URL identique a celui deja appele par js/main.js, donc aucune
// modification du frontend n'est necessaire.

import { onRequestPost } from "./functions/.netlify/functions/reserver.js";
import { CHEMIN_CONFIRMER_SMS, pageConfirmerSms } from "./functions/confirmerSms.js";

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
    "default-src 'self'; script-src 'self' https://www.googletagmanager.com; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' https://www.googletagmanager.com https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://ad.doubleclick.net; " +
    "connect-src 'self' https://www.googletagmanager.com https://www.google.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://ad.doubleclick.net; " +
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

// Ancienne adresse de l'appli EasyTaxi (service arrete) : une fois le domaine
// app.easytaxi-app.fr rattache a ce Worker, le lien de reservation de la
// centrale (EASYTAXI_ANCIEN_LIEN, ou EASYTAXI_LIEN_RESERVATION) renvoie vers le formulaire du site ;
// tout le reste (liens des autres chauffeurs...) affiche une page explicative.
const HOTES_EASYTAXI = ["app.easytaxi-app.fr", "easytaxi-app.fr", "www.easytaxi-app.fr"];

async function ancienneAppli(request, env, url) {
  const lien = (env.EASYTAXI_ANCIEN_LIEN || env.EASYTAXI_LIEN_RESERVATION || "").trim().match(/\/r\/([A-Za-z0-9_-]+)\/?$/);
  const m = url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/?$/);
  if (m && lien && m[1] === lien[1]) return Response.redirect("https://taxi-conventionne06.fr/#reserver", 302);
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ ok: false, error: "Service EasyTaxi arrêté." }), {
      status: 410,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const page = await env.ASSETS.fetch(new Request(new URL("/easytaxi-arrete", url.origin), request));
  return new Response(page.body, { status: 410, headers: page.headers });
}

// Suggestions d'adresses du formulaire (Base Adresse Nationale, IGN : gratuit,
// sans cle), limitees aux Alpes-Maritimes et au Var. Passe par le Worker pour
// garder la politique de securite du site (connect-src 'self').
async function suggestionsAdresses(url) {
  const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const json = (corps, statut = 200) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } });
  if (q.length < 3) return json({ adresses: [] });
  try {
    const params = new URLSearchParams({ q, limit: "15", autocomplete: "1" });
    const r = await fetch(`https://data.geopf.fr/geocodage/search?${params}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return json({ adresses: [] }, 502);
    const d = await r.json();
    const adresses = (d.features || [])
      .map((f) => f.properties || {})
      .filter((p) => typeof p.postcode === "string" && ["06", "83"].includes(p.postcode.slice(0, 2)))
      .slice(0, 6)
      .map((p) => p.label);
    return json({ adresses });
  } catch (e) {
    return json({ adresses: [] }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === CHEMIN_CONFIRMER_SMS && !HOTES_EASYTAXI.includes(url.hostname)) return avecEntetesSecurite(await pageConfirmerSms(request, env));
    if (url.pathname === "/api/adresses" && !HOTES_EASYTAXI.includes(url.hostname)) return avecEntetesSecurite(await suggestionsAdresses(url));

    if (HOTES_EASYTAXI.includes(url.hostname)) return avecEntetesSecurite(await ancienneAppli(request, env, url));

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
