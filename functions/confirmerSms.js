// Confirmation SMS au client depuis le mail de reservation, envoyee par le
// telephone relais de la centrale (SMS Gateway, memes identifiants que
// l'appli et Railway : SMS_GATEWAY_USERNAME / SMS_GATEWAY_PASSWORD).
//
// Le lien du mail est signe (HMAC avec le mot de passe du relais : personne
// d'autre ne peut fabriquer un lien qui envoie un SMS) et n'envoie rien tout
// seul : il ouvre une page avec un bouton « Envoyer » (POST), car Gmail et
// les antivirus ouvrent parfois les liens des mails pour les verifier.

export const CHEMIN_CONFIRMER_SMS = "/confirmer-sms";
const VALIDITE_MS = 30 * 24 * 3600 * 1000;

export function relaisConfigure(env) {
  return !!(env.SMS_GATEWAY_USERNAME && env.SMS_GATEWAY_PASSWORD);
}

function b64url(octets) {
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function depuisB64url(texte) {
  const s = atob(texte.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function signer(env, donnees) {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode("confirmer-sms:" + env.SMS_GATEWAY_PASSWORD), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", cle, new TextEncoder().encode(donnees))));
}

export async function lienConfirmationSms(env, origine, telephone, message) {
  const charge = b64url(new TextEncoder().encode(JSON.stringify({ t: telephone, m: message, x: Date.now() + VALIDITE_MS })));
  return `${origine}${CHEMIN_CONFIRMER_SMS}?d=${charge}&s=${await signer(env, charge)}`;
}

async function lireLien(env, url) {
  const d = url.searchParams.get("d") || "";
  const s = url.searchParams.get("s") || "";
  if (!d || !s || !relaisConfigure(env)) return null;
  if ((await signer(env, d)) !== s) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(depuisB64url(d)));
    if (!c.t || !c.m || !(c.x > Date.now())) return null;
    return c;
  } catch (e) {
    return null;
  }
}

function versInternational(numero) {
  const brut = String(numero || "").replace(/[^0-9+]/g, "");
  if (brut.startsWith("+")) return brut;
  if (brut.startsWith("0") && brut.length === 10) return "+33" + brut.slice(1);
  if (brut.startsWith("33")) return "+" + brut;
  return brut;
}

function echapper(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function page(titre, corps, statut = 200) {
  return new Response(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${echapper(titre)}</title><link rel="stylesheet" href="/css/style.css"></head>
<body><main class="section confirmer-sms"><div class="container">${corps}</div></main></body></html>`,
    { status: statut, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function pageConfirmerSms(request, env) {
  const url = new URL(request.url);
  const lien = await lireLien(env, url);
  if (!lien) {
    return page("Lien invalide", `<h2>Lien invalide ou expiré</h2><p>Ce lien de confirmation n'est plus valable. Confirmez le client directement par téléphone ou par SMS.</p>`, 403);
  }
  if (request.method === "POST") {
    const identifiants = btoa(`${env.SMS_GATEWAY_USERNAME}:${env.SMS_GATEWAY_PASSWORD}`);
    try {
      const r = await fetch("https://api.sms-gate.app/3rdparty/v1/messages?skipPhoneValidation=true", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${identifiants}` },
        body: JSON.stringify({ textMessage: { text: lien.m }, phoneNumbers: [versInternational(lien.t)], priority: 100 }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) {
        const detail = r.status === 401 ? "identifiants du relais refusés" : `erreur ${r.status}`;
        return page("Envoi impossible", `<h2>❌ SMS non envoyé</h2><p>Le téléphone relais a refusé l'envoi (${echapper(detail)}). Vérifiez qu'il est allumé et connecté, puis réessayez.</p>`, 502);
      }
    } catch (e) {
      return page("Envoi impossible", `<h2>❌ SMS non envoyé</h2><p>Le téléphone relais ne répond pas. Vérifiez qu'il est allumé et connecté, puis réessayez.</p>`, 502);
    }
    return page("SMS envoyé", `<h2>✅ Confirmation envoyée</h2><p>Le SMS part du téléphone relais vers le <strong>${echapper(lien.t)}</strong>.</p><p class="confirmer-sms-message">${echapper(lien.m).replace(/\n/g, "<br>")}</p>`);
  }
  return page(
    "Confirmer au client",
    `<h2>Confirmer la réservation par SMS</h2>
<p>Le SMS suivant sera envoyé par le téléphone relais au <strong>${echapper(lien.t)}</strong> :</p>
<p class="confirmer-sms-message">${echapper(lien.m).replace(/\n/g, "<br>")}</p>
<form method="post"><button class="btn confirmer-sms-bouton" type="submit">✅ Envoyer le SMS</button></form>`
  );
}
