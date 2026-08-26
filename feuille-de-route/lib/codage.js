// Utilitaires d'encodage partages par les autres modules (cookies de
// session, chiffrement des jetons Google) : Web Crypto ne manipule que des
// ArrayBuffer/Uint8Array, ces fonctions font l'aller-retour avec du texte et
// du base64url (sans + / = , donc utilisable tel quel dans un cookie).

export function base64urlFromBytes(octets) {
  let binaire = "";
  for (let i = 0; i < octets.length; i++) binaire += String.fromCharCode(octets[i]);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlFromString(texte) {
  return base64urlFromBytes(new TextEncoder().encode(texte));
}

export function base64urlToBytes(valeur) {
  const complet = valeur.replace(/-/g, "+").replace(/_/g, "/");
  const b64 = complet.padEnd(complet.length + ((4 - (complet.length % 4)) % 4), "=");
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export function base64urlToString(valeur) {
  return new TextDecoder().decode(base64urlToBytes(valeur));
}

// La cle de chiffrement (ENCRYPTION_KEY) est fournie par l'administrateur au
// format base64 standard, tel que produit par `openssl rand -base64 32`.
export function base64StandardToBytes(b64) {
  const binaire = atob(b64.trim());
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}
