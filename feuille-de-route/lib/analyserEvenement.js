// Transforme un evenement brut de l'API Google Calendar en course structuree
// pour la feuille de route. Les evenements crees par le site
// (functions/.netlify/functions/reserver.js) et par le bot SMS suivent tous
// le meme format de description ("PC : ...", "DEST : ...", "RDV : ...",
// "TEL : ...", "REF : ..."), une ligne par champ : on la reconnait pour
// afficher des champs propres. Un evenement qui ne suit pas ce format
// (rendez-vous saisi a la main, invitation externe...) reste affichable
// grace au repli sur le titre/lieu/description bruts.

const CHAMPS = [
  { cle: "priseEnCharge", motif: /^\s*PC\s*:\s*(.+)$/i },
  { cle: "destination", motif: /^\s*DEST\s*:\s*(.+)$/i },
  { cle: "heureRdv", motif: /^\s*RDV\s*:\s*(.+)$/i },
  { cle: "telephone", motif: /^\s*TEL\s*:\s*(.+)$/i },
  { cle: "reference", motif: /^\s*REF\s*:\s*(.+)$/i },
];

export function analyserEvenement(event) {
  const description = event.description || "";
  const lignes = description.split(/\r?\n/);
  const champs = {};
  for (const ligne of lignes) {
    for (const { cle, motif } of CHAMPS) {
      if (champs[cle] !== undefined) continue;
      const correspondance = ligne.match(motif);
      if (correspondance) champs[cle] = correspondance[1].trim();
    }
  }

  const texteComplet = `${event.summary || ""} ${description}`;
  const accompagnant = /ACCOMPAGNANT/i.test(texteComplet);
  const bonTransportRetour = /BT\s*(:|AU RETOUR)/i.test(texteComplet) && /RETOUR/i.test(texteComplet);
  const type = /\[MED\]|M[EÉ]DICAL/i.test(texteComplet) ? "medical" : /\[PRIVE\]|PRIV[EÉ]/i.test(texteComplet) ? "prive" : null;

  return {
    id: event.id,
    titre: event.summary || "(sans titre)",
    debut: event.start?.dateTime || event.start?.date || null,
    fin: event.end?.dateTime || event.end?.date || null,
    journeeEntiere: !event.start?.dateTime,
    lieu: event.location || null,
    priseEnCharge: champs.priseEnCharge || event.location || null,
    destination: champs.destination || null,
    heureRdv: champs.heureRdv || null,
    telephone: champs.telephone || null,
    reference: champs.reference || null,
    type,
    accompagnant,
    bonTransportRetour,
    descriptionBrute: description || null,
    lienGoogle: event.htmlLink || null,
  };
}
