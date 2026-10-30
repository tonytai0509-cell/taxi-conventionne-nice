// Espace partenaires (taxi-conventionne06.fr/partenaires) : les reservations
// venues d'une pub Google Ads, partagees entre les chauffeurs qui financent
// la pub. Base Cloudflare D1 (binding DB, voir wrangler.jsonc).
//
// Acces : chaque partenaire a un lien personnel (…/partenaires/entrer?cle=…)
// cree par l'administrateur ; il pose un cookie valable un an. Le premier
// acces administrateur se fait avec la cle PARTENAIRES_CLE_ADMIN (secret
// Cloudflare choisi par Tony).
//
// Tri des reservations (voir origineReservation) : seules celles venues de
// Google Ads, d'un client qui n'est pas dans la liste des clients de Tony,
// arrivent ici. QR code, anciens clients, recherche Google : a Tony seul.
//
// Dispatch : il se fait dans le logiciel Caree. Ici, n'importe quel
// partenaire marque la course « mise dans Caree » (qui et quand), pour
// eviter les doublons ; tous voient donc le nom et le telephone du client,
// effaces 30 jours apres la date de la course.
//
// SMS : un seul numero les recoit, celui de la ligne de permanence (reglage
// de l'administrateur, change quand la ligne tourne). Le recap « Mes courses » (admin seul) est efface
// entierement au meme delai.

const COOKIE = "partenaire";
const DUREE_COOKIE_S = 365 * 24 * 3600;
const JOURS_CONSERVATION_CLIENT = 30;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS partenaires (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     nom TEXT NOT NULL,
     telephone TEXT,
     cle_hash TEXT NOT NULL UNIQUE,
     admin INTEGER NOT NULL DEFAULT 0,
     peut_ajouter INTEGER NOT NULL DEFAULT 0,
     actif INTEGER NOT NULL DEFAULT 1,
     cree_le TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE TABLE IF NOT EXISTS courses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     reference TEXT,
     date TEXT NOT NULL,
     heure_pc TEXT,
     heure_rdv TEXT,
     type TEXT NOT NULL DEFAULT 'medical',
     depart TEXT NOT NULL,
     destination TEXT NOT NULL,
     client_nom TEXT,
     client_tel TEXT,
     telephone2 TEXT,
     commentaire TEXT,
     options TEXT,
     origine TEXT NOT NULL DEFAULT 'site',
     ajoutee_par INTEGER,
     prise_par INTEGER,
     prise_le TEXT,
     annulee INTEGER NOT NULL DEFAULT 0,
     cree_le TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_courses_date ON courses (date)`,
  `CREATE TABLE IF NOT EXISTS clients_tony (telephone TEXT PRIMARY KEY)`,
  `CREATE TABLE IF NOT EXISTS budget (
     mois TEXT NOT NULL,
     partenaire_id INTEGER NOT NULL,
     montant REAL NOT NULL DEFAULT 0,
     paye INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (mois, partenaire_id)
   )`,
  `CREATE TABLE IF NOT EXISTS depenses (mois TEXT PRIMARY KEY, montant REAL NOT NULL DEFAULT 0)`,
  // Reservations du site qui reviennent a Tony (QR code, site, ses clients) :
  // recap dans l'onglet « Mes courses », visible par l'administrateur seul.
  `CREATE TABLE IF NOT EXISTS mes_courses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     reference TEXT,
     date TEXT NOT NULL,
     heure_pc TEXT,
     heure_rdv TEXT,
     pc_a_definir INTEGER NOT NULL DEFAULT 0,
     type TEXT NOT NULL DEFAULT 'medical',
     origine TEXT NOT NULL DEFAULT 'site',
     depart TEXT NOT NULL,
     destination TEXT NOT NULL,
     client_nom TEXT,
     client_tel TEXT,
     telephone2 TEXT,
     reserve_par TEXT,
     commentaire TEXT,
     options TEXT,
     saisie INTEGER NOT NULL DEFAULT 0,
     cree_le TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mes_courses_date ON mes_courses (date)`,
  `CREATE TABLE IF NOT EXISTS reglages (cle TEXT PRIMARY KEY, valeur TEXT)`,
  // Factures mensuelles (PDF joints par Tony), une par chauffeur et par mois.
  `CREATE TABLE IF NOT EXISTS factures (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     mois TEXT NOT NULL,
     partenaire_id INTEGER NOT NULL,
     nom_fichier TEXT NOT NULL,
     pdf BLOB NOT NULL,
     cree_le TEXT NOT NULL DEFAULT (datetime('now')),
     UNIQUE (mois, partenaire_id)
   )`,
];

const TAILLE_MAX_FACTURE = 1800 * 1024;

// Colonnes ajoutees apres coup (ALTER TABLE echoue si elles existent deja).
const COLONNES = [
  "ALTER TABLE courses ADD COLUMN caree_par INTEGER",
  "ALTER TABLE courses ADD COLUMN caree_le TEXT",
  // Cle du lien personnel gardee (partenaires seulement, jamais l'admin) pour
  // pouvoir renvoyer le lien a un chauffeur qui l'a perdu.
  "ALTER TABLE partenaires ADD COLUMN cle TEXT",
];

let schemaPret = false;
async function preparer(db) {
  if (schemaPret) return;
  for (const sql of SCHEMA) await db.prepare(sql).run();
  for (const sql of COLONNES) await db.prepare(sql).run().catch(() => null);
  schemaPret = true;
}

export function partenairesActifs(env) {
  return !!(env.DB && typeof env.DB.prepare === "function");
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

async function sha256(texte) {
  const octets = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texte)));
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}

function nouvelleCle() {
  const octets = crypto.getRandomValues(new Uint8Array(18));
  let s = "";
  for (const o of octets) s += String.fromCharCode(o);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Numero francais compare sur ses 9 derniers chiffres (06…, +336…, 336…).
export function telephoneCle(t) {
  const chiffres = String(t || "").replace(/\D/g, "");
  return chiffres.length >= 9 ? chiffres.slice(-9) : "";
}

function texte(v, max) {
  return typeof v === "string" ? v.replace(/[\r\n\t\x00-\x1f\x7f]+/g, " ").trim().slice(0, max) : "";
}

function json(corps, statut = 200, entetes = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...entetes },
  });
}

function lireCookie(request, nom) {
  const brut = request.headers.get("Cookie") || "";
  for (const morceau of brut.split(";")) {
    const [k, ...v] = morceau.trim().split("=");
    if (k === nom) return decodeURIComponent(v.join("="));
  }
  return "";
}

function cookieSession(cle) {
  return `${COOKIE}=${encodeURIComponent(cle)}; Path=/; Max-Age=${DUREE_COOKIE_S}; HttpOnly; Secure; SameSite=Lax`;
}

function aujourdhuiParis() {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function decalerJours(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function partenaireConnecte(request, env) {
  const cle = lireCookie(request, COOKIE);
  if (!cle) return null;
  return env.DB.prepare("SELECT id, nom, admin, peut_ajouter FROM partenaires WHERE cle_hash = ? AND actif = 1")
    .bind(await sha256(cle))
    .first();
}

// ---------------------------------------------------------------------------
// Tri des reservations du site
// ---------------------------------------------------------------------------

// "ads" seulement si le visiteur est arrive par une pub Google (marque posee
// par js/main.js) ET que son numero n'est pas dans la liste des clients de Tony.
export async function origineReservation(env, origineDeclaree, telephone) {
  if (origineDeclaree !== "ads") return origineDeclaree === "qr" ? "qr" : "site";
  if (!partenairesActifs(env)) return "ads";
  await preparer(env.DB);
  const cle = telephoneCle(telephone);
  if (cle) {
    const connu = await env.DB.prepare("SELECT 1 FROM clients_tony WHERE telephone = ?").bind(cle).first();
    if (connu) return "client_tony";
  }
  return "ads";
}

// Reservation Google Ads du site : ajoutee a l'espace partenaires (libre),
// SMS aux partenaires par le telephone relais.
export async function ajouterReservationAds(env, d, reference) {
  if (!partenairesActifs(env)) return { ok: false, raison: "espace partenaires non configure" };
  await preparer(env.DB);
  const options = [d.accompagnant ? "Accompagnant" : "", d.btoRetour ? "Bon de transport au retour" : ""].filter(Boolean).join(", ");
  const r = await env.DB.prepare(
    `INSERT INTO courses (reference, date, heure_pc, heure_rdv, type, depart, destination, client_nom, client_tel, telephone2, commentaire, options, origine)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ads')`
  )
    .bind(reference, d.date, d.pcADefinir ? null : d.heurePc || null, d.heureRdv || null, d.type, d.priseEnCharge, d.destination,
      d.nom, d.telephone, d.telephone2 || null, d.commentaire || null, options || null)
    .run();
  await prevenirPartenaires(env, { date: d.date, heure: d.pcADefinir ? null : d.heurePc, depart: d.priseEnCharge, destination: d.destination });
  return { ok: true, id: r.meta && r.meta.last_row_id };
}

// Reservation du site qui revient a Tony : gardee pour son recap « Mes courses ».
export async function ajouterMaCourse(env, d, reference) {
  if (!partenairesActifs(env)) return { ok: false };
  await preparer(env.DB);
  const options = [d.accompagnant ? "Accompagnant" : "", d.btoRetour ? "Bon de transport au retour" : ""].filter(Boolean).join(", ");
  const reservePar = d.reservePar ? d.reservePar + (d.telReservant ? " - " + d.telReservant : "") : null;
  await env.DB.prepare(
    `INSERT INTO mes_courses (reference, date, heure_pc, heure_rdv, pc_a_definir, type, origine, depart, destination, client_nom, client_tel, telephone2, reserve_par, commentaire, options)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(reference, d.date, d.pcADefinir ? null : d.heurePc || null, d.heureRdv || null, d.pcADefinir ? 1 : 0, d.type, d.origine || "site",
      d.priseEnCharge, d.destination, d.nom, d.telephone, d.telephone2 || null, reservePar, d.commentaire || null, options || null)
    .run();
  return { ok: true };
}

function versInternational(numero) {
  const brut = String(numero || "").replace(/[^0-9+]/g, "");
  if (brut.startsWith("+")) return brut;
  if (brut.startsWith("0") && brut.length === 10) return "+33" + brut.slice(1);
  return brut;
}

async function numeroPermanence(db) {
  const r = await db.prepare("SELECT valeur FROM reglages WHERE cle = 'sms_permanence'").first();
  return (r && r.valeur) || "";
}

// SMS a la ligne de permanence seulement.
async function prevenirPartenaires(env, c) {
  if (!env.SMS_GATEWAY_USERNAME || !env.SMS_GATEWAY_PASSWORD) return;
  const numero = versInternational(await numeroPermanence(env.DB));
  if (numero.length < 10) return;
  const numeros = [numero];
  const [, m, j] = c.date.split("-");
  const ville = (a) => (String(a).match(/\d{5}\s+([^,]+)/) || [])[1] || String(a).split(",")[0];
  const message = `🚕 Nouvelle course Google Ads : ${j}/${m}${c.heure ? " " + c.heure.replace(":", "h") : ""}, ${ville(c.depart)} → ${c.destination}. A mettre dans Caree : taxi-conventionne06.fr/partenaires`;
  try {
    await fetch("https://api.sms-gate.app/3rdparty/v1/messages?skipPhoneValidation=true", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${env.SMS_GATEWAY_USERNAME}:${env.SMS_GATEWAY_PASSWORD}`)}` },
      body: JSON.stringify({ textMessage: { text: message }, phoneNumbers: numeros, priority: 50 }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    // Notification de confort : l'echec n'empeche pas la reservation.
  }
}

// ---------------------------------------------------------------------------
// API de la page /partenaires
// ---------------------------------------------------------------------------

function vueCourse(c, moi, noms) {
  return {
    id: c.id,
    date: c.date,
    heurePc: c.heure_pc,
    heureRdv: c.heure_rdv,
    type: c.type,
    depart: c.depart,
    destination: c.destination,
    options: c.options,
    commentaire: c.commentaire,
    origine: c.origine,
    parTelephone: c.ajoutee_par != null,
    ajouteePar: c.ajoutee_par != null ? noms[c.ajoutee_par] || "?" : null,
    dansCaree: c.caree_par != null,
    careePar: c.caree_par != null ? (c.caree_par === moi.id ? "vous" : noms[c.caree_par] || "?") : null,
    careeLe: c.caree_le,
    annulee: !!c.annulee,
    client: { nom: c.client_nom, telephone: c.client_tel, telephone2: c.telephone2 },
  };
}

async function nomsPartenaires(db) {
  const { results } = await db.prepare("SELECT id, nom FROM partenaires").all();
  return Object.fromEntries((results || []).map((p) => [p.id, p.nom]));
}

async function lireCorps(request) {
  try {
    const t = await request.text();
    return t.length > 20000 ? {} : JSON.parse(t || "{}");
  } catch (e) {
    return {};
  }
}

export async function routePartenaires(request, env, url) {
  if (!partenairesActifs(env)) {
    return json({ ok: false, error: "Espace partenaires pas encore configuré (base D1 manquante)." }, 503);
  }
  await preparer(env.DB);
  const chemin = url.pathname.replace(/\/+$/, "");
  const methode = request.method;

  // Purge des coordonnees des clients une fois la course passee.
  if (Math.random() < 0.05) {
    const limite = decalerJours(aujourdhuiParis(), -JOURS_CONSERVATION_CLIENT);
    await env.DB.prepare("UPDATE courses SET client_nom = NULL, client_tel = NULL, telephone2 = NULL WHERE date < ? AND client_nom IS NOT NULL")
      .bind(limite)
      .run();
    await env.DB.prepare("DELETE FROM mes_courses WHERE date < ?").bind(limite).run();
  }

  // Entree par lien personnel : pose le cookie et ouvre la page.
  if (chemin === "/partenaires/entrer" && methode === "GET") {
    const cle = url.searchParams.get("cle") || "";
    let ok = false;
    if (cle && env.PARTENAIRES_CLE_ADMIN && cle === env.PARTENAIRES_CLE_ADMIN) {
      // Premier acces de l'administrateur : cree (ou retrouve) son compte.
      const h = await sha256(cle);
      const existe = await env.DB.prepare("SELECT id FROM partenaires WHERE cle_hash = ?").bind(h).first();
      if (!existe) await env.DB.prepare("INSERT INTO partenaires (nom, cle_hash, admin, peut_ajouter) VALUES ('Tony', ?, 1, 1)").bind(h).run();
      ok = true;
    } else if (cle) {
      ok = !!(await env.DB.prepare("SELECT id FROM partenaires WHERE cle_hash = ? AND actif = 1").bind(await sha256(cle)).first());
    }
    if (!ok) return new Response(null, { status: 302, headers: { Location: "/partenaires?lien=invalide" } });
    return new Response(null, { status: 302, headers: { Location: "/partenaires", "Set-Cookie": cookieSession(cle), "Cache-Control": "no-store" } });
  }

  if (!chemin.startsWith("/api/partenaires")) return null;
  const moi = await partenaireConnecte(request, env);
  if (!moi) return json({ ok: false, error: "Non connecté" }, 401);
  moi.admin = !!moi.admin;
  moi.peut_ajouter = !!moi.peut_ajouter;
  const sousChemin = chemin.slice("/api/partenaires".length) || "/";

  if (sousChemin === "/moi" && methode === "GET") {
    return json({ ok: true, nom: moi.nom, admin: moi.admin, peutAjouter: moi.admin || moi.peut_ajouter });
  }

  if (sousChemin === "/deconnexion" && methode === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` });
  }

  // Liste des courses sur une periode (par defaut : aujourd'hui).
  if (sousChemin === "/courses" && methode === "GET") {
    const debut = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("debut") || "") ? url.searchParams.get("debut") : aujourdhuiParis();
    let fin = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("fin") || "") ? url.searchParams.get("fin") : debut;
    if (fin < debut) fin = debut;
    if (fin > decalerJours(debut, 62)) fin = decalerJours(debut, 62);
    const { results } = await env.DB.prepare(
      "SELECT * FROM courses WHERE date >= ? AND date <= ? ORDER BY date, COALESCE(heure_pc, heure_rdv), id"
    ).bind(debut, fin).all();
    const noms = await nomsPartenaires(env.DB);
    return json({ ok: true, debut, fin, courses: (results || []).map((c) => vueCourse(c, moi, noms)) });
  }

  const action = sousChemin.match(/^\/courses\/(\d+)\/(caree|prendre|liberer|annuler)$/);
  if (action && methode === "POST") {
    const id = Number(action[1]);
    // « Mise dans Caree » : bascule ; n'importe quel partenaire.
    if (action[2] === "caree") {
      const c = await env.DB.prepare("SELECT caree_par FROM courses WHERE id = ?").bind(id).first();
      if (!c) return json({ ok: false, error: "Course introuvable." }, 404);
      if (c.caree_par == null) {
        await env.DB.prepare("UPDATE courses SET caree_par = ?, caree_le = datetime('now') WHERE id = ? AND caree_par IS NULL").bind(moi.id, id).run();
      } else {
        await env.DB.prepare("UPDATE courses SET caree_par = NULL, caree_le = NULL WHERE id = ?").bind(id).run();
      }
      return json({ ok: true });
    }
    if (action[2] === "prendre") {
      const r = await env.DB.prepare("UPDATE courses SET prise_par = ?, prise_le = datetime('now') WHERE id = ? AND prise_par IS NULL AND annulee = 0")
        .bind(moi.id, id).run();
      if (!r.meta || !r.meta.changes) return json({ ok: false, error: "Trop tard : cette course vient d'être prise." }, 409);
      return json({ ok: true });
    }
    if (action[2] === "liberer") {
      const r = await env.DB.prepare(`UPDATE courses SET prise_par = NULL, prise_le = NULL WHERE id = ? AND ${moi.admin ? "1 = 1" : "prise_par = ?"}`)
        .bind(...(moi.admin ? [id] : [id, moi.id])).run();
      if (!r.meta || !r.meta.changes) return json({ ok: false, error: "Vous ne pouvez pas libérer cette course." }, 403);
      const c = await env.DB.prepare("SELECT date, heure_pc, depart, destination FROM courses WHERE id = ?").bind(id).first();
      if (c) await prevenirPartenaires(env, { date: c.date, heure: c.heure_pc, depart: c.depart, destination: c.destination });
      return json({ ok: true });
    }
    if (!moi.admin) return json({ ok: false, error: "Réservé à l'administrateur." }, 403);
    await env.DB.prepare("UPDATE courses SET annulee = 1 - annulee WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  // Course recue par telephone (client venu par la pub).
  if (sousChemin === "/courses" && methode === "POST") {
    if (!moi.admin && !moi.peut_ajouter) return json({ ok: false, error: "Vous ne pouvez pas ajouter de course." }, 403);
    const b = await lireCorps(request);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : "";
    const heure = (h) => (/^\d{2}:\d{2}$/.test(h || "") ? h : null);
    const c = {
      date,
      heurePc: heure(b.heurePc),
      heureRdv: heure(b.heureRdv),
      type: b.type === "prive" ? "prive" : "medical",
      depart: texte(b.depart, 160),
      destination: texte(b.destination, 160),
      nom: texte(b.nom, 120),
      telephone: texte(b.telephone, 30),
      commentaire: texte(b.commentaire, 500),
      // Plus de « Je la garde » : toute course ajoutee part au dispatch (Caree).
      garder: false,
    };
    if (!c.date || !c.depart || !c.destination || (!c.heurePc && !c.heureRdv)) {
      return json({ ok: false, error: "Date, heure, départ et destination sont obligatoires." }, 400);
    }
    const r = await env.DB.prepare(
      `INSERT INTO courses (date, heure_pc, heure_rdv, type, depart, destination, client_nom, client_tel, commentaire, origine, ajoutee_par, prise_par, prise_le)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ads', ?, ?, ${c.garder ? "datetime('now')" : "NULL"})`
    ).bind(c.date, c.heurePc, c.heureRdv, c.type, c.depart, c.destination, c.nom || null, c.telephone || null, c.commentaire || null,
      moi.id, c.garder ? moi.id : null).run();
    if (!c.garder) await prevenirPartenaires(env, { date: c.date, heure: c.heurePc, depart: c.depart, destination: c.destination });
    return json({ ok: true, id: r.meta && r.meta.last_row_id });
  }

  // Bilan d'un mois (AAAA-MM).
  // Factures du chauffeur connecte (il ne voit que les siennes).
  if (sousChemin === "/mes-factures" && methode === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT b.mois, b.montant, b.paye, f.id AS facture_id FROM budget b
       LEFT JOIN factures f ON f.mois = b.mois AND f.partenaire_id = b.partenaire_id
       WHERE b.partenaire_id = ?
       UNION
       SELECT f.mois, NULL, 0, f.id FROM factures f
       WHERE f.partenaire_id = ? AND NOT EXISTS (SELECT 1 FROM budget b WHERE b.mois = f.mois AND b.partenaire_id = f.partenaire_id)
       ORDER BY 1 DESC LIMIT 24`
    ).bind(moi.id, moi.id).all();
    return json({ ok: true, factures: (results || []).map((r) => ({ mois: r.mois, montant: r.montant, paye: !!r.paye, factureId: r.facture_id })) });
  }

  // PDF d'une facture : son chauffeur ou l'administrateur.
  const pdf = sousChemin.match(/^\/factures\/(\d+)$/);
  if (pdf && methode === "GET") {
    const f = await env.DB.prepare("SELECT partenaire_id, nom_fichier, pdf FROM factures WHERE id = ?").bind(Number(pdf[1])).first();
    if (!f || (!moi.admin && f.partenaire_id !== moi.id)) return json({ ok: false, error: "Facture introuvable." }, 404);
    const octets = f.pdf instanceof ArrayBuffer ? new Uint8Array(f.pdf) : Array.isArray(f.pdf) ? Uint8Array.from(f.pdf) : new Uint8Array(f.pdf);
    return new Response(octets, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${String(f.nom_fichier).replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (sousChemin === "/bilan" && methode === "GET") {
    if (!moi.admin) return json({ ok: false, error: "Réservé à l'administrateur." }, 403);
    const mois = /^\d{4}-\d{2}$/.test(url.searchParams.get("mois") || "") ? url.searchParams.get("mois") : aujourdhuiParis().slice(0, 7);
    const { results: courses } = await env.DB.prepare(
      "SELECT prise_par, ajoutee_par, caree_par FROM courses WHERE date LIKE ? AND annulee = 0"
    ).bind(mois + "-%").all();
    const { results: parts } = await env.DB.prepare("SELECT id, nom, actif FROM partenaires ORDER BY id").all();
    const { results: budgets } = await env.DB.prepare("SELECT partenaire_id, montant, paye FROM budget WHERE mois = ?").bind(mois).all();
    const { results: facts } = await env.DB.prepare("SELECT id, partenaire_id FROM factures WHERE mois = ?").bind(mois).all();
    const depense = await env.DB.prepare("SELECT montant FROM depenses WHERE mois = ?").bind(mois).first();
    const liste = courses || [];
    const parPartenaire = (parts || [])
      .map((p) => {
        const b = (budgets || []).find((x) => x.partenaire_id === p.id);
        return {
          id: p.id,
          nom: p.nom,
          courses: liste.filter((c) => c.prise_par === p.id).length,
          budget: b ? b.montant : null,
          paye: b ? !!b.paye : false,
          factureId: ((facts || []).find((x) => x.partenaire_id === p.id) || {}).id || null,
          actif: !!p.actif,
        };
      })
      .filter((p) => p.actif || p.courses || p.budget != null || p.factureId);
    const total = liste.length;
    const montant = depense ? depense.montant : null;
    return json({
      ok: true,
      mois,
      total,
      parTelephone: liste.filter((c) => c.ajoutee_par != null).length,
      nonPrises: liste.filter((c) => c.prise_par == null).length,
      pasDansCaree: liste.filter((c) => c.caree_par == null).length,
      depense: montant,
      coutParCourse: montant != null && total ? Math.round((montant / total) * 100) / 100 : null,
      partenaires: parPartenaire,
    });
  }

  // ----- Administration (Tony) -----
  if (!moi.admin) return json({ ok: false, error: "Réservé à l'administrateur." }, 403);

  if (sousChemin === "/admin/partenaires" && methode === "GET") {
    const { results } = await env.DB.prepare("SELECT id, nom, telephone, admin, peut_ajouter, actif, cle FROM partenaires ORDER BY id").all();
    return json({
      ok: true,
      partenaires: (results || []).map(({ cle, ...p }) => ({
        ...p,
        admin: !!p.admin,
        peut_ajouter: !!p.peut_ajouter,
        actif: !!p.actif,
        lien: cle && !p.admin ? `${url.origin}/partenaires/entrer?cle=${cle}` : null,
      })),
    });
  }

  if (sousChemin === "/admin/partenaires" && methode === "POST") {
    const b = await lireCorps(request);
    const nom = texte(b.nom, 60);
    if (!nom) return json({ ok: false, error: "Nom obligatoire." }, 400);
    const cle = nouvelleCle();
    await env.DB.prepare("INSERT INTO partenaires (nom, telephone, cle_hash, cle, peut_ajouter) VALUES (?, ?, ?, ?, ?)")
      .bind(nom, texte(b.telephone, 30) || null, await sha256(cle), cle, b.peutAjouter ? 1 : 0).run();
    return json({ ok: true, lien: `${url.origin}/partenaires/entrer?cle=${cle}` });
  }

  const modif = sousChemin.match(/^\/admin\/partenaires\/(\d+)$/);
  if (modif && methode === "POST") {
    const id = Number(modif[1]);
    const b = await lireCorps(request);
    if (b.nouveauLien) {
      const cle = nouvelleCle();
      await env.DB.prepare("UPDATE partenaires SET cle_hash = ?, cle = ? WHERE id = ? AND admin = 0").bind(await sha256(cle), cle, id).run();
      return json({ ok: true, lien: `${url.origin}/partenaires/entrer?cle=${cle}` });
    }
    if (typeof b.actif === "boolean") await env.DB.prepare("UPDATE partenaires SET actif = ? WHERE id = ? AND admin = 0").bind(b.actif ? 1 : 0, id).run();
    if (typeof b.peutAjouter === "boolean") await env.DB.prepare("UPDATE partenaires SET peut_ajouter = ? WHERE id = ?").bind(b.peutAjouter ? 1 : 0, id).run();
    if (typeof b.telephone === "string") await env.DB.prepare("UPDATE partenaires SET telephone = ? WHERE id = ?").bind(texte(b.telephone, 30) || null, id).run();
    if (typeof b.nom === "string" && texte(b.nom, 60)) await env.DB.prepare("UPDATE partenaires SET nom = ? WHERE id = ?").bind(texte(b.nom, 60), id).run();
    return json({ ok: true });
  }

  // Joindre (ou remplacer) la facture PDF d'un chauffeur pour un mois.
  // Corps : le fichier PDF brut ; mois et chauffeur dans l'adresse.
  if (sousChemin === "/admin/factures" && methode === "POST") {
    const mois = /^\d{4}-\d{2}$/.test(url.searchParams.get("mois") || "") ? url.searchParams.get("mois") : "";
    const partenaireId = Number(url.searchParams.get("partenaire") || 0);
    if (!mois || !partenaireId) return json({ ok: false, error: "Mois ou chauffeur manquant." }, 400);
    const octets = new Uint8Array(await request.arrayBuffer());
    if (!octets.length) return json({ ok: false, error: "Fichier vide." }, 400);
    if (octets.length > TAILLE_MAX_FACTURE) return json({ ok: false, error: "PDF trop lourd (1,8 Mo maximum)." }, 413);
    if (String.fromCharCode(...octets.slice(0, 5)) !== "%PDF-") return json({ ok: false, error: "Ce fichier n'est pas un PDF." }, 400);
    const nom = texte(url.searchParams.get("nom") || "", 120) || `facture-${mois}.pdf`;
    await env.DB.prepare(
      `INSERT INTO factures (mois, partenaire_id, nom_fichier, pdf) VALUES (?, ?, ?, ?)
       ON CONFLICT (mois, partenaire_id) DO UPDATE SET nom_fichier = excluded.nom_fichier, pdf = excluded.pdf, cree_le = datetime('now')`
    ).bind(mois, partenaireId, nom, octets).run();
    return json({ ok: true });
  }

  const supprFacture = sousChemin.match(/^\/admin\/factures\/(\d+)\/supprimer$/);
  if (supprFacture && methode === "POST") {
    await env.DB.prepare("DELETE FROM factures WHERE id = ?").bind(Number(supprFacture[1])).run();
    return json({ ok: true });
  }

  if (sousChemin === "/admin/budget" && methode === "POST") {
    const b = await lireCorps(request);
    const mois = /^\d{4}-\d{2}$/.test(b.mois || "") ? b.mois : "";
    if (!mois) return json({ ok: false, error: "Mois invalide." }, 400);
    if (b.depense !== undefined) {
      const m = Number(b.depense);
      if (!Number.isFinite(m) || m < 0) return json({ ok: false, error: "Montant invalide." }, 400);
      await env.DB.prepare("INSERT INTO depenses (mois, montant) VALUES (?, ?) ON CONFLICT (mois) DO UPDATE SET montant = excluded.montant").bind(mois, m).run();
    }
    if (b.partenaireId !== undefined) {
      const m = Number(b.montant);
      await env.DB.prepare(
        `INSERT INTO budget (mois, partenaire_id, montant, paye) VALUES (?, ?, ?, ?)
         ON CONFLICT (mois, partenaire_id) DO UPDATE SET montant = excluded.montant, paye = excluded.paye`
      ).bind(mois, Number(b.partenaireId), Number.isFinite(m) && m >= 0 ? m : 0, b.paye ? 1 : 0).run();
    }
    return json({ ok: true });
  }

  // Recap des courses de Tony (onglet « Mes courses »).
  if (sousChemin === "/admin/mes-courses" && methode === "GET") {
    const debut = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("debut") || "") ? url.searchParams.get("debut") : aujourdhuiParis();
    let fin = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("fin") || "") ? url.searchParams.get("fin") : decalerJours(debut, 6);
    if (fin < debut) fin = debut;
    if (fin > decalerJours(debut, 62)) fin = decalerJours(debut, 62);
    const { results } = await env.DB.prepare(
      "SELECT * FROM mes_courses WHERE date >= ? AND date <= ? ORDER BY date, COALESCE(heure_pc, heure_rdv), id"
    ).bind(debut, fin).all();
    return json({
      ok: true,
      debut,
      fin,
      courses: (results || []).map((c) => ({
        id: c.id,
        date: c.date,
        heurePc: c.heure_pc,
        heureRdv: c.heure_rdv,
        pcADefinir: !!c.pc_a_definir,
        type: c.type,
        origine: c.origine,
        depart: c.depart,
        destination: c.destination,
        client: { nom: c.client_nom, telephone: c.client_tel, telephone2: c.telephone2 },
        reservePar: c.reserve_par,
        commentaire: c.commentaire,
        options: c.options,
        saisie: !!c.saisie,
      })),
    });
  }

  const saisie = sousChemin.match(/^\/admin\/mes-courses\/(\d+)\/saisie$/);
  if (saisie && methode === "POST") {
    await env.DB.prepare("UPDATE mes_courses SET saisie = 1 - saisie WHERE id = ?").bind(Number(saisie[1])).run();
    return json({ ok: true });
  }

  // Ligne de permanence : seul numero qui recoit les SMS des reservations.
  if (sousChemin === "/admin/sms" && methode === "GET") {
    return json({ ok: true, numero: await numeroPermanence(env.DB) });
  }
  if (sousChemin === "/admin/sms" && methode === "POST") {
    const b = await lireCorps(request);
    const numero = texte(b.numero, 30);
    await env.DB.prepare("INSERT INTO reglages (cle, valeur) VALUES ('sms_permanence', ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur")
      .bind(numero || null).run();
    return json({ ok: true, numero });
  }

  if (sousChemin === "/admin/clients" && methode === "GET") {
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM clients_tony").first();
    return json({ ok: true, nombre: n ? n.n : 0 });
  }

  // Liste des clients de Tony (numeros colles en vrac) : leurs reservations
  // ne vont jamais a l'espace partenaires.
  if (sousChemin === "/admin/clients" && methode === "POST") {
    const b = await lireCorps(request);
    const cles = [...new Set(String(b.numeros || "").split(/[\n,;]+/).map(telephoneCle).filter(Boolean))].slice(0, 5000);
    for (let i = 0; i < cles.length; i += 50) {
      await env.DB.batch(cles.slice(i, i + 50).map((c) => env.DB.prepare("INSERT OR IGNORE INTO clients_tony (telephone) VALUES (?)").bind(c)));
    }
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM clients_tony").first();
    return json({ ok: true, ajoutes: cles.length, nombre: n ? n.n : 0 });
  }

  return json({ ok: false, error: "Introuvable" }, 404);
}
