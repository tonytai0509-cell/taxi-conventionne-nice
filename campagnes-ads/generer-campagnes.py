"""Campagnes Google Ads ciblées : génère
 - campagnes-ads/import-google-ads-editor.csv (import dans Google Ads Editor, campagnes EN PAUSE)
 - campagnes-ads/plan-google-ads.md (plan lisible, réglages manuels)
et vérifie les limites Google (titres 30, descriptions 90, chemins 15, accroches 25,
liens annexes 25/35) et les règles d'annonce (pas de numéro de téléphone, pas de « ! » dans
les titres, pas de symboles décoratifs)."""
import csv, io, re, sys, os

SORTIE = sys.argv[1]
BASE = "https://taxi-conventionne06.fr/"
JOURS = 30  # durée d'exemple ; budget/jour = budget total / jours

# ---------- Négatifs ----------
NEG_COMMUNS = [
    # autres services de transport
    "aéroport", "aeroport", "airport", "aérogare", "terminal", "transfert", "navette", "gare", "port",
    "vtc", "uber", "bolt", "heetch", "free now", "blablacar", "chauffeur privé",
    "ambulance", "ambulancier", "vsl", "bus", "tram", "train",
    # emploi / profession / côté chauffeur
    "emploi", "recrutement", "recrute", "offre", "salaire", "embauche", "job", "candidature",
    "formation", "examen", "cours", "carte professionnelle", "devenir", "licence", "agrément", "agrement",
    "autorisation de stationnement", "convention type", "avenant", "tarif conventionnel", "grille tarifaire",
    "facturation", "logiciel", "taximètre", "syndicat", "fédération", "location", "à vendre", "vente", "achat",
    # recherche d'information pure
    "cerfa", "formulaire", "wikipedia", "définition",
    # autres villes (hors zones des 4 campagnes)
    "antibes", "cannes", "grasse", "monaco", "menton", "vence", "villeneuve loubet", "biot", "valbonne",
    "mougins", "mandelieu", "beausoleil", "cap d'ail", "roquebrune", "villefranche", "beaulieu", "eze",
    "la trinité", "saint andré de la roche", "contes", "levens", "saint jeannet", "la gaude", "gattières",
    "le broc", "saint martin du var", "toulon", "fréjus", "draguignan", "marseille", "paris", "lyon",
]
NEG_SLV = ["saint laurent du var", "st laurent du var", "saint laurent", "st laurent", "tzanck"]
NEG_CAGNES = ["cagnes", "cagnes sur mer", "polyclinique saint jean"]
NEG_CARROS = ["carros"]

# ---------- Textes partagés ----------
D_PEC = "Prise en charge possible sur prescription médicale de transport, selon vos droits."
D_RESA = "Demandez votre transport en ligne ou appelez la centrale. Rappel pour confirmer."
T_COMMUNS = ["Aller, retour ou aller-retour", "Selon prescription médicale", "Demandez votre transport",
             "Réservation en ligne rapide", "La centrale vous rappelle", "Taxi conventionné 7j/7"]

C = []

C.append(dict(
    nom="Taxi conventionné - Nice", court="Nice", page="taxi-conventionne-trajets-nice", part=0.60, total=(480, 600),
    h1="Taxi conventionné à Nice pour vos trajets dans Nice",
    neg=NEG_SLV + NEG_CAGNES + NEG_CARROS,
    groupes=[
        dict(nom="Nice - Taxi conventionné", cpc=1.80, chemins=("Nice", "Trajets-Nice"),
             exact=["taxi conventionné nice", "taxi conventionné nice nice", "taxi conventionné à nice",
                    "taxi conventionné dans nice", "taxi cpam nice", "taxi agréé cpam nice",
                    "taxi conventionné sécurité sociale nice", "numéro taxi conventionné nice"],
             phrase=["taxi conventionné nice", "taxi cpam nice", "taxi agréé cpam nice"],
             titres=["Taxi conventionné Nice", "Pour vos trajets dans Nice", "Taxi conventionné à Nice",
                     "D'une adresse à l'autre à Nice", "Trajets médicaux dans Nice", "Taxi agréé CPAM à Nice"]
                    + T_COMMUNS + ["Votre rendez-vous médical", "Taxi pour RDV médical à Nice"],
             descs=["Un taxi conventionné pour votre rendez-vous médical, d'une adresse à l'autre dans Nice.",
                    "Pour vos trajets médicaux dans Nice : aller, retour ou aller-retour.", D_PEC, D_RESA]),
        dict(nom="Nice - Hôpitaux", cpc=1.80, chemins=("Nice", "Hopitaux"),
             exact=["taxi conventionné chu pasteur nice", "taxi conventionné pasteur nice",
                    "taxi conventionné hôpital pasteur", "taxi conventionné lacassagne nice",
                    "taxi conventionné centre antoine lacassagne", "taxi conventionné cimiez nice",
                    "taxi conventionné hôpital cimiez", "taxi conventionné archet nice",
                    "taxi conventionné hôpital archet", "taxi conventionné chu nice"],
             phrase=["taxi conventionné pasteur", "taxi conventionné lacassagne", "taxi conventionné cimiez",
                     "taxi conventionné archet", "taxi conventionné chu nice"],
             titres=["Taxi conventionné Nice", "Vers le CHU Pasteur à Nice", "Hôpital de Cimiez à Nice",
                     "Centre Antoine Lacassagne", "Hôpital de l'Archet à Nice", "Pour vos trajets dans Nice",
                     "Domicile vers hôpital à Nice", "Retour à domicile à Nice"] + T_COMMUNS,
             descs=["Votre taxi conventionné dans Nice : CHU Pasteur, Cimiez, Lacassagne, l'Archet.",
                    "De votre domicile à l'hôpital dans Nice, et retour si besoin. Aller-retour possible.",
                    D_PEC, D_RESA]),
        dict(nom="Nice - Rendez-vous médical", cpc=1.50, chemins=("Nice", "RDV-medical"),
             exact=["taxi rendez-vous médical nice", "taxi rdv médical nice", "transport rendez-vous médical nice",
                    "transport médical assis nice", "taxi médical nice", "taxi pour hôpital nice"],
             phrase=["taxi rendez-vous médical nice", "transport rendez-vous médical nice",
                     "transport médical assis nice", "taxi médical nice"],
             titres=["Taxi pour RDV médical à Nice", "Transport RDV médical Nice", "Taxi conventionné Nice",
                     "Pour vos trajets dans Nice", "Transport médical assis", "Votre rendez-vous médical",
                     "Vers le CHU Pasteur à Nice"] + T_COMMUNS,
             descs=["Un transport pour rendez-vous médical dans Nice, avec un taxi conventionné.",
                    "Consultation, examen, soins : aller, retour ou aller-retour dans Nice.", D_PEC, D_RESA]),
    ]))


def commune(nom, court, page, cle, cle_alt, h1, neg, hopital_local, desc1, chemin, tc):
    """Campagne commune voisine <-> Nice : 2 groupes (trajet vers Nice / hôpitaux de Nice)."""
    k = cle  # ex. "saint laurent du var"
    exact_trajet = [f"taxi conventionné {k} nice", f"taxi conventionné nice {k}", f"taxi conventionné {k}",
                    f"taxi conventionné à {k}", f"taxi cpam {k}", f"taxi agréé cpam {k}",
                    f"transport médical {k} nice", f"taxi rendez-vous médical {k}"] + \
                   [f"taxi conventionné {a}" for a in cle_alt] + [f"taxi conventionné {a} nice" for a in cle_alt]
    phrase_trajet = [f"taxi conventionné {k}", f"taxi cpam {k}", f"transport médical {k}"] + \
                    [f"taxi conventionné {a}" for a in cle_alt]
    exact_hop = [f"taxi conventionné {k} chu pasteur nice", f"taxi conventionné {k} pasteur",
                 f"taxi conventionné {k} lacassagne", f"taxi conventionné {k} archet",
                 f"taxi conventionné {k} cimiez"] + hopital_local[0]
    phrase_hop = hopital_local[1]
    titres_c = tc + ["Votre RDV médical à Nice", "Retour à domicile possible"]
    return dict(
        nom=f"Taxi conventionné - {nom} - Nice", court=nom, page=page, part=0.40 / 3, total=(106.67, 133.33),
        h1=h1, neg=neg,
        groupes=[
            dict(nom=f"{nom} - Trajet vers Nice", cpc=1.50, chemins=(chemin, "Nice"),
                 exact=exact_trajet, phrase=phrase_trajet,
                 titres=titres_c + T_COMMUNS + ["Taxi agréé CPAM", "Vers le CHU Pasteur à Nice"],
                 descs=[desc1, f"Aller vers Nice, retour à {nom}, ou les deux : précisez-le.", D_PEC, D_RESA]),
            dict(nom=f"{nom} - Hôpitaux de Nice", cpc=1.50, chemins=(chemin, "Hopitaux-Nice"),
                 exact=exact_hop, phrase=phrase_hop,
                 titres=titres_c + ["Vers le CHU Pasteur à Nice", "Centre Antoine Lacassagne",
                                    "Hôpital de Cimiez à Nice", "Hôpital de l'Archet à Nice"] + T_COMMUNS[:4],
                 descs=[f"De {nom} vers l'hôpital à Nice : CHU Pasteur, Lacassagne, Cimiez, l'Archet.",
                        f"Aller vers Nice, retour à {nom}, ou les deux : précisez-le.", D_PEC, D_RESA]),
        ])


C.append(commune("Saint-Laurent-du-Var", "St-Laurent-du-Var", "taxi-conventionne-saint-laurent-du-var-nice",
                 "saint laurent du var", ["st laurent du var"],
                 "Taxi conventionné entre Saint-Laurent-du-Var et Nice", NEG_CAGNES + NEG_CARROS,
                 (["taxi conventionné institut arnault tzanck", "taxi conventionné tzanck saint laurent du var"],
                  ["taxi conventionné tzanck"]),
                 "Taxi conventionné de Saint-Laurent-du-Var à Nice pour votre rendez-vous médical.", "St-Laurent", ["Taxi conventionné St-Laurent", "St-Laurent-du-Var et Nice", "De St-Laurent-du-Var à Nice"]))
C.append(commune("Cagnes-sur-Mer", "Cagnes-sur-Mer", "taxi-conventionne-cagnes-sur-mer-nice",
                 "cagnes sur mer", ["cagnes"],
                 "Taxi conventionné entre Cagnes-sur-Mer et Nice", NEG_SLV + NEG_CARROS,
                 (["taxi conventionné polyclinique saint jean cagnes"], ["taxi conventionné polyclinique saint jean"]),
                 "Réservez votre trajet médical de Cagnes-sur-Mer vers Nice, retour possible.", "Cagnes", ["Taxi conventionné Cagnes", "Entre Cagnes-sur-Mer et Nice", "De Cagnes-sur-Mer vers Nice"]))
C.append(commune("Carros", "Carros", "taxi-conventionne-carros-nice", "carros", [],
                 "Taxi conventionné entre Carros et Nice", NEG_SLV + NEG_CAGNES, ([], []),
                 "Un taxi conventionné entre Carros et Nice pour votre RDV médical, aller comme retour.", "Carros", ["Taxi conventionné Carros", "Entre Carros et Nice", "De Carros vers Nice"]))

# ---------- Composants (assets) ----------
ACCROCHES = ["Taxi conventionné CPAM", "Aller-retour possible", "Rappel de la centrale", "Réservation en ligne",
             "Disponible 7j/7", "Selon prescription"]
LIENS = [("Demander un transport", "Formulaire en ligne", "La centrale vous rappelle", "#reserver"),
         ("Exemples de trajets", "Domicile vers l'hôpital", "Aller, retour, aller-retour", ""),
         ("Questions fréquentes", "Prise en charge, documents", "Aller-retour, délais", "#faq")]

# ---------- Vérifications ----------
err = []
TEL = re.compile(r"\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}")
INTERDITS = re.compile(r"[↔⇄→!★✓€]")


def verifier(txt, maxi, ou, titre=False):
    if len(txt) > maxi: err.append(f"{ou} : {len(txt)} > {maxi} : {txt}")
    if TEL.search(txt): err.append(f"{ou} : numéro de téléphone interdit : {txt}")
    if INTERDITS.search(txt): err.append(f"{ou} : symbole interdit : {txt}")


for c in C:
    for g in c["groupes"]:
        if not (3 <= len(g["titres"]) <= 15): err.append(f"{g['nom']} : {len(g['titres'])} titres")
        if len(set(g["titres"])) != len(g["titres"]): err.append(f"{g['nom']} : titres en double")
        if not (2 <= len(g["descs"]) <= 4): err.append(f"{g['nom']} : {len(g['descs'])} descriptions")
        for t in g["titres"]: verifier(t, 30, g["nom"], True)
        for d in g["descs"]: verifier(d, 90, g["nom"])
        for p in g["chemins"]: verifier(p, 15, g["nom"])
        if len(set(g["exact"])) != len(g["exact"]): err.append(f"{g['nom']} : mots-clés exacts en double")
        # un mot-clé ne doit pas être bloqué par un négatif de sa propre campagne
        for k in g["exact"] + g["phrase"]:
            for n in NEG_COMMUNS + c["neg"]:
                if re.search(r"(^| )" + re.escape(n) + r"( |$)", k):
                    err.append(f"{g['nom']} : « {k} » bloqué par le négatif « {n} »")
for a in ACCROCHES: verifier(a, 25, "accroche")
for l in LIENS:
    verifier(l[0], 25, "lien annexe"); verifier(l[1], 35, "lien annexe"); verifier(l[2], 35, "lien annexe")
if err:
    print("\n".join(err)); sys.exit(1)

eur = lambda x: f"{x:.2f}".replace(".00", "").replace(".", ",")
budget_jour = lambda c: round(sum(c["total"]) / 2 / JOURS, 2)  # milieu de fourchette / jours

# ---------- CSV Google Ads Editor ----------
COLS = ["Campaign", "Campaign Type", "Networks", "Budget", "Budget type", "Bid Strategy Type", "Languages",
        "Campaign Status", "Ad Group", "Max CPC", "Ad Group Status", "Keyword", "Criterion Type", "Status",
        "Ad type"] + [f"Headline {i}" for i in range(1, 16)] + [f"Description {i}" for i in range(1, 5)] + \
       ["Path 1", "Path 2", "Final URL"]
lignes = []
for c in C:
    lignes.append({"Campaign": c["nom"], "Campaign Type": "Search", "Networks": "Google search",
                   "Budget": f"{budget_jour(c):.2f}", "Budget type": "Daily", "Bid Strategy Type": "Manual CPC",
                   "Languages": "fr", "Campaign Status": "Paused"})
    for n in NEG_COMMUNS + c["neg"]:
        lignes.append({"Campaign": c["nom"], "Keyword": n, "Criterion Type": "Negative Phrase"})
    for g in c["groupes"]:
        lignes.append({"Campaign": c["nom"], "Ad Group": g["nom"], "Max CPC": f"{g['cpc']:.2f}",
                       "Ad Group Status": "Enabled"})
        for k in g["exact"]:
            lignes.append({"Campaign": c["nom"], "Ad Group": g["nom"], "Keyword": k, "Criterion Type": "Exact", "Status": "Enabled"})
        for k in g["phrase"]:
            lignes.append({"Campaign": c["nom"], "Ad Group": g["nom"], "Keyword": k, "Criterion Type": "Phrase", "Status": "Enabled"})
        ad = {"Campaign": c["nom"], "Ad Group": g["nom"], "Ad type": "Responsive search ad", "Status": "Enabled",
              "Path 1": g["chemins"][0], "Path 2": g["chemins"][1], "Final URL": BASE + c["page"]}
        for i, t in enumerate(g["titres"], 1): ad[f"Headline {i}"] = t
        for i, d in enumerate(g["descs"], 1): ad[f"Description {i}"] = d
        lignes.append(ad)
buf = io.StringIO()
w = csv.DictWriter(buf, fieldnames=COLS, lineterminator="\r\n")
w.writeheader(); w.writerows(lignes)
open(os.path.join(SORTIE, "import-google-ads-editor.csv"), "w", encoding="utf-8-sig").write(buf.getvalue())

# ---------- Plan Markdown ----------
L = ["# Campagnes Google Ads : taxi conventionné, trajets médicaux vers Nice", "",
     "> **Statut : toutes les campagnes sont EN PAUSE.** Rien ne dépense tant que vous ne les activez pas.", "",
     f"Budget total 800 à 1 000 €. Les budgets par jour ci-dessous sont calculés pour {JOURS} jours "
     "au milieu de la fourchette (900 €). Si la durée change : budget par jour = budget de la campagne ÷ nombre de jours.", "",
     "## Récapitulatif", "",
     "| Campagne | URL de destination | Titre principal | Part | Budget total | Par jour |", "|---|---|---|---|---|---|"]
for c in C:
    L.append(f"| {c['court']} | {BASE}{c['page']} | {c['h1']} | {round(c['part']*100, 2):g} % | "
             f"{eur(c['total'][0])} à {eur(c['total'][1])} € | {eur(budget_jour(c))} € |".replace("13.33", "13,33"))
L += ["", "## Pourquoi cette structure", "",
      "- **Une campagne par trajet**, pour garder la répartition du budget : 60 % Nice, 13,33 % pour chacune des 3 communes.",
      "- **Plusieurs groupes d'annonces par campagne**, selon ce que la personne cherche : le taxi conventionné, "
      "un hôpital précis ou un rendez-vous médical. Chaque groupe a son annonce, qui reprend les mots de la recherche.",
      "- **Uniquement des mots-clés exacts et expression**, pas de requête large : on ne paie que pour des recherches proches.",
      "- **Négatifs croisés** : une recherche qui nomme Saint-Laurent, Cagnes ou Carros ne déclenche jamais Nice. "
      "Elle va dans la campagne de sa commune.",
      "- **Négatifs communs** : aéroport, VTC et Uber ; emploi et formation ; recherches côté chauffeur (agrément, "
      "tarifs conventionnels, logiciel) ; autres villes hors zone.",
      "- **Aucun numéro dans le texte des annonces** : Google l'interdit. Le numéro passe par l'extension d'appel.",
      "- **Aucune promesse de remboursement** : toujours « sur prescription, selon vos droits ».", "",
      "## Réglages à faire à la main (5 minutes par campagne)", "",
      "L'import ne gère pas ces réglages de façon fiable. Faites-les dans Google Ads Editor avant de publier :", "",
      "1. **Zones** :",
      "   - campagne Nice : *Nice* ;",
      "   - chaque commune voisine : *la commune* + *Nice* (pour les retours demandés depuis Nice).",
      "   - Dans « Options de zone », choisir **Présence : personnes situées ou régulièrement présentes dans vos zones**.",
      "2. **Réseaux** : décocher *Partenaires du Réseau de Recherche* et *Réseau Display*.",
      "3. **Objectif de conversion** : *Demande envoyée*, plus *Clic Appeler* une fois créée.",
      "4. **Composants** (au niveau du compte, valables pour les 4 campagnes) :",
      "   - Appel : 06 24 83 64 48, aux horaires où la centrale répond.",
      "   - Accroches : " + " · ".join(ACCROCHES),
      "   - Liens annexes (vers la page de chaque campagne) :"]
for l in LIENS:
    L.append(f"     - **{l[0]}**, « {l[1]} » / « {l[2]} », ancre `{l[3] or '(haut de page)'}`")
L += ["", "## Enchères", "",
      "- **Départ** : CPC manuel, plafonné. Nice 1,80 € (rendez-vous médical 1,50 €), communes 1,50 €. "
      "Avec de petits budgets, cela évite qu'un seul clic à 6 € vide la journée.",
      "- **Après 15 à 30 conversions**, passer en **Maximiser les conversions**. Cela prend souvent 2 à 4 semaines.",
      "- Si une campagne n'a aucune impression au bout de 3 jours, monter le CPC de 0,30 €.", "",
      "## Détail des campagnes", ""]
for c in C:
    L += [f"### {c['nom']} ({eur(budget_jour(c))} €/jour)", "", f"URL : {BASE}{c['page']}", "",
          "**Négatifs propres** : " + ", ".join(c["neg"]), ""]
    for g in c["groupes"]:
        L += [f"#### Groupe « {g['nom']} » (CPC max {eur(g['cpc'])} €)", "",
              f"Chemin affiché : taxi-conventionne06.fr/{g['chemins'][0]}/{g['chemins'][1]}", "",
              "Mots-clés exacts : " + " · ".join(f"[{k}]" for k in g["exact"]), "",
              "Mots-clés expression : " + " · ".join(f'"{k}"' for k in g["phrase"]), "",
              "Titres : " + " · ".join(g["titres"]), "", "Descriptions :", ""] + [f"- {d}" for d in g["descs"]] + [""]
L += ["## Négatifs communs (toutes les campagnes)", "", ", ".join(NEG_COMMUNS), "",
      "## Points à relire avant activation", "",
      "- « ambulance » et « vsl » sont exclus : retirez-les si vous voulez apparaître sur ces recherches.",
      "- « gare » et « port » sont exclus, comme les transferts.",
      "- « Taxi conventionné Saint-Laurent-du-Var » (sans Nice) déclenche la campagne SLV : la plupart des trajets "
      "médicaux depuis SLV vont à Nice. Même logique pour Cagnes et Carros. Sans ces mots-clés, ces campagnes "
      "n'auraient presque aucune recherche.",
      "- Les budgets des 3 communes (≈ 4 €/jour) sont faibles : comptez 2 à 4 clics par jour au mieux.", ""]
open(os.path.join(SORTIE, "plan-google-ads.md"), "w", encoding="utf-8").write("\n".join(L))
nb = lambda key: sum(len(g[key]) for c in C for g in c["groupes"])
print(f"OK : {len(C)} campagnes, {sum(len(c['groupes']) for c in C)} groupes, {nb('exact')} exacts, "
      f"{nb('phrase')} expressions, {nb('titres')} titres, {nb('descs')} descriptions ; {len(lignes)} lignes CSV")
