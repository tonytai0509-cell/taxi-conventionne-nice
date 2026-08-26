// Point d'entree du Worker (config : wrangler.jsonc). Sert l'appli statique
// (public/) via le binding ASSETS, et route les endpoints dynamiques :
// connexion Google (OAuth), API de feuille de route. Chaque chauffeur se
// connecte avec son propre compte Google (bouton "Se connecter avec
// Google") ; l'appli lit son agenda en lecture seule, aucun mot de passe
// n'est jamais demande ni stocke.

import { urlAutorisationGoogle, echangerCodeContreJetons, rafraichirJetonAcces, obtenirProfil, listerCalendriers, listerEvenementsDuJour } from "./lib/google.js";
import { creerCookieSession, verifierCookieSession, lireCookie } from "./lib/session.js";
import { chiffrer, dechiffrer } from "./lib/chiffrement.js";
import { analyserEvenement } from "./lib/analyserEvenement.js";
import { base64urlFromBytes } from "./lib/codage.js";

const ENTETES_SECURITE = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; img-src 'self'; connect-src 'self'; " +
    "base-uri 'self'; form-action 'self' https://accounts.google.com; object-src 'none'; frame-ancestors 'none'",
};

function avecEntetesSecurite(reponse) {
  const sortie = new Response(reponse.body, reponse);
  for (const [nom, valeur] of Object.entries(ENTETES_SECURITE)) {
    if (!sortie.headers.has(nom)) sortie.headers.set(nom, valeur);
  }
  return sortie;
}

function reponseJson(statut, donnees) {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function reponseTexte(statut, texte) {
  return new Response(texte, {
    status: statut,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function redirection(location) {
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}

// L'attribut Secure exige HTTPS : en local (wrangler dev sur http://localhost)
// on l'omet, sinon le navigateur refuserait de poser le cookie et personne ne
// pourrait se connecter pendant les tests.
function attributsCookie(request) {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

async function utilisateurConnecte(request, env) {
  const session = await verifierCookieSession(env, lireCookie(request, "session"));
  if (!session || !session.uid) return null;
  return env.DB.prepare(
    "SELECT id, email, nom, calendar_id, refresh_token_chiffre FROM utilisateurs WHERE id = ?1"
  )
    .bind(session.uid)
    .first();
}

async function jetonAccesPour(env, utilisateur) {
  const refreshToken = await dechiffrer(env, utilisateur.refresh_token_chiffre);
  return rafraichirJetonAcces(env, refreshToken);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const secure = attributsCookie(request);

    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.SESSION_SECRET || !env.ENCRYPTION_KEY) {
      if (url.pathname.startsWith("/auth/") || url.pathname.startsWith("/api/")) {
        return avecEntetesSecurite(
          reponseTexte(500, "Application non configuree (secrets manquants). Voir README.md.")
        );
      }
    }

    try {
      if (url.pathname === "/auth/google/start") {
        const state = base64urlFromBytes(crypto.getRandomValues(new Uint8Array(24)));
        const redirectUri = `${url.origin}/auth/google/callback`;
        const reponse = redirection(urlAutorisationGoogle(env, redirectUri, state));
        reponse.headers.append("Set-Cookie", `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/${secure}`);
        return avecEntetesSecurite(reponse);
      }

      if (url.pathname === "/auth/google/callback") {
        const erreurGoogle = url.searchParams.get("error");
        if (erreurGoogle) return avecEntetesSecurite(reponseTexte(400, `Connexion Google annulee (${erreurGoogle}).`));

        const code = url.searchParams.get("code");
        const stateRecu = url.searchParams.get("state");
        const stateCookie = lireCookie(request, "oauth_state");
        if (!code || !stateRecu || !stateCookie || stateRecu !== stateCookie) {
          return avecEntetesSecurite(reponseTexte(400, "Requete de connexion invalide ou expiree. Reessayez depuis la page d'accueil."));
        }

        const redirectUri = `${url.origin}/auth/google/callback`;
        const jetons = await echangerCodeContreJetons(env, code, redirectUri);
        if (!jetons.refresh_token) {
          return avecEntetesSecurite(
            reponseTexte(
              400,
              "Google n'a pas fourni d'acces permanent a l'agenda. Retirez l'acces existant sur " +
                "myaccount.google.com/permissions puis reessayez la connexion."
            )
          );
        }
        const profil = await obtenirProfil(jetons.access_token);
        const refreshChiffre = await chiffrer(env, jetons.refresh_token);

        await env.DB.prepare(
          `INSERT INTO utilisateurs (google_sub, email, nom, refresh_token_chiffre, maj_le)
           VALUES (?1, ?2, ?3, ?4, datetime('now'))
           ON CONFLICT(google_sub) DO UPDATE SET
             email = excluded.email, nom = excluded.nom,
             refresh_token_chiffre = excluded.refresh_token_chiffre, maj_le = datetime('now')`
        )
          .bind(profil.sub, profil.email, profil.name || profil.email, refreshChiffre)
          .run();

        const ligne = await env.DB.prepare("SELECT id FROM utilisateurs WHERE google_sub = ?1").bind(profil.sub).first();
        const cookieSession = await creerCookieSession(env, { uid: ligne.id });

        const reponse = redirection("/app");
        reponse.headers.append("Set-Cookie", `session=${cookieSession}; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/${secure}`);
        reponse.headers.append("Set-Cookie", `oauth_state=; Max-Age=0; Path=/${secure}`);
        return avecEntetesSecurite(reponse);
      }

      if (url.pathname === "/auth/logout") {
        const reponse = redirection("/");
        reponse.headers.append("Set-Cookie", `session=; Max-Age=0; Path=/${secure}`);
        return avecEntetesSecurite(reponse);
      }

      if (url.pathname === "/api/me") {
        const utilisateur = await utilisateurConnecte(request, env);
        if (!utilisateur) return avecEntetesSecurite(reponseJson(401, { ok: false, error: "Non connecte" }));
        return avecEntetesSecurite(
          reponseJson(200, { ok: true, email: utilisateur.email, nom: utilisateur.nom, calendarId: utilisateur.calendar_id })
        );
      }

      if (url.pathname === "/api/calendars") {
        const utilisateur = await utilisateurConnecte(request, env);
        if (!utilisateur) return avecEntetesSecurite(reponseJson(401, { ok: false, error: "Non connecte" }));
        try {
          const accessToken = await jetonAccesPour(env, utilisateur);
          const calendriers = await listerCalendriers(accessToken);
          return avecEntetesSecurite(reponseJson(200, { ok: true, calendriers }));
        } catch (e) {
          return avecEntetesSecurite(reponseJson(502, { ok: false, error: "Impossible de recuperer vos calendriers Google." }));
        }
      }

      if (url.pathname === "/api/calendar-choice" && request.method === "POST") {
        const utilisateur = await utilisateurConnecte(request, env);
        if (!utilisateur) return avecEntetesSecurite(reponseJson(401, { ok: false, error: "Non connecte" }));
        let corps;
        try {
          corps = await request.json();
        } catch {
          return avecEntetesSecurite(reponseJson(400, { ok: false, error: "JSON invalide" }));
        }
        const calendarId = typeof corps.calendarId === "string" ? corps.calendarId.trim().slice(0, 300) : "";
        if (!calendarId) return avecEntetesSecurite(reponseJson(400, { ok: false, error: "calendarId manquant" }));
        await env.DB.prepare("UPDATE utilisateurs SET calendar_id = ?1, maj_le = datetime('now') WHERE id = ?2")
          .bind(calendarId, utilisateur.id)
          .run();
        return avecEntetesSecurite(reponseJson(200, { ok: true }));
      }

      if (url.pathname === "/api/feuille-de-route") {
        const utilisateur = await utilisateurConnecte(request, env);
        if (!utilisateur) return avecEntetesSecurite(reponseJson(401, { ok: false, error: "Non connecte" }));
        const date = url.searchParams.get("date") || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return avecEntetesSecurite(reponseJson(400, { ok: false, error: "Parametre date invalide (AAAA-MM-JJ attendu)" }));
        }
        try {
          const accessToken = await jetonAccesPour(env, utilisateur);
          const evenements = await listerEvenementsDuJour(accessToken, utilisateur.calendar_id || "primary", date);
          const courses = evenements.map(analyserEvenement);
          return avecEntetesSecurite(reponseJson(200, { ok: true, date, courses }));
        } catch (e) {
          return avecEntetesSecurite(
            reponseJson(502, { ok: false, error: "Impossible de recuperer votre agenda Google pour cette date." })
          );
        }
      }

      return avecEntetesSecurite(await env.ASSETS.fetch(request));
    } catch (e) {
      return avecEntetesSecurite(reponseTexte(500, "Erreur interne : " + String(e && e.message ? e.message : e)));
    }
  },
};
