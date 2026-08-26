// Tous les appels a l'API Google (OAuth + Calendar) passent par le Worker :
// le navigateur du chauffeur ne voit jamais de jeton Google, seul le Worker
// en detient un, rafraichi a la demande depuis le refresh token chiffre
// stocke en D1 (voir lib/chiffrement.js).

export function urlAutorisationGoogle(env, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    // calendar.readonly (pas "calendar" tout court) : l'appli n'a besoin que
    // de lire l'agenda du chauffeur, jamais d'y ecrire ou d'en supprimer.
    scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    // "consent" force Google a redonner un refresh_token a chaque connexion,
    // meme si le chauffeur avait deja autorise l'appli auparavant.
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function echangerCodeContreJetons(env, code, redirectUri) {
  const reponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error("Echange du code OAuth Google echoue : " + JSON.stringify(donnees));
  return donnees; // { access_token, refresh_token?, expires_in, id_token, scope }
}

export async function rafraichirJetonAcces(env, refreshToken) {
  const reponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error("Rafraichissement du jeton Google echoue : " + JSON.stringify(donnees));
  return donnees.access_token;
}

export async function obtenirProfil(accessToken) {
  const reponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error("Recuperation du profil Google echouee : " + JSON.stringify(donnees));
  return donnees; // { sub, email, name }
}

export async function listerCalendriers(accessToken) {
  const reponse = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250&minAccessRole=reader",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error("Liste des calendriers Google echouee : " + JSON.stringify(donnees));
  return (donnees.items || []).map((c) => ({
    id: c.id,
    nom: c.summaryOverride || c.summary || c.id,
    principal: !!c.primary,
  }));
}

// Google exige un decalage horaire explicite (+02:00, +01:00...) dans
// timeMin/timeMax : ce calcul evite de coder en dur les dates de changement
// d'heure d'ete/hiver, qui varient chaque annee.
function decalageFuseau(fuseau, dateISO) {
  const referenceMidi = new Date(`${dateISO}T12:00:00Z`);
  const parties = new Intl.DateTimeFormat("en-US", {
    timeZone: fuseau,
    timeZoneName: "shortOffset",
  }).formatToParts(referenceMidi);
  const zone = parties.find((p) => p.type === "timeZoneName")?.value || "GMT+0";
  const correspondance = zone.match(/GMT([+-]\d+)/);
  const heures = correspondance ? parseInt(correspondance[1], 10) : 0;
  return `${heures >= 0 ? "+" : "-"}${String(Math.abs(heures)).padStart(2, "0")}:00`;
}

export async function listerEvenementsDuJour(accessToken, calendarId, dateISO, fuseau = "Europe/Paris") {
  const decalage = decalageFuseau(fuseau, dateISO);
  const params = new URLSearchParams({
    timeMin: `${dateISO}T00:00:00${decalage}`,
    timeMax: `${dateISO}T23:59:59${decalage}`,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const reponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error("Recuperation des evenements Google echouee : " + JSON.stringify(donnees));
  return donnees.items || [];
}
