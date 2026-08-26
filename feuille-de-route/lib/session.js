// Cookie de session sans etat cote serveur : la charge (id utilisateur +
// expiration) est signee avec SESSION_SECRET (HMAC-SHA256) pour empecher un
// visiteur de forger ou modifier son propre cookie. Rien de sensible n'y
// est stocke : le jeton Google reste chiffre en base D1, jamais dans le
// cookie envoye au navigateur.

import { base64urlFromBytes, base64urlFromString, base64urlToBytes, base64urlToString } from "./codage.js";

async function importerCleHmac(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function creerCookieSession(env, charge, dureeSec = 60 * 60 * 24 * 30) {
  const donnees = { ...charge, exp: Math.floor(Date.now() / 1000) + dureeSec };
  const corps = base64urlFromString(JSON.stringify(donnees));
  const cle = await importerCleHmac(env.SESSION_SECRET);
  const signature = await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(corps));
  return `${corps}.${base64urlFromBytes(new Uint8Array(signature))}`;
}

export async function verifierCookieSession(env, valeur) {
  if (!valeur) return null;
  const [corps, signature] = valeur.split(".");
  if (!corps || !signature) return null;
  try {
    const cle = await importerCleHmac(env.SESSION_SECRET);
    // crypto.subtle.verify fait une comparaison a temps constant : on evite
    // ainsi une attaque par mesure de timing sur la signature.
    const valide = await crypto.subtle.verify(
      "HMAC",
      cle,
      base64urlToBytes(signature),
      new TextEncoder().encode(corps)
    );
    if (!valide) return null;
    const donnees = JSON.parse(base64urlToString(corps));
    if (!donnees.exp || donnees.exp < Math.floor(Date.now() / 1000)) return null;
    return donnees;
  } catch {
    return null;
  }
}

export function lireCookie(request, nom) {
  const entete = request.headers.get("Cookie") || "";
  const paire = entete
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(nom + "="));
  return paire ? decodeURIComponent(paire.slice(nom.length + 1)) : null;
}
