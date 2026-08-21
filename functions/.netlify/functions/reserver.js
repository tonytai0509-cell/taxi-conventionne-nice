// Fonction Cloudflare Pages equivalente a netlify/functions/reserver.js,
// meme logique metier (creation d'un evenement Google Agenda + envoi d'un
// e-mail de confirmation Resend), portee pour tourner sur le runtime
// Workers (Web Crypto API) au lieu du runtime Node de Netlify.
//
// Le chemin de ce fichier (functions/.netlify/functions/reserver.js) est
// volontairement identique a l'URL utilisee par le frontend
// (/.netlify/functions/reserver, voir js/main.js) : ca permet de migrer
// l'hebergement sans toucher au front, uniquement en changeant le DNS.
//
// Variables d'environnement requises (memes noms que sur Netlify, a
// configurer dans Cloudflare Pages > Settings > Environment variables) :
//   GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_ID
//   RESEND_API_KEY, EMAIL_DESTINATAIRE
//
// Aucune dependance npm : le JWT du compte de service Google est signe a la
// main avec la Web Crypto API (crypto.subtle, disponible nativement dans le
// runtime Workers), et les appels HTTP passent par fetch.

// Retire les retours a la ligne / caracteres de controle d'un champ texte
// libre avant de l'inserer dans le titre ou la description de l'evenement
// (empeche un visiteur malveillant d'injecter de fausses lignes "REF :",
// "TEL :", etc. via un champ comme le nom ou la destination) et le tronque
// a une longueur raisonnable.
function nettoyerTexte(valeur, longueurMax) {
  if (typeof valeur !== "string") return "";
  return valeur.replace(/[\r\n\t\x00-\x1f\x7f]+/g, " ").trim().slice(0, longueurMax);
}

function toBase64Url(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return toBase64Url(btoa(binary));
}

function base64urlFromBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return toBase64Url(btoa(binary));
}

function pemToArrayBuffer(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function obtenirJetonGoogle(serviceAccountJson) {
  const creds = JSON.parse(serviceAccountJson);
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = { alg: "RS256", typ: "JWT" };
  const revendications = {
    iss: creds.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    exp: maintenant + 3600,
    iat: maintenant,
  };
  const aSigner = base64urlFromString(JSON.stringify(entete)) + "." + base64urlFromString(JSON.stringify(revendications));

  const cle = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(creds.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cle,
    new TextEncoder().encode(aSigner)
  );
  const signature = base64urlFromBytes(new Uint8Array(signatureBuffer));
  const jwt = aSigner + "." + signature;

  const reponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await reponse.json();
  if (!reponse.ok) throw new Error("Authentification Google echouee : " + JSON.stringify(data));
  return data.access_token;
}

function genererReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function creerEvenementAgenda(env, donnees, reference) {
  const calendarId = env.GOOGLE_CALENDAR_ID;
  const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!calendarId || !serviceAccountJson) {
    return { ok: false, error: "Agenda non configure (variables manquantes sur Cloudflare Pages)" };
  }

  const typeTag = donnees.type === "medical" ? "[MED]" : "[PRIVE]";
  const telephone = donnees.telephone || "(non renseigne)";
  const heurePriseEnCharge = donnees.heurePc || donnees.heureRdv;
  const heureAff = heurePriseEnCharge.replace(":", "h");
  const heureRdvAff = donnees.heureRdv || heurePriseEnCharge;

  const titre = (
    `PC ${heureAff} M. ${donnees.nom} | ` +
    `PC : ${donnees.priseEnCharge} | ` +
    `DEST : ${donnees.destination} | ` +
    `RDV : ${heureRdvAff} ${typeTag} | ` +
    `TEL : ${telephone} | REF : ${reference}` +
    (donnees.accompagnant ? " [ACCOMPAGNANT]" : "") +
    (donnees.btoRetour ? " [BT AU RETOUR]" : "")
  ).toUpperCase();

  const description = (
    `REF : ${reference}\n` +
    `PC : ${donnees.priseEnCharge}\n` +
    `DEST : ${donnees.destination}\n` +
    `RDV : ${heureRdvAff} ${typeTag}\n` +
    `TEL : ${telephone}\n` +
    `SOURCE : RESERVATION EN LIGNE (CLIENT) - TAXI-CONVENTIONNE06.FR` +
    (donnees.accompagnant ? "\nACCOMPAGNANT : OUI" : "") +
    (donnees.btoRetour ? "\nBT : AU RETOUR UNIQUEMENT" : "")
  ).toUpperCase();

  const [h, m] = heurePriseEnCharge.split(":").map(Number);
  const debut = `${donnees.date}T${heurePriseEnCharge}:00`;
  const finH = (h + 1) % 24;
  const fin = `${donnees.date}T${String(finH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

  try {
    const accessToken = await obtenirJetonGoogle(serviceAccountJson);
    const evenement = {
      summary: titre,
      description: description,
      start: { dateTime: debut, timeZone: "Europe/Paris" },
      end: { dateTime: fin, timeZone: "Europe/Paris" },
      colorId: "5",
    };
    const reponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(evenement),
      }
    );
    const data = await reponse.json();
    if (!reponse.ok) return { ok: false, error: JSON.stringify(data) };
    return { ok: true, lien: data.htmlLink };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

async function envoyerEmailConfirmation(env, donnees, reference) {
  const apiKey = env.RESEND_API_KEY;
  const destinataire = env.EMAIL_DESTINATAIRE;
  if (!apiKey || !destinataire) {
    return { ok: false, error: "Email non configure (variables manquantes sur Cloudflare Pages)" };
  }

  const typeLabel = donnees.type === "medical" ? "MEDICAL" : "PRIVE";
  const heurePriseEnCharge = donnees.heurePc || donnees.heureRdv;

  const corps =
    `Nouvelle reservation EN LIGNE confirmee (taxi-conventionne06.fr)\n\n` +
    `Reference : ${reference}\n` +
    `Type : ${typeLabel}\n` +
    `Nom : ${donnees.nom}\n` +
    `Telephone : ${donnees.telephone || "(non renseigne)"}\n` +
    `Prise en charge : ${heurePriseEnCharge.replace(":", "h")} - ${donnees.priseEnCharge}\n` +
    `Destination : ${donnees.destination}\n` +
    (donnees.accompagnant ? `Accompagnant : oui\n` : "") +
    (donnees.btoRetour ? `Bon de transport au retour : oui\n` : "");

  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Centrale Taxi Nice <onboarding@resend.dev>",
        to: [destinataire],
        subject: `Reservation en ligne - ${donnees.nom} - Ref ${reference}`,
        text: corps,
      }),
    });
    if (!reponse.ok) {
      const texte = await reponse.text();
      return { ok: false, error: `Statut ${reponse.status} : ${texte.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

const CHAMPS_TEXTE_MAX = 120;
const TELEPHONE_MAX = 30;
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HEURE = /^\d{2}:\d{2}$/;
const REGEX_TELEPHONE = /^[0-9+()\s.-]{4,30}$/;

export async function onRequestPost(context) {
  const { request, env } = context;

  const texteBrut = await request.text();
  // Corps limite a 20 Ko : un formulaire de reservation legitime tient tres
  // largement dedans, ca coupe court aux payloads abusifs avant meme le parsing.
  if (texteBrut.length > 20000) {
    return jsonResponse(413, { ok: false, error: "Requete trop volumineuse" });
  }

  let body;
  try {
    body = JSON.parse(texteBrut || "{}");
  } catch (e) {
    return jsonResponse(400, { ok: false, error: "JSON invalide" });
  }
  if (!body || typeof body !== "object") {
    return jsonResponse(400, { ok: false, error: "Requete invalide" });
  }

  // Piege a robots : champ invisible pour un humain, rempli automatiquement
  // par la plupart des bots de spam. On repond un faux succes pour ne pas
  // les inciter a s'adapter, sans creer ni evenement ni e-mail.
  if (typeof body.siteWeb === "string" && body.siteWeb.trim() !== "") {
    return jsonResponse(200, { ok: true, reference: genererReference(), agenda: { ok: true }, email: { ok: true } });
  }

  const champsTexte = ["prenom", "nom", "telephone", "priseEnCharge", "destination", "date", "heureRdv", "heurePc"];
  for (const champ of champsTexte) {
    if (body[champ] !== undefined && typeof body[champ] !== "string") {
      return jsonResponse(400, { ok: false, error: `Champ ${champ} invalide` });
    }
  }

  const nom = nettoyerTexte([body.prenom, body.nom].filter(Boolean).join(" "), CHAMPS_TEXTE_MAX);
  const telephone = nettoyerTexte(body.telephone, TELEPHONE_MAX);
  const priseEnCharge = nettoyerTexte(body.priseEnCharge, CHAMPS_TEXTE_MAX);
  const destination = nettoyerTexte(body.destination, CHAMPS_TEXTE_MAX);
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const heureRdv = typeof body.heureRdv === "string" ? body.heureRdv.trim() : "";
  const heurePc = typeof body.heurePc === "string" ? body.heurePc.trim() : "";
  const heurePriseEnCharge = heurePc || heureRdv;

  if (!nom || !telephone || !priseEnCharge || !destination || !date || !heurePriseEnCharge) {
    return jsonResponse(400, { ok: false, error: "Champs obligatoires manquants" });
  }
  if (!REGEX_TELEPHONE.test(telephone)) {
    return jsonResponse(400, { ok: false, error: "Telephone invalide" });
  }
  if (!REGEX_DATE.test(date)) {
    return jsonResponse(400, { ok: false, error: "Date invalide" });
  }
  if (!REGEX_HEURE.test(heurePriseEnCharge) || (heureRdv && !REGEX_HEURE.test(heureRdv))) {
    return jsonResponse(400, { ok: false, error: "Heure invalide" });
  }

  const reference = genererReference();
  const donnees = {
    nom,
    telephone,
    type: body.typeCourse === "medical" ? "medical" : "prive",
    priseEnCharge,
    destination,
    date,
    heureRdv,
    heurePc,
    accompagnant: !!body.accompagnant,
    btoRetour: !!body.btoRetour,
  };

  const [resultatAgenda, resultatEmail] = await Promise.all([
    creerEvenementAgenda(env, donnees, reference),
    envoyerEmailConfirmation(env, donnees, reference),
  ]);

  return jsonResponse(200, { ok: true, reference, agenda: resultatAgenda, email: resultatEmail });
}

function jsonResponse(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}
