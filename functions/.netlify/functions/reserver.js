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
// Optionnelle :
//   EASYTAXI_LIEN_RESERVATION : lien de reservation du chauffeur dans l'appli
//   EasyTaxi (https://app.easytaxi-app.fr/r/...). Renseigne, la reservation
//   arrive directement sur son planning de l'appli (et non plus dans Google
//   Agenda) ; si l'appli ne repond pas, retour a Google Agenda.
//
// Aucune dependance npm : le JWT du compte de service Google est signe a la
// main avec la Web Crypto API (crypto.subtle, disponible nativement dans le
// runtime Workers), et les appels HTTP passent par fetch.

// Retire les retours a la ligne / caracteres de controle d'un champ texte
// libre avant de l'inserer dans le titre ou la description de l'evenement
// (empeche un visiteur malveillant d'injecter de fausses lignes "REF :",
// "TEL :", etc. via un champ comme le nom ou la destination) et le tronque
// a une longueur raisonnable.
import { relaisConfigure, lienConfirmationSms } from "../../confirmerSms.js";
import { origineReservation, ajouterReservationAds, ajouterMaCourse } from "../../partenaires.js";

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
    (donnees.pcADefinir ? "PC A DEFINIR (RDV " + heureRdvAff + ") " : "") +
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
    (donnees.pcCalculee ? `\nHEURE DE PC CALCULEE AUTOMATIQUEMENT (TRAJET ~${donnees.dureeTrajet} MIN + MARGE)` : "") +
    (donnees.pcADefinir ? "\nHEURE DE PC A DEFINIR : LE CLIENT A DEMANDE LE CALCUL, TRAJET NON TROUVE" : "") +
    (donnees.accompagnant ? "\nACCOMPAGNANT : OUI" : "") +
    (donnees.btoRetour ? "\nBT : AU RETOUR UNIQUEMENT" : "") +
    (donnees.telephone2 ? `\nTEL 2 : ${donnees.telephone2}` : "") +
    (donnees.reservePar ? `\nRESERVE PAR : ${donnees.reservePar}${donnees.telReservant ? " - " + donnees.telReservant : ""}` : "") +
    (donnees.commentaire ? `\nCOMMENTAIRE : ${donnees.commentaire}` : "")
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

// Gabarit HTML du mail de reservation (styles en ligne, tableaux : lisible dans Gmail).
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function echapper(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function dateLongue(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const jour = JOURS[d.getUTCDay()];
  return `${jour.charAt(0).toUpperCase() + jour.slice(1)} ${j} ${MOIS[m - 1]} ${a}`;
}

function dateCourte(iso) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  return `${JOURS[d.getUTCDay()].slice(0, 3).replace(/^./, (c) => c.toUpperCase())}. ${String(j).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function mailReservationHtml(d, reference, lienRelais = null) {
  const heurePc = d.pcADefinir ? "à définir" : (d.heurePc || d.heureRdv).replace(":", "h");
  const heureRdv = d.heureRdv && d.heurePc && d.heureRdv !== d.heurePc ? d.heureRdv.replace(":", "h") : null;
  const noteCalcul = d.pcCalculee
    ? `Heure calculée automatiquement : trajet d'environ ${d.dureeTrajet} min + marge de sécurité. Vérifiez-la avant de confirmer.`
    : d.pcADefinir
      ? "Le client a demandé le calcul automatique mais le trajet n'a pas été trouvé : choisissez l'heure de prise en charge (course placée 1 h avant le RDV dans l'agenda)."
      : "";
  const tel = String(d.telephone || "").replace(/[^0-9+]/g, "");
  // Meme SMS que le bouton « Confirmer par SMS » de l'appli (EcranReserver.kt).
  const nomFamille = String(d.nom || "").trim().split(/\s+/).slice(1).join(" ");
  const [, moisSms, jourSms] = d.date.split("-");
  const texteSms = d.pcCalculee || d.pcADefinir
    ? `Bonjour${nomFamille ? " M. " + nomFamille : ""}, votre réservation du ${jourSms}/${moisSms} est bien confirmée : prise en charge à ${d.pcADefinir ? "XXhXX" : heurePc} pour votre rendez-vous de ${String(d.heureRdv).replace(":", "h")}. À bientôt !\n\nCentrale Taxi Nice`
    : `Bonjour${nomFamille ? " M. " + nomFamille : ""}, votre réservation du ${jourSms}/${moisSms} à ${heurePc} est bien confirmée, à bientôt !\n\nCentrale Taxi Nice`;
  const lienSms = d.pcADefinir ? null : lienRelais || (tel ? `sms:${tel}?body=${encodeURIComponent(texteSms)}` : null);
  const itineraire = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(d.priseEnCharge)}&destination=${encodeURIComponent(d.destination)}`;
  const ligne = (libelle, valeur) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #EEE7D6;color:#8A7A55;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;width:120px;vertical-align:top">${libelle}</td>` +
    `<td style="padding:10px 0;border-bottom:1px solid #EEE7D6;color:#0B1F3A;font-size:15px;font-weight:600">${valeur}</td></tr>`;
  const pastille = (texte, fond, encre) =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 12px;border-radius:999px;background:${fond};color:${encre};font-size:12px;font-weight:800">${texte}</span>`;
  const options = [
    d.origine === "ads" ? pastille("🎯 GOOGLE ADS · espace partenaires", "#1D4ED8", "#FFFFFF") : "",
    d.origine === "qr" ? pastille("🔳 QR code / vos cartes", "#F1F1F1", "#444") : "",
    d.origine === "client_tony" ? pastille("⭐ Votre client (via Google Ads)", "#FFF4DE", "#9A6A00") : "",
    d.type === "medical" ? pastille("🏥 Transport médical", "#E6EEF9", "#1D4ED8") : pastille("🚕 Course privée", "#F1F1F1", "#444"),
    d.accompagnant ? pastille("👥 Accompagnant", "#FFF4DE", "#9A6A00") : "",
    d.btoRetour ? pastille("📄 Bon de transport au retour", "#FFF4DE", "#9A6A00") : "",
  ].join("");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:20px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;overflow:hidden">
  <tr><td style="background:#0B1F3A;padding:20px 24px">
    <div style="color:#D7AE55;font-size:12px;font-weight:800;letter-spacing:.14em">CENTRALE TAXI NICE</div>
    <div style="color:#FFFFFF;font-size:20px;font-weight:800;margin-top:4px">Nouvelle réservation en ligne</div>
  </td></tr>
  <tr><td style="padding:22px 24px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF6EA;border:1px solid #E9D9AE;border-radius:14px"><tr>
      <td style="padding:16px 18px">
        <div style="color:#8A7A55;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase">📅 Date de la course</div>
        <div style="color:#0B1F3A;font-size:22px;font-weight:800;margin-top:4px">${echapper(dateLongue(d.date))}</div>
        <div style="margin-top:10px">
          <span style="display:inline-block;padding:8px 14px;border-radius:10px;background:#0B1F3A;color:#FFFFFF;font-size:18px;font-weight:800">🕐 Prise en charge ${echapper(heurePc)}</span>
          ${heureRdv ? `<span style="display:inline-block;margin-left:6px;padding:8px 12px;border-radius:10px;background:#FFFFFF;border:1px solid #E9D9AE;color:#0B1F3A;font-size:14px;font-weight:700">RDV ${echapper(heureRdv)}</span>` : ""}
          ${noteCalcul ? `<div style="margin-top:10px;padding:8px 12px;border-radius:10px;background:${d.pcADefinir ? "#FDECEA" : "#FFF4DE"};color:${d.pcADefinir ? "#A3271E" : "#9A6A00"};font-size:13px;font-weight:700">⚙️ ${echapper(noteCalcul)}</div>` : ""}
        </div>
      </td></tr></table>
  </td></tr>
  <tr><td style="padding:12px 24px 0">${options}</td></tr>
  <tr><td style="padding:4px 24px 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${ligne("Patient", echapper(d.nom))}
      ${ligne("Téléphone", tel ? `<a href="tel:${echapper(tel)}" style="color:#0B1F3A;text-decoration:none">${echapper(d.telephone)}</a>` : "Non renseigné")}
      ${ligne("Départ", "📍 " + echapper(d.priseEnCharge))}
      ${ligne("Destination", "🏁 " + echapper(d.destination))}
      ${d.telephone2 ? ligne("Autre numéro", `<a href="tel:${echapper(String(d.telephone2).replace(/[^0-9+]/g, ""))}" style="color:#0B1F3A;text-decoration:none">${echapper(d.telephone2)}</a>`) : ""}
      ${d.reservePar ? ligne("Réservé par", echapper(d.reservePar) + (d.telReservant ? ` · <a href="tel:${echapper(String(d.telReservant).replace(/[^0-9+]/g, ""))}" style="color:#0B1F3A;text-decoration:none">${echapper(d.telReservant)}</a>` : "")) : ""}
      ${d.commentaire ? ligne("Commentaire", echapper(d.commentaire)) : ""}
    </table>
  </td></tr>
  <tr><td style="padding:10px 24px 22px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${tel ? `<td width="50%" style="padding-right:6px"><a href="tel:${echapper(tel)}" style="display:block;text-align:center;padding:13px 0;border-radius:12px;background:#D7AE55;color:#0B1F3A;font-size:15px;font-weight:800;text-decoration:none">📞 Appeler</a></td>` : ""}
      <td width="50%" style="padding-left:6px"><a href="${echapper(itineraire)}" style="display:block;text-align:center;padding:13px 0;border-radius:12px;background:#0B1F3A;color:#FFFFFF;font-size:15px;font-weight:800;text-decoration:none">🗺️ Itinéraire</a></td>
    </tr></table>
  </td></tr>
  ${lienSms ? `<tr><td style="padding:0 24px 22px"><a href="${echapper(lienSms)}" style="display:block;text-align:center;padding:15px 0;border-radius:12px;background:#1E8E3E;color:#FFFFFF;font-size:16px;font-weight:800;text-decoration:none">✅ Confirmer au client par SMS</a>
    <div style="margin-top:8px;color:#8A8A8A;font-size:12px;text-align:center">${lienRelais ? "Envoyé par le téléphone relais après validation" : "Ouvre vos SMS avec le message prêt"} : « ${echapper(texteSms.split("\n")[0])} »</div></td></tr>` : ""}
  <tr><td style="background:#FBF8F1;padding:14px 24px;color:#8A8A8A;font-size:12px">Réf. <b style="color:#0B1F3A">${echapper(reference)}</b> · reçue via taxi-conventionne06.fr</td></tr>
</table></td></tr></table></body></html>`;
}

// Lien « Confirmer au client par SMS » via le telephone relais (si configure).
async function lienRelaisSms(env, d) {
  if (!relaisConfigure(env) || !d.telephone) return null;
  const nomFamille = String(d.nom || "").trim().split(/\s+/).slice(1).join(" ");
  const [, mois, jour] = d.date.split("-");
  const heure = (d.heurePc || d.heureRdv).replace(":", "h");
  if (d.pcADefinir) return null;
  const texte = d.pcCalculee
    ? `Bonjour${nomFamille ? " M. " + nomFamille : ""}, votre réservation du ${jour}/${mois} est bien confirmée : prise en charge à ${heure} pour votre rendez-vous de ${String(d.heureRdv).replace(":", "h")}. À bientôt !\n\nCentrale Taxi Nice`
    : `Bonjour${nomFamille ? " M. " + nomFamille : ""}, votre réservation du ${jour}/${mois} à ${heure} est bien confirmée, à bientôt !\n\nCentrale Taxi Nice`;
  return lienConfirmationSms(env, "https://taxi-conventionne06.fr", d.telephone, texte);
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
    `Nouvelle reservation en ligne (taxi-conventionne06.fr)\n\n` +
    `Date : ${dateLongue(donnees.date)}\n` +
    `Prise en charge : ${donnees.pcADefinir ? "A DEFINIR" : heurePriseEnCharge.replace(":", "h")}` + (donnees.heureRdv && donnees.heurePc ? ` (RDV ${donnees.heureRdv.replace(":", "h")})` : "") + (donnees.pcCalculee ? " - calculee automatiquement" : "") + `\n` +
    `Type : ${typeLabel}\n` +
    `Patient : ${donnees.nom}\n` +
    `Telephone : ${donnees.telephone || "(non renseigne)"}\n` +
    `Depart : ${donnees.priseEnCharge}\n` +
    `Destination : ${donnees.destination}\n` +
    (donnees.accompagnant ? `Accompagnant : oui\n` : "") +
    (donnees.btoRetour ? `Bon de transport au retour : oui\n` : "") +
    (donnees.telephone2 ? `Autre numero : ${donnees.telephone2}\n` : "") +
    (donnees.reservePar ? `Reserve par : ${donnees.reservePar}${donnees.telReservant ? " - " + donnees.telReservant : ""}\n` : "") +
    (donnees.commentaire ? `Commentaire : ${donnees.commentaire}\n` : "") +
    (donnees.origine === "ads" ? "Origine : GOOGLE ADS (espace partenaires)\n" : "") +
    `Reference : ${reference}\n`;
  const sujet = `🚕 ${dateCourte(donnees.date)} · ${donnees.pcADefinir ? "PC à définir (RDV " + donnees.heureRdv.replace(":", "h") + ")" : heurePriseEnCharge.replace(":", "h")} · ${donnees.nom} → ${donnees.destination}`;

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
        subject: sujet,
        text: corps,
        html: mailReservationHtml(donnees, reference, await lienRelaisSms(env, donnees)),
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

// « Calcul automatique de l'heure de prise en charge » (le client ne donne que
// l'heure de rendez-vous) : duree du trajet par l'itineraire de l'IGN (gratuit,
// sans cle), plus une marge de securite comme l'ancienne page de reservation
// (15 min sous 30 min de trajet, 30 min au-dela), arrondi a 5 min.
async function positionAdresse(texte) {
  const params = new URLSearchParams({ q: texte, limit: "5", autocomplete: "0" });
  const r = await fetch(`https://data.geopf.fr/geocodage/search?${params}`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null;
  const d = await r.json();
  const f = (d.features || []).find((x) => x.properties && /^(06|83)/.test(String(x.properties.postcode || ""))) || (d.features || [])[0];
  return f && f.geometry ? f.geometry.coordinates : null;
}

async function estimerHeurePc(depart, destination, heureRdv) {
  try {
    const [a, b] = await Promise.all([positionAdresse(depart), positionAdresse(destination)]);
    if (!a || !b) return null;
    const params = new URLSearchParams({
      resource: "bdtopo-osrm", profile: "car", optimization: "fastest",
      start: `${a[0]},${a[1]}`, end: `${b[0]},${b[1]}`, timeUnit: "minute", getSteps: "false",
    });
    const r = await fetch(`https://data.geopf.fr/navigation/itineraire?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    let duree = Number(d.duration);
    if (!Number.isFinite(duree)) return null;
    if (d.timeUnit === "second") duree /= 60;
    if (d.timeUnit === "hour") duree *= 60;
    duree = Math.ceil(duree);
    const marge = duree < 30 ? 15 : 30;
    const [h, m] = heureRdv.split(":").map(Number);
    const minutes = Math.max(0, Math.floor((h * 60 + m - duree - marge) / 5) * 5);
    return { heurePc: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`, duree, marge };
  } catch (e) {
    return null;
  }
}

const CHAMPS_TEXTE_MAX = 120;
const TELEPHONE_MAX = 30;
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HEURE = /^\d{2}:\d{2}$/;
const REGEX_TELEPHONE = /^[0-9+()\s.-]{4,30}$/;

// Limitation de debit par adresse IP : sans elle, un script peut appeler
// l'endpoint en boucle et noyer l'agenda d'evenements fictifs tout en
// consommant le quota d'envoi Resend. Le compteur vit dans la memoire de
// l'isolate Workers : il coupe les rafales venant d'une meme IP, mais ne
// couvre pas l'ensemble du reseau Cloudflare — d'ou la regle WAF
// recommandee en complement cote tableau de bord.
const FENETRE_MS = 60 * 1000;
const MAX_PAR_FENETRE = 5;
const compteursIp = new Map();

function limiteDepassee(ip) {
  if (!ip) return false;
  const maintenant = Date.now();
  // Purge des entrees expirees pour que la Map ne grossisse pas sans fin.
  for (const [cle, horodatages] of compteursIp) {
    const recents = horodatages.filter((t) => maintenant - t < FENETRE_MS);
    if (recents.length) compteursIp.set(cle, recents);
    else compteursIp.delete(cle);
  }
  const horodatages = compteursIp.get(ip) || [];
  if (horodatages.length >= MAX_PAR_FENETRE) return true;
  horodatages.push(maintenant);
  compteursIp.set(ip, horodatages);
  return false;
}

// REGEX_HEURE accepte "99:99" : on verifie donc aussi les plages reelles,
// sinon on construirait un dateTime invalide envoye tel quel a Google.
function heureValide(valeur) {
  if (!REGEX_HEURE.test(valeur)) return false;
  const [h, m] = valeur.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// Refuse les dates fantaisistes (annee 9999, 30 fevrier, passe lointain) qui
// pollueraient l'agenda sans jamais correspondre a une course reelle.
function dateValide(valeur) {
  if (!REGEX_DATE.test(valeur)) return false;
  const d = new Date(valeur + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  const maintenant = Date.now();
  const plancher = maintenant - 36 * 60 * 60 * 1000; // tolere la veille (fuseaux)
  const plafond = maintenant + 550 * 24 * 60 * 60 * 1000; // ~18 mois
  return d.getTime() >= plancher && d.getTime() <= plafond;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (limiteDepassee(ip)) {
    return jsonResponse(429, {
      ok: false,
      error: "Trop de demandes envoyees. Merci de patienter une minute ou d'appeler la centrale.",
    });
  }

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

  const champsTexte = ["prenom", "nom", "telephone", "priseEnCharge", "destination", "date", "heureRdv", "heurePc", "reservePar", "telReservant", "telephone2", "commentaire"];
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
  if (!dateValide(date)) {
    return jsonResponse(400, { ok: false, error: "Date invalide" });
  }
  if (!heureValide(heurePriseEnCharge) || (heureRdv && !heureValide(heureRdv))) {
    return jsonResponse(400, { ok: false, error: "Heure invalide" });
  }

  // Heure de prise en charge a calculer (seule l'heure de RDV est donnee).
  let heurePcFinale = heurePc;
  let calcul = null;
  if (!heurePc && heureRdv) {
    calcul = await estimerHeurePc(priseEnCharge, destination, heureRdv);
    if (calcul) {
      heurePcFinale = calcul.heurePc;
    } else {
      // Trajet introuvable : course posee 1 h avant le RDV, a confirmer par la centrale.
      const [h, m] = heureRdv.split(":").map(Number);
      const minutes = Math.max(0, h * 60 + m - 60);
      heurePcFinale = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    }
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
    heurePc: heurePcFinale,
    pcCalculee: !!calcul,
    pcADefinir: !heurePc && !calcul,
    dureeTrajet: calcul ? calcul.duree : null,
    accompagnant: !!body.accompagnant,
    btoRetour: !!body.btoRetour,
    reservePar: nettoyerTexte(body.reservePar, CHAMPS_TEXTE_MAX),
    telReservant: nettoyerTexte(body.telReservant, TELEPHONE_MAX),
    telephone2: nettoyerTexte(body.telephone2, TELEPHONE_MAX),
    commentaire: nettoyerTexte(body.commentaire, 500),
  };

  // Tri : pub Google Ads (client inconnu) -> espace partenaires ; QR code,
  // anciens clients, recherche Google -> agenda de Tony.
  donnees.origine = await origineReservation(env, body.origine, telephone).catch(() => "site");
  let versPartenaires = null;
  if (donnees.origine === "ads") {
    versPartenaires = await ajouterReservationAds(env, donnees, reference).catch((e) => ({ ok: false, raison: String(e && e.message) }));
  }
  if (!(versPartenaires && versPartenaires.ok)) {
    // Course de Tony : recap dans l'onglet « Mes courses » de son espace.
    await ajouterMaCourse(env, donnees, reference).catch(() => null);
  }

  const [resultatAgenda, resultatEmail] = await Promise.all([
    versPartenaires && versPartenaires.ok
      ? Promise.resolve({ ok: true, partenaires: true })
      : envoyerVersEasyTaxi(env, body, donnees).then((r) => (r.ok ? r : creerEvenementAgenda(env, donnees, reference))),
    envoyerEmailConfirmation(env, donnees, reference),
  ]);

  return jsonResponse(200, { ok: true, reference, agenda: resultatAgenda, email: resultatEmail });
}

// Reservation posee directement sur le planning de l'appli EasyTaxi (meme
// route que la page de reservation publique du chauffeur, /r/<jeton>).
async function envoyerVersEasyTaxi(env, body, donnees) {
  const lien = (env.EASYTAXI_LIEN_RESERVATION || "").trim();
  const m = lien.match(/^(https:\/\/[^/]+)\/r\/([A-Za-z0-9_-]+)\/?$/);
  if (!m) return { ok: false, raison: "non configure" };
  try {
    const reponse = await fetch(`${m[1]}/api/public/reservation/${m[2]}`, {
      method: "POST",
      // Appli arretee ou injoignable : on ne fait pas attendre le patient.
      signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prenom: nettoyerTexte(body.prenom, CHAMPS_TEXTE_MAX),
        nom: nettoyerTexte(body.nom, CHAMPS_TEXTE_MAX),
        telephone: donnees.telephone,
        priseEnCharge: donnees.priseEnCharge,
        destination: donnees.destination,
        date: donnees.date,
        heurePc: donnees.heurePc,
        heureRdv: donnees.heureRdv,
        type: donnees.type,
        accompagnant: donnees.accompagnant,
        btoRetour: donnees.btoRetour,
        commentaire: "Réservation du site internet",
      }),
    });
    const r = await reponse.json().catch(() => ({}));
    return reponse.ok && r.ok ? { ok: true, appli: true } : { ok: false, raison: r.error || `HTTP ${reponse.status}` };
  } catch (e) {
    return { ok: false, raison: "appli injoignable" };
  }
}

function jsonResponse(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: { "Content-Type": "application/json" },
  });
}
