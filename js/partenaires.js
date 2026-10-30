// Espace partenaires (partenaires.html) : courses Google Ads partagees,
// bilan du mois et gestion (administrateur). API : functions/partenaires.js.
(function () {
  "use strict";

  var JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var moi = null;
  var jour = isoAujourdhui();
  var mois = jour.slice(0, 7);
  var moisBudget = mois;
  var semaineMes = isoAujourdhui();
  var mesCourses = [];
  var adsSemaine = [];

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte != null) e.textContent = texte;
    return e;
  }

  function isoAujourdhui() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function decaler(iso, n) {
    var d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function decalerMois(m, n) {
    var a = Number(m.slice(0, 4)), mm = Number(m.slice(5, 7)) - 1 + n;
    a += Math.floor(mm / 12);
    mm = ((mm % 12) + 12) % 12;
    return a + "-" + String(mm + 1).padStart(2, "0");
  }

  function titreJour(iso) {
    var d = new Date(iso + "T12:00:00");
    var t = JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()];
    if (iso === isoAujourdhui()) t = "Aujourd'hui · " + t;
    else if (iso === decaler(isoAujourdhui(), 1)) t = "Demain · " + t;
    return t;
  }

  // « 2026-10-31 08:12:00 » (UTC, D1) -> « 09h12 » heure de Paris.
  function heureLocale(utc) {
    var d = new Date(String(utc).replace(" ", "T") + "Z");
    if (isNaN(d)) return "";
    return String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
  }

  function titreMois(m) { return MOIS[Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4); }
  function heure(h) { return h ? h.replace(":", "h") : ""; }
  function euros(n) { return n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €"; }

  function message(texte) {
    var m = $("pMessage");
    m.textContent = texte;
    m.hidden = false;
    clearTimeout(message.t);
    message.t = setTimeout(function () { m.hidden = true; }, 3500);
  }

  function api(methode, chemin, corps) {
    return fetch("/api/partenaires" + chemin, {
      method: methode,
      credentials: "same-origin",
      headers: corps ? { "Content-Type": "application/json" } : {},
      body: corps ? JSON.stringify(corps) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { afficherConnexion(); throw new Error("Non connecté"); }
        if (!r.ok || j.ok === false) throw new Error(j.error || "Erreur, réessayez.");
        return j;
      });
    });
  }

  // ----- Connexion -----
  function afficherConnexion(texte) {
    $("pAppli").hidden = true;
    $("pConnexion").hidden = false;
    $("pTitre").textContent = "Espace partenaires";
    $("pQui").textContent = "taxi-conventionne06.fr/partenaires";
    if (texte) $("pConnexionTexte").textContent = texte;
  }

  // ----- Ligne repliable : « 08h15  45 bd Gambetta → Archet », detail au toucher -----
  var ouvertes = {};

  // Debut d'adresse : avant la virgule et le code postal, voies abregees.
  function adresseCourte(a) {
    var s = String(a || "").split(",")[0].replace(/\s*\b\d{5}\b.*$/, "").trim();
    s = s.replace(/\bboulevard\b/gi, "bd").replace(/\bavenue\b/gi, "av.").replace(/\bchemin\b/gi, "ch.")
      .replace(/\broute\b/gi, "rte").replace(/\bplace\b/gi, "pl.").replace(/\ballée\b/gi, "all.")
      .replace(/^hôpital\b/i, "Hôp.").replace(/^clinique\b/i, "Clin.").replace(/^centre\b/i, "Ctre").replace(/\bmaréchal\b/gi, "Mal");
    return s || String(a || "");
  }

  function ligneRepliable(cle, heureTexte, depart, destination, pastille, classeEtat, detail) {
    var bloc = el("div", "p-repli " + classeEtat + (ouvertes[cle] ? " ouverte" : ""));
    var tete = el("button", "p-repli-tete");
    tete.type = "button";
    tete.appendChild(el("span", "p-pastille", pastille));
    tete.appendChild(el("span", "p-repli-heure", heureTexte));
    tete.appendChild(el("span", "p-repli-trajet", adresseCourte(depart) + " → " + adresseCourte(destination)));
    tete.appendChild(el("span", "p-repli-fleche", "▾"));
    tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
    detail.hidden = !ouvertes[cle];
    tete.addEventListener("click", function () {
      ouvertes[cle] = !ouvertes[cle];
      detail.hidden = !ouvertes[cle];
      bloc.classList.toggle("ouverte", !!ouvertes[cle]);
      tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
    });
    bloc.appendChild(tete);
    bloc.appendChild(detail);
    return bloc;
  }

  function ligneCourse(c) {
    var etat = c.annulee ? "annulee" : c.dansCaree ? "prise" : "libre";
    var pastille = c.annulee ? "✕" : c.dansCaree ? "✓" : "●";
    return ligneRepliable("c" + c.id, heure(c.heurePc) || "RDV " + heure(c.heureRdv), c.depart, c.destination, pastille, etat, carteCourse(c));
  }

  function ligneMaCourse(c) {
    return ligneRepliable("m" + c.id, c.pcADefinir ? "PC ?" : heure(c.heurePc) || "RDV " + heure(c.heureRdv), c.depart, c.destination,
      c.saisie ? "✓" : "●", c.saisie ? "prise" : "a-saisir", carteMaCourse(c));
  }

  // ----- Carte d'une course -----
  function carteCourse(c) {
    var carte = el("div", "p-carte" + (c.annulee ? " annulee" : ""));
    var l1 = el("div", "p-l1");
    l1.appendChild(el("span", "p-heure", heure(c.heurePc) || "RDV " + heure(c.heureRdv)));
    l1.appendChild(el("span", "p-type", c.type === "prive" ? "Course privée" : "Transport médical"));
    l1.appendChild(el("span", "p-ads", "GOOGLE ADS"));
    carte.appendChild(l1);
    if (c.parTelephone) carte.appendChild(el("span", "p-tel", "📞 PAR TÉLÉPHONE · ajoutée par " + c.ajouteePar));
    var adr = el("div", "p-adr");
    adr.appendChild(document.createTextNode("📍 "));
    adr.appendChild(el("b", null, c.depart));
    adr.appendChild(document.createElement("br"));
    adr.appendChild(document.createTextNode(c.type === "prive" ? "🏁 " : "🏥 "));
    adr.appendChild(el("b", null, c.destination));
    if (c.heureRdv && c.heurePc) adr.appendChild(document.createTextNode(" · RDV " + heure(c.heureRdv)));
    carte.appendChild(adr);
    var infos = [c.options, c.commentaire].filter(Boolean).join(" · ");
    if (infos) carte.appendChild(el("div", "p-info", infos));

    // Dispatch dans Caree : on note seulement qui l'y a mise.
    var etat = el("div", "p-etat " + (c.dansCaree ? "pris" : "libre"));
    if (c.annulee) {
      etat.className = "p-etat";
      etat.textContent = "✕ Annulée";
    } else {
      var caree = el("button", "p-caree" + (c.dansCaree ? " fait" : ""),
        c.dansCaree ? "✓ Mise dans Caree par " + c.careePar + (c.careeLe ? " · " + heureLocale(c.careeLe) : "") : "☐ Pas encore dans Caree");
      caree.addEventListener("click", function () {
        if (c.dansCaree && !confirm("Elle n'est finalement pas dans Caree ?")) return;
        caree.disabled = true;
        api("POST", "/courses/" + c.id + "/caree").then(recharger).catch(function (e) { message(e.message); recharger(); });
      });
      etat.appendChild(caree);
    }
    if (moi.admin) {
      var ann = el("button", "p-petit-bouton", c.annulee ? "Rétablir" : "Annuler");
      ann.addEventListener("click", function () {
        if (!c.annulee && !confirm("Marquer cette course comme annulée ?")) return;
        api("POST", "/courses/" + c.id + "/annuler").then(recharger).catch(function (e) { message(e.message); });
      });
      etat.appendChild(ann);
    }
    carte.appendChild(etat);

    if (c.client && (c.client.nom || c.client.telephone)) {
      var cl = el("div", "p-client");
      cl.appendChild(document.createTextNode("👤 " + (c.client.nom || "Client") + " "));
      [c.client.telephone, c.client.telephone2].filter(Boolean).forEach(function (t) {
        cl.appendChild(document.createTextNode("· 📞 "));
        var a = el("a", null, t);
        a.href = "tel:" + t.replace(/[^0-9+]/g, "");
        cl.appendChild(a);
        cl.appendChild(document.createTextNode(" "));
      });
      carte.appendChild(cl);
    }
    return carte;
  }

  // ----- Vue Jour -----
  function chargerJour() {
    $("pJourTitre").textContent = titreJour(jour);
    var liste = $("pListeJour");
    api("GET", "/courses?debut=" + jour).then(function (r) {
      liste.textContent = "";
      if (!r.courses.length) { liste.appendChild(el("div", "p-vide", "Aucune course Google Ads ce jour-là.")); return; }
      r.courses.forEach(function (c) { liste.appendChild(ligneCourse(c)); });
    }).catch(function () {});
  }

  // ----- Vue Semaine (7 jours a partir d'aujourd'hui) -----
  function chargerSemaine() {
    var debut = isoAujourdhui(), fin = decaler(debut, 6);
    var liste = $("pListeSemaine");
    api("GET", "/courses?debut=" + debut + "&fin=" + fin).then(function (r) {
      liste.textContent = "";
      if (!r.courses.length) { liste.appendChild(el("div", "p-vide", "Aucune course Google Ads cette semaine.")); return; }
      var dateCourante = null;
      r.courses.forEach(function (c) {
        if (c.date !== dateCourante) {
          dateCourante = c.date;
          var n = r.courses.filter(function (x) { return x.date === c.date; }).length;
          liste.appendChild(el("div", "p-titre-jour", titreJour(c.date) + " · " + n + " course" + (n > 1 ? "s" : "")));
        }
        liste.appendChild(ligneCourse(c));
      });
    }).catch(function () {});
  }

  // ----- Mes courses (administrateur) : recap des reservations de Tony -----
  var ORIGINES = { qr: "🔳 QR CODE", site: "🌐 SITE", client_tony: "⭐ VOTRE CLIENT", ads: "🎯 GOOGLE ADS" };

  function heureMa(c) {
    if (c.pcADefinir) return "PC à définir";
    return heure(c.heurePc) || "RDV " + heure(c.heureRdv);
  }

  function carteMaCourse(c) {
    var carte = el("div", "p-carte" + (c.saisie ? " saisie" : ""));
    var l1 = el("div", "p-l1");
    l1.appendChild(el("span", "p-heure", heureMa(c)));
    l1.appendChild(el("span", "p-type", c.type === "prive" ? "Course privée" : "Transport médical"));
    l1.appendChild(el("span", "p-origine", ORIGINES[c.origine] || "🌐 SITE"));
    carte.appendChild(l1);
    var adr = el("div", "p-adr");
    adr.appendChild(document.createTextNode("📍 "));
    adr.appendChild(el("b", null, c.depart));
    adr.appendChild(document.createElement("br"));
    adr.appendChild(document.createTextNode("🏁 "));
    adr.appendChild(el("b", null, c.destination));
    if (c.heureRdv && (c.heurePc || c.pcADefinir)) adr.appendChild(document.createTextNode(" · RDV " + heure(c.heureRdv)));
    carte.appendChild(adr);
    var cl = el("div", "p-client");
    cl.appendChild(document.createTextNode("👤 " + (c.client.nom || "Client") + " "));
    [c.client.telephone, c.client.telephone2].filter(Boolean).forEach(function (t) {
      cl.appendChild(document.createTextNode("· 📞 "));
      var a = el("a", null, t);
      a.href = "tel:" + t.replace(/[^0-9+]/g, "");
      cl.appendChild(a);
      cl.appendChild(document.createTextNode(" "));
    });
    carte.appendChild(cl);
    var infos = [c.options, c.reservePar ? "Réservé par " + c.reservePar : "", c.commentaire ? "💬 " + c.commentaire : ""].filter(Boolean).join(" · ");
    if (infos) carte.appendChild(el("div", "p-info", infos));
    var b = el("button", "p-saisie", c.saisie ? "✓ Saisie dans l'appli" : "☐ Pas encore saisie");
    b.addEventListener("click", function () {
      api("POST", "/admin/mes-courses/" + c.id + "/saisie").then(chargerMes).catch(function (e) { message(e.message); });
    });
    carte.appendChild(b);
    return carte;
  }

  function chargerMes() {
    var fin = decaler(semaineMes, 6);
    var d1 = new Date(semaineMes + "T12:00:00"), d2 = new Date(fin + "T12:00:00");
    $("pMesTitre").textContent = "Du " + d1.getDate() + " " + MOIS[d1.getMonth()] + " au " + d2.getDate() + " " + MOIS[d2.getMonth()];
    var liste = $("pListeMes");
    // Courses Google Ads de la meme semaine, pour le recap « Copier ».
    adsSemaine = [];
    api("GET", "/courses?debut=" + semaineMes + "&fin=" + fin).then(function (r) {
      adsSemaine = r.courses.filter(function (c) { return !c.annulee; }).map(function (c) {
        return { date: c.date, heurePc: c.heurePc, heureRdv: c.heureRdv, pcADefinir: false, type: c.type, origine: "ads",
          depart: c.depart, destination: c.destination, client: c.client || {}, reservePar: null, commentaire: c.commentaire, options: c.options };
      });
    }).catch(function () {});
    api("GET", "/admin/mes-courses?debut=" + semaineMes + "&fin=" + fin).then(function (r) {
      mesCourses = r.courses;
      liste.textContent = "";
      if (!r.courses.length) { liste.appendChild(el("div", "p-vide", "Aucune réservation du site sur ces 7 jours.")); return; }
      var dateCourante = null;
      r.courses.forEach(function (c) {
        if (c.date !== dateCourante) {
          dateCourante = c.date;
          var n = r.courses.filter(function (x) { return x.date === c.date; }).length;
          liste.appendChild(el("div", "p-titre-jour", titreJour(c.date) + " · " + n + " course" + (n > 1 ? "s" : "")));
        }
        liste.appendChild(ligneMaCourse(c));
      });
    }).catch(function () {});
  }

  var NOMS_ORIGINE = { tout: "toutes les courses", ads: "courses Google Ads", qr: "courses QR code / cartes", site: "courses du site", client_tony: "courses de vos clients" };

  function texteMes(filtre) {
    var choix = mesCourses.concat(adsSemaine).filter(function (c) { return filtre === "tout" || (c.origine || "site") === filtre; });
    choix.sort(function (a, b) {
      var ha = a.heurePc || a.heureRdv || "", hb = b.heurePc || b.heureRdv || "";
      return a.date < b.date ? -1 : a.date > b.date ? 1 : ha < hb ? -1 : ha > hb ? 1 : 0;
    });
    if (!choix.length) return "";
    var lignes = ["Récap " + NOMS_ORIGINE[filtre] + " · " + $("pMesTitre").textContent.toLowerCase() + " (" + choix.length + ")"], dateCourante = null;
    choix.forEach(function (c) {
      if (c.date !== dateCourante) {
        dateCourante = c.date;
        if (lignes.length) lignes.push("");
        lignes.push(titreJour(c.date).replace(/^.* · /, "").toUpperCase());
      }
      lignes.push("- " + (filtre === "tout" ? "[" + (ORIGINES[c.origine] || "🌐 SITE") + "] " : "") + heureMa(c) + (c.heureRdv && (c.heurePc || c.pcADefinir) ? " (RDV " + heure(c.heureRdv) + ")" : "") +
        " · " + (c.type === "prive" ? "Privée" : "Médical") + " · " + (c.client.nom || "Client") +
        [c.client.telephone, c.client.telephone2].filter(Boolean).map(function (t) { return " " + t; }).join(""));
      lignes.push("  " + c.depart + " → " + c.destination);
      var infos = [c.options, c.reservePar ? "Réservé par " + c.reservePar : "", c.commentaire].filter(Boolean).join(" · ");
      if (infos) lignes.push("  " + infos);
    });
    return lignes.join("\n");
  }

  // ----- Vue Bilan -----
  function chiffre(v, t) {
    var c = el("div", "p-chiffre");
    c.appendChild(el("div", "v", v));
    c.appendChild(el("div", "t", t));
    return c;
  }

  function lienFacture(id) {
    var a = el("a", "p-facture-pdf", "📄 PDF");
    a.href = "/api/partenaires/factures/" + id;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function ligneFacture(titre, montant, paye, factureId) {
    var r = el("div", "p-facture");
    var g = el("div", "p-facture-txt");
    g.appendChild(el("b", null, titre));
    g.appendChild(el("span", paye ? "p-paye" : "p-du", (montant == null ? "" : euros(montant) + " · ") + (paye ? "✅ payée" : "🔴 à régler")));
    r.appendChild(g);
    r.appendChild(factureId ? lienFacture(factureId) : el("span", "p-petit", "PDF à venir"));
    return r;
  }

  function chargerBilan() {
    var zone = $("pBilan");
    // Chauffeur : seulement ses factures, tous mois confondus.
    if (!moi.admin) {
      $("pMoisTitre").parentNode.hidden = true;
      api("GET", "/mes-factures").then(function (r) {
        zone.textContent = "";
        var bloc = el("div", "p-bloc");
        bloc.appendChild(el("h3", null, "Mes factures"));
        if (!r.factures.length) bloc.appendChild(el("p", "p-petit", "Aucune facture pour le moment."));
        r.factures.forEach(function (f) {
          var t = titreMois(f.mois);
          bloc.appendChild(ligneFacture(t.charAt(0).toUpperCase() + t.slice(1), f.montant, f.paye, f.factureId));
        });
        zone.appendChild(bloc);
      }).catch(function () {});
      return;
    }
    $("pMoisTitre").textContent = "Bilan de " + titreMois(mois);
    api("GET", "/bilan?mois=" + mois).then(function (b) {
      zone.textContent = "";
      var grille = el("div", "p-chiffres");
      grille.appendChild(chiffre(String(b.total), "courses Google Ads"));
      grille.appendChild(chiffre(euros(b.depense), "budget dépensé"));
      grille.appendChild(chiffre(b.coutParCourse == null ? "—" : euros(b.coutParCourse), "coût par course"));
      grille.appendChild(chiffre(String(b.pasDansCaree), "pas encore dans Caree"));
      zone.appendChild(grille);
      if (b.parTelephone) zone.appendChild(el("p", "p-petit p-marge", "Dont " + b.parTelephone + " reçue(s) par téléphone."));

      var bloc = el("div", "p-bloc");
      bloc.appendChild(el("h3", null, "Factures du mois"));
      var aucune = true;
      b.partenaires.forEach(function (p) {
        if (p.budget == null && !p.factureId) return;
        aucune = false;
        bloc.appendChild(ligneFacture(p.nom, p.budget, p.paye, p.factureId));
      });
      if (aucune) bloc.appendChild(el("p", "p-petit", "Pas encore de facture pour ce mois (à faire dans Gestion)."));
      zone.appendChild(bloc);
    }).catch(function () {});
  }

  // ----- Gestion (administrateur) -----
  function afficherLien(nom, lien) {
    var z = $("pLienCree");
    z.textContent = "";
    z.hidden = false;
    z.appendChild(el("div", null, "Lien personnel de " + nom + " (à lui envoyer, ne le partagez pas ailleurs) :"));
    z.appendChild(el("div", "p-info", lien));
    var ligne = el("div", "p-ligne");
    var wa = el("a", null, "Envoyer par WhatsApp");
    wa.href = "https://wa.me/?text=" + encodeURIComponent("Ton accès à l'espace partenaires Google Ads de la Centrale Taxi Nice : " + lien);
    wa.target = "_blank";
    wa.rel = "noopener";
    ligne.appendChild(wa);
    var copier = el("button", null, "Copier");
    copier.type = "button";
    copier.addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject()).then(function () { message("Lien copié."); }, function () { prompt("Copiez le lien :", lien); });
    });
    ligne.appendChild(copier);
    z.appendChild(ligne);
  }

  function copierLien(lien) {
    (navigator.clipboard ? navigator.clipboard.writeText(lien) : Promise.reject()).then(function () { message("Lien copié."); }, function () { prompt("Copiez le lien :", lien); });
  }

  function lienWhatsApp(p, lien) {
    var numero = String(p.telephone || "").replace(/\D/g, "").replace(/^0(\d{9})$/, "33$1");
    return "https://wa.me/" + numero + "?text=" + encodeURIComponent("Ton accès à l'espace partenaires Google Ads de la Centrale Taxi Nice : " + lien);
  }

  // Interrupteur « actif » / « peut ajouter des courses ».
  function interrupteur(texte, actif, changer) {
    var l = el("label", "p-inter");
    var c = el("input");
    c.type = "checkbox";
    c.checked = actif;
    c.addEventListener("change", function () { changer(c.checked); });
    l.appendChild(c);
    l.appendChild(el("span", "p-inter-rond"));
    l.appendChild(el("span", "p-inter-texte", texte));
    return l;
  }

  function chargerPartenaires() {
    var zone = $("pListePartenaires");
    api("GET", "/admin/partenaires").then(function (r) {
      zone.textContent = "";
      r.partenaires.forEach(function (p) {
        var d = el("div", "p-partenaire" + (p.actif ? "" : " inactif"));
        var tete = el(p.admin ? "div" : "button", "p-part-tete");
        tete.appendChild(el("span", "nom", p.nom + (p.admin ? " (vous)" : "") + (p.actif ? "" : " · désactivé")));
        tete.appendChild(el("span", "det", p.telephone ? "📞 " + p.telephone : "pas de téléphone"));
        d.appendChild(tete);
        if (p.admin) { zone.appendChild(d); return; }
        // Options repliees : on touche le nom pour les afficher.
        var cle = "p" + p.id;
        tete.type = "button";
        tete.appendChild(el("span", "p-repli-fleche", "▾"));
        tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
        var options = el("div", "p-part-options");
        options.hidden = !ouvertes[cle];
        d.classList.toggle("ouverte", !!ouvertes[cle]);
        tete.addEventListener("click", function () {
          ouvertes[cle] = !ouvertes[cle];
          options.hidden = !ouvertes[cle];
          d.classList.toggle("ouverte", !!ouvertes[cle]);
          tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
        });
        function modifier(corps, apres) {
          return api("POST", "/admin/partenaires/" + p.id, corps).then(function (res) { if (apres) apres(res); chargerPartenaires(); }).catch(function (e) { message(e.message); chargerPartenaires(); });
        }
        var inters = el("div", "p-inters");
        inters.appendChild(interrupteur("Accès actif", p.actif, function (v) { modifier({ actif: v }); }));
        inters.appendChild(interrupteur("Peut ajouter des courses", p.peut_ajouter, function (v) { modifier({ peutAjouter: v }); }));
        options.appendChild(inters);

        var grille = el("div", "p-part-boutons");
        function bouton(texte, action, classe) {
          var b = el("button", classe || null, texte);
          b.type = "button";
          b.addEventListener("click", action);
          grille.appendChild(b);
        }
        if (p.lien) {
          bouton("📋 Copier le lien", function () { copierLien(p.lien); });
          bouton("💬 Envoyer sur WhatsApp", function () { window.open(lienWhatsApp(p, p.lien), "_blank", "noopener"); });
        } else {
          // Lien cree avant que le site le garde : il faut en refaire un.
          bouton("🔗 Créer un lien à copier", function () {
            if (!confirm("L'ancien lien de " + p.nom + " ne marchera plus. Continuer ?")) return;
            modifier({ nouveauLien: true }, function (res) { copierLien(res.lien); });
          }, "large");
        }
        bouton("✏️ Téléphone", function () {
          var t = prompt("Téléphone de " + p.nom + " :", p.telephone || "");
          if (t === null) return;
          modifier({ telephone: t });
        });
        bouton("🔄 Nouveau lien", function () {
          if (!confirm("Créer un nouveau lien pour " + p.nom + " ? L'ancien ne marchera plus.")) return;
          modifier({ nouveauLien: true }, function () { message("Nouveau lien créé : l'ancien ne marche plus."); });
        });
        options.appendChild(grille);
        d.appendChild(options);
        zone.appendChild(d);
      });
    }).catch(function () {});
  }

  // Ligne de permanence : le seul numero qui recoit les SMS des reservations.
  function chargerSms() {
    Promise.all([api("GET", "/admin/sms"), api("GET", "/admin/partenaires")]).then(function (r) {
      $("pSmsNumero").value = r[0].numero || "";
      $("pSmsActuel").textContent = r[0].numero ? "Les SMS partent actuellement au " + r[0].numero + "." : "Aucun numéro : personne ne reçoit de SMS.";
      // Liste deroulante des chauffeurs qui ont un numero.
      var choix = $("pSmsChauffeur");
      choix.textContent = "";
      var premier = el("option", null, "Choisir un chauffeur…");
      premier.value = "";
      choix.appendChild(premier);
      r[1].partenaires.filter(function (p) { return p.actif && p.telephone; }).forEach(function (p) {
        var o = el("option", null, p.nom + " · " + p.telephone);
        o.value = p.telephone;
        o.setAttribute("data-nom", p.nom);
        if (telephoneCle(p.telephone) === telephoneCle(r[0].numero)) o.selected = true;
        choix.appendChild(o);
      });
    }).catch(function () {});
  }

  function telephoneCle(t) {
    var c = String(t || "").replace(/\D/g, "");
    return c.length >= 9 ? c.slice(-9) : "";
  }

  function enregistrerSms(numero, nom) {
    api("POST", "/admin/sms", { numero: numero }).then(function () {
      message(numero ? "Les SMS iront maintenant " + (nom ? "à " + nom : "au " + numero) + "." : "Plus aucun SMS envoyé.");
      chargerSms();
    }).catch(function (e) { message(e.message); });
  }

  function chargerBudget() {
    $("pBudgetMois").textContent = titreMois(moisBudget);
    api("GET", "/bilan?mois=" + moisBudget).then(function (b) {
      $("pDepense").value = b.depense == null ? "" : b.depense;
      var zone = $("pParts");
      zone.textContent = "";
      zone.appendChild(el("p", "p-petit", "Facture de chacun pour ce mois :"));
      b.partenaires.forEach(function (p) {
        var bloc = el("div", "p-part-facture");
        var r = el("div", "p-part-budget");
        r.appendChild(el("span", null, p.nom));
        var montant = el("input");
        montant.type = "number"; montant.min = "0"; montant.step = "0.01"; montant.inputMode = "decimal"; montant.placeholder = "€";
        montant.value = p.budget == null ? "" : p.budget;
        var lab = el("label");
        var paye = el("input");
        paye.type = "checkbox"; paye.checked = p.paye;
        lab.appendChild(paye);
        lab.appendChild(document.createTextNode("payé"));
        function enregistrer() {
          api("POST", "/admin/budget", { mois: moisBudget, partenaireId: p.id, montant: Number(montant.value || 0), paye: paye.checked })
            .then(function () { message("Enregistré."); }).catch(function (e) { message(e.message); });
        }
        montant.addEventListener("change", enregistrer);
        paye.addEventListener("change", enregistrer);
        r.appendChild(montant);
        r.appendChild(lab);
        bloc.appendChild(r);

        // PDF de la facture : joindre / remplacer / ouvrir.
        var ligne = el("div", "p-part-pdf");
        var fichier = el("input");
        fichier.type = "file";
        fichier.accept = "application/pdf,.pdf";
        fichier.hidden = true;
        var joindre = el("button", null, p.factureId ? "📎 Remplacer la facture" : "📎 Joindre la facture");
        joindre.type = "button";
        joindre.addEventListener("click", function () { fichier.click(); });
        fichier.addEventListener("change", function () {
          var f = fichier.files[0];
          if (!f) return;
          if (f.size > 1800 * 1024) { message("PDF trop lourd (1,8 Mo maximum)."); return; }
          joindre.disabled = true;
          joindre.textContent = "Envoi…";
          fetch("/api/partenaires/admin/factures?mois=" + moisBudget + "&partenaire=" + p.id + "&nom=" + encodeURIComponent(f.name), {
            method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/pdf" }, body: f,
          }).then(function (rep) { return rep.json().then(function (j) { if (!rep.ok || !j.ok) throw new Error(j.error || "Envoi impossible."); }); })
            .then(function () { message("Facture de " + p.nom + " ajoutée."); chargerBudget(); })
            .catch(function (e) { message(e.message); chargerBudget(); });
        });
        ligne.appendChild(joindre);
        ligne.appendChild(fichier);
        if (p.factureId) ligne.appendChild(lienFacture(p.factureId));
        bloc.appendChild(ligne);
        zone.appendChild(bloc);
      });
    }).catch(function () {});
  }

  // ----- Formulaire d'ajout : suggestions d'adresses et heures au clavier -----
  function activerSuggestions(champ) {
    var liste = el("ul", "p-suggestions");
    liste.hidden = true;
    champ.parentNode.appendChild(liste);
    var minuterie = null, numero = 0;
    function fermer() { liste.hidden = true; liste.textContent = ""; }
    function afficher(elements) {
      liste.textContent = "";
      elements.forEach(function (e) {
        var li = el("li");
        li.appendChild(el("strong", null, e.titre));
        if (e.detail) li.appendChild(el("span", null, e.detail));
        li.addEventListener("mousedown", function (ev) { ev.preventDefault(); champ.value = e.valeur; fermer(); });
        liste.appendChild(li);
      });
      liste.hidden = !elements.length;
    }
    champ.addEventListener("input", function () {
      var texte = champ.value.trim();
      clearTimeout(minuterie);
      var connus = window.etablissementsConnus ? window.etablissementsConnus(texte) : [];
      afficher(connus);
      if (texte.length < 3) return;
      var moi = ++numero;
      minuterie = setTimeout(function () {
        fetch("/api/adresses?q=" + encodeURIComponent(texte)).then(function (r) { return r.json(); }).then(function (d) {
          if (moi !== numero) return;
          afficher(connus.concat((d.adresses || []).map(function (a) { return { titre: a, valeur: a }; })).slice(0, 7));
        }).catch(function () {});
      }, 250);
    });
    champ.addEventListener("blur", function () { setTimeout(fermer, 150); });
  }

  // Chiffres tapes -> heure : une heure qui commence par 3 a 9 n'a qu'un
  // chiffre (« 815 » = 08h15), sinon deux (« 1430 » = 14h30).
  function chiffresHeure(texte) {
    var c = String(texte || "").replace(/\D/g, "");
    if (/^[3-9]/.test(c)) c = "0" + c;
    return c.slice(0, 4);
  }

  // « 815 », « 0815 », « 8h15 », « 14 » -> « 08h15 », « 14h00 » ; "" si vide, null si invalide.
  function lireHeure(texte) {
    var c = chiffresHeure(texte);
    if (!c) return "";
    if (c.length <= 2) c = c.padStart(2, "0") + "00";
    if (c.length === 3) c = c + "0";
    var h = Number(c.slice(0, 2)), m = Number(c.slice(2, 4));
    if (c.length !== 4 || h > 23 || m > 59) return null;
    return String(h).padStart(2, "0") + "h" + String(m).padStart(2, "0");
  }

  function activerHeure(champ) {
    champ.addEventListener("input", function () {
      var c = chiffresHeure(champ.value);
      champ.value = c.length > 2 ? c.slice(0, 2) + "h" + c.slice(2) : c;
    });
    champ.addEventListener("blur", function () {
      var h = lireHeure(champ.value);
      if (h) champ.value = h;
      champ.classList.toggle("p-invalide", h === null);
    });
  }

  // ----- Onglets -----
  var vueActive = "jour";
  function recharger() {
    if (vueActive === "jour") chargerJour();
    if (vueActive === "semaine") chargerSemaine();
    if (vueActive === "bilan") chargerBilan();
    if (vueActive === "mes") chargerMes();
    if (vueActive === "gestion") { chargerSms(); chargerPartenaires(); chargerBudget(); }
  }

  function changerVue(v) {
    vueActive = v;
    ["jour", "semaine", "bilan", "mes", "gestion"].forEach(function (x) {
      $("v" + x.charAt(0).toUpperCase() + x.slice(1)).hidden = x !== v;
    });
    Array.prototype.forEach.call($("pOnglets").querySelectorAll("button"), function (b) {
      b.classList.toggle("actif", b.getAttribute("data-onglet") === v);
    });
    recharger();
  }

  function brancher() {
    $("pOnglets").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) changerVue(b.getAttribute("data-onglet"));
    });
    $("pJourAvant").addEventListener("click", function () { jour = decaler(jour, -1); chargerJour(); });
    $("pJourApres").addEventListener("click", function () { jour = decaler(jour, 1); chargerJour(); });
    $("pMoisAvant").addEventListener("click", function () { mois = decalerMois(mois, -1); chargerBilan(); });
    $("pMoisApres").addEventListener("click", function () { mois = decalerMois(mois, 1); chargerBilan(); });
    $("pMesAvant").addEventListener("click", function () { semaineMes = decaler(semaineMes, -7); chargerMes(); });
    $("pMesApres").addEventListener("click", function () { semaineMes = decaler(semaineMes, 7); chargerMes(); });
    $("pMesCopier").addEventListener("click", function () {
      var filtre = $("pMesFiltre").value;
      var t = texteMes(filtre);
      if (!t) { message("Rien à copier pour ce choix sur ces 7 jours."); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { message("Récap copié."); }, function () { prompt("Copiez le récap :", t); });
    });
    $("pBudgetAvant").addEventListener("click", function () { moisBudget = decalerMois(moisBudget, -1); chargerBudget(); });
    $("pBudgetApres").addEventListener("click", function () { moisBudget = decalerMois(moisBudget, 1); chargerBudget(); });

    // Ajout d'une course recue par telephone.
    var fenetre = $("pFenetre"), form = $("pFormCourse");
    $("pBoutonAjouter").addEventListener("click", function () {
      form.reset();
      form.elements.date.value = jour;
      $("pErreurCourse").hidden = true;
      fenetre.hidden = false;
    });
    $("pFermer").addEventListener("click", function () { fenetre.hidden = true; });
    activerSuggestions(form.elements.depart);
    activerSuggestions(form.elements.destination);
    activerHeure(form.elements.heurePc);
    activerHeure(form.elements.heureRdv);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements;
      var hPc = lireHeure(f.heurePc.value), hRdv = lireHeure(f.heureRdv.value);
      if (hPc === null || hRdv === null) {
        $("pErreurCourse").textContent = "Heure invalide : tapez par exemple 0815 pour 08h15.";
        $("pErreurCourse").hidden = false;
        return;
      }
      if (!hPc && !hRdv) {
        $("pErreurCourse").textContent = "Indiquez l'heure de prise en charge ou de rendez-vous.";
        $("pErreurCourse").hidden = false;
        return;
      }
      api("POST", "/courses", {
        type: form.querySelector("input[name=type]:checked").value,
        nom: [f.prenom.value.trim(), f.nom.value.trim()].filter(Boolean).join(" "), telephone: f.telephone.value, depart: f.depart.value, destination: f.destination.value,
        date: f.date.value, heurePc: hPc ? hPc.replace("h", ":") : "", heureRdv: hRdv ? hRdv.replace("h", ":") : "", commentaire: f.commentaire.value,
      }).then(function () {
        fenetre.hidden = true;
        jour = f.date.value;
        message("Course ajoutée.");
        changerVue("jour");
      }).catch(function (err) {
        $("pErreurCourse").textContent = err.message;
        $("pErreurCourse").hidden = false;
      });
    });

    // Gestion.
    $("pFormPartenaire").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target.elements;
      var nom = f.nom.value;
      api("POST", "/admin/partenaires", { nom: nom, telephone: f.telephone.value, peutAjouter: f.peutAjouter.checked }).then(function (r) {
        e.target.reset();
        afficherLien(nom, r.lien);
        chargerPartenaires();
      }).catch(function (err) { message(err.message); });
    });
    $("pSmsOk").addEventListener("click", function () { enregistrerSms($("pSmsNumero").value.trim()); });
    $("pSmsChauffeur").addEventListener("change", function (e) {
      var o = e.target.selectedOptions[0];
      if (o && o.value) enregistrerSms(o.value, o.getAttribute("data-nom"));
    });
    $("pDepenseOk").addEventListener("click", function () {
      api("POST", "/admin/budget", { mois: moisBudget, depense: Number($("pDepense").value || 0) }).then(function () { message("Dépense enregistrée."); }).catch(function (e) { message(e.message); });
    });
    $("pNumerosOk").addEventListener("click", function () {
      var numeros = $("pNumeros").value;
      if (!numeros.trim()) return;
      api("POST", "/admin/clients", { numeros: numeros }).then(function (r) {
        $("pNumeros").value = "";
        message(r.ajoutes + " numéro(s) traité(s).");
      }).catch(function (e) { message(e.message); });
    });
  }

  // ----- Demarrage -----
  if (new URLSearchParams(location.search).get("lien") === "invalide") {
    afficherConnexion("Ce lien n'est plus valable. Demandez à Tony de vous renvoyer votre lien personnel.");
    return;
  }
  fetch("/api/partenaires/moi", { credentials: "same-origin" })
    .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
    .then(function (res) {
      if (res.status === 503) { afficherConnexion("L'espace partenaires n'est pas encore activé."); return; }
      if (!res.j.ok) { afficherConnexion(); return; }
      moi = res.j;
      $("pConnexion").hidden = true;
      $("pAppli").hidden = false;
      $("pQui").textContent = "Connecté : " + moi.nom + (moi.admin ? " (administrateur)" : "");
      var sortir = el("button", null, "Se déconnecter");
      sortir.addEventListener("click", function () {
        if (!confirm("Se déconnecter ? Il faudra rouvrir votre lien personnel.")) return;
        api("POST", "/deconnexion").then(function () { location.reload(); });
      });
      $("pQui").appendChild(sortir);
      $("pBoutonAjouter").hidden = !moi.peutAjouter;
      $("pOngletGestion").hidden = !moi.admin;
      $("pOngletMes").hidden = !moi.admin;
      if (moi.admin) $("pOnglets").classList.add("cinq");
      brancher();
      changerVue("jour");
    })
    .catch(function () { afficherConnexion("Connexion impossible, réessayez dans un instant."); });
})();
