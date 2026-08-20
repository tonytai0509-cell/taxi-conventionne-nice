// Fonction serverless Netlify appelee par le formulaire de reservation du
// site. Reproduit exactement la logique deja utilisee par reservation_web.py
// (meme depot GitHub sms-reservation) : creation d'un evenement dans le
// Google Agenda de la centrale (meme format de titre/description que le bot
// SMS et la page de reservation medicale) et envoi d'un e-mail de
// confirmation via Resend. Variables d'environnement requises (memes noms
// et memes valeurs que sur Railway pour sms-reservation) :
//   GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_CALENDAR_ID
//   RESEND_API_KEY, EMAIL_DESTINATAIRE
//
// Aucune dependance npm : le JWT du compte de service Google est signe a la
// main avec le module "crypto" integre a Node, et les appels HTTP passent
// par fetch (disponible nativement dans le runtime Node des fonctions
// Netlify).

const crypto = require("crypto");

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  const aSigner = base64url(JSON.stringify(entete)) + "." + base64url(JSON.stringify(revendications));
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(aSigner), creds.private_key)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

async function creerEvenementAgenda(donnees, reference) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!calendarId || !serviceAccountJson) {
    return { ok: false, error: "Agenda non configure (variables manquantes sur Netlify)" };
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
      // Meme colorId (5, jaune) que le bot SMS et la page medicale, pour
      // reconnaitre d'un coup d'oeil les reservations automatiques.
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

async function envoyerEmailConfirmation(donnees, reference) {
  const apiKey = process.env.RESEND_API_KEY;
  const destinataire = process.env.EMAIL_DESTINATAIRE;
  if (!apiKey || !destinataire) {
    return { ok: false, error: "Email non configure (variables manquantes sur Netlify)" };
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

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: "Methode non autorisee" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: "JSON invalide" }) };
  }

  const nom = [body.prenom, body.nom].filter(Boolean).join(" ").trim();
  const heurePriseEnCharge = body.heurePc || body.heureRdv;
  if (!nom || !body.telephone || !body.priseEnCharge || !body.destination || !body.date || !heurePriseEnCharge) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: "Champs obligatoires manquants" }),
    };
  }

  const reference = genererReference();
  const donnees = {
    nom,
    telephone: body.telephone,
    type: body.typeCourse === "medical" ? "medical" : "prive",
    priseEnCharge: body.priseEnCharge,
    destination: body.destination,
    date: body.date,
    heureRdv: body.heureRdv || "",
    heurePc: body.heurePc || "",
    accompagnant: !!body.accompagnant,
    btoRetour: !!body.btoRetour,
  };

  const [resultatAgenda, resultatEmail] = await Promise.all([
    creerEvenementAgenda(donnees, reference),
    envoyerEmailConfirmation(donnees, reference),
  ]);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, reference, agenda: resultatAgenda, email: resultatEmail }),
  };
};
