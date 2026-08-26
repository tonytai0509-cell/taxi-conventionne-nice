// Le refresh token Google donne un acces permanent (jusqu'a revocation) au
// calendrier d'un chauffeur : on ne le stocke jamais en clair dans D1,
// seulement chiffre avec AES-GCM. La cle (ENCRYPTION_KEY) n'existe que dans
// les secrets du Worker, jamais en base.

import { base64urlFromBytes, base64urlToBytes, base64StandardToBytes } from "./codage.js";

async function importerCleAes(env) {
  return crypto.subtle.importKey("raw", base64StandardToBytes(env.ENCRYPTION_KEY), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function chiffrer(env, texteClair) {
  const cle = await importerCleAes(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chiffre = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, new TextEncoder().encode(texteClair));
  return `${base64urlFromBytes(iv)}.${base64urlFromBytes(new Uint8Array(chiffre))}`;
}

export async function dechiffrer(env, valeur) {
  const [ivB64, donneesB64] = valeur.split(".");
  const cle = await importerCleAes(env);
  const clair = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlToBytes(ivB64) },
    cle,
    base64urlToBytes(donneesB64)
  );
  return new TextDecoder().decode(clair);
}
