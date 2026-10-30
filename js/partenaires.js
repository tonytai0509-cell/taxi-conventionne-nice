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
    $("pQui").textContent = "taxi-conventionne06.fr/partenaires";
    $("pSortir").hidden = true;
    if (texte) $("pConnexionTexte").textContent = texte;
  }

  // ----- Ligne repliable : « 08h15  45 bd Gambetta → Archet », detail au toucher -----
  var ouvertes = {};

  // Debut d'adresse : avant la virgule et le code postal, voies abregees.
  function adresseCourte(a) {
    var s = String(a || "").split(",")[0].replace(/\s*\b\d{5}\b.*$/, "").trim();
    s = s.replace(/\bboulevard\b/gi, "bd").replace(/\bavenue\b/gi, "av.").replace(/\bchemin\b/gi, "ch.")
      .replace(/\broute\b/gi, "rte").replace(/\bplace\b/gi, "pl.").replace(/\ballée\b/gi, "all.")
      .replace(/^hôpital\b/i, "Hôp.").replace(/^clinique\b/i, "Clin.").replace(/^centre\b/i, "Ctre").replace(/\bmaréchal\b/gi, "Mal").replace(/\bdocteur\b/gi, "Dr").replace(/^aéroport nice - terminal /i, "Aéroport T");
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
      if (c.client.nir || c.client.naissance) {
        var sante = el("div", "p-client-sante");
        if (c.client.nir) sante.appendChild(el("span", null, "🪪 " + formaterNir(c.client.nir)));
        if (c.client.naissance) sante.appendChild(el("span", null, "🎂 " + c.client.naissance.split("-").reverse().join("/")));
        cl.appendChild(sante);
      }
      carte.appendChild(cl);
    }
    return carte;
  }

  // « 185057800608436 » -> « 1 85 05 78 006 084 36 »
  function formaterNir(n) {
    var c = String(n || "").toUpperCase().replace(/[^0-9AB]/g, "").slice(0, 15);
    return [c.slice(0, 1), c.slice(1, 3), c.slice(3, 5), c.slice(5, 7), c.slice(7, 10), c.slice(10, 13), c.slice(13, 15)].filter(Boolean).join(" ");
  }

  // ----- Vue Jour -----
  // Carte « aucune course » avec une petite icone taxi.
  function carteVide(titre, texte) {
    var c = el("div", "p-vide-carte");
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("aria-hidden", "true");
    ["M18 9h12l1.5 4h-15z", "M9 26l4-10a3 3 0 0 1 2.8-2h16.4a3 3 0 0 1 2.8 2l4 10", "M7 26h34v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z", "M12 36v3.5M36 36v3.5"].forEach(function (d) {
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    [15, 33].forEach(function (x) {
      var rond = document.createElementNS(ns, "circle");
      rond.setAttribute("cx", x); rond.setAttribute("cy", "31"); rond.setAttribute("r", "2.6");
      svg.appendChild(rond);
    });
    c.appendChild(svg);
    c.appendChild(el("b", null, titre));
    c.appendChild(el("span", null, texte));
    return c;
  }

  function chargerJour() {
    var d = new Date(jour + "T12:00:00");
    var t = JOURS[d.getDay()] + " " + d.getDate() + " " + MOIS[d.getMonth()];
    var estAujourdhui = jour === isoAujourdhui();
    $("pJourTitre").textContent = t.charAt(0).toUpperCase() + t.slice(1);
    $("pJourSous").textContent = estAujourdhui ? "Aujourd'hui" : "";
    $("pJourSous").hidden = !estAujourdhui;
    var liste = $("pListeJour");
    chargerResume();
    return api("GET", "/courses?debut=" + jour).then(function (r) {
      liste.textContent = "";
      var actives = r.courses.filter(function (c) { return !c.annulee; }).length;
      $("pJourCompte").textContent = actives + " course" + (actives > 1 ? "s" : "");
      if (!r.courses.length) {
        liste.appendChild(carteVide(estAujourdhui ? "Aucune course aujourd'hui" : "Aucune course ce jour-là", "Vos courses apparaîtront ici."));
        return;
      }
      var groupe = el("div", "p-groupe");
      r.courses.forEach(function (c) { groupe.appendChild(ligneCourse(c)); });
      liste.appendChild(groupe);
    }).catch(function () {});
  }

  // ----- Compteurs du jour : reservations recues, courses prevues -----
  var recuesDuJour = [];
  function chargerResume() {
    return api("GET", "/resume").then(function (r) {
      recuesDuJour = r.recues;
      $("pNbRecues").textContent = String(r.recues.length);
      $("pNbPrevues").textContent = String(r.prevues);
      $("pStatRecues").setAttribute("aria-label", r.recues.length + " réservations reçues aujourd'hui" + (r.recuesHier ? " (" + r.recuesHier + " hier)" : ""));
      if (!$("pRecues").hidden) afficherRecues();
    }).catch(function () {});
  }

  function dateCourte(iso) {
    if (iso === isoAujourdhui()) return "Aujourd'hui";
    if (iso === decaler(isoAujourdhui(), 1)) return "Demain";
    var d = new Date(iso + "T12:00:00");
    var j = JOURS[d.getDay()].slice(0, 3);
    return j.charAt(0).toUpperCase() + j.slice(1) + ". " + d.getDate() + " " + MOIS_COURT[d.getMonth()];
  }

  function afficherRecues() {
    var zone = $("pRecues");
    zone.textContent = "";
    if (!recuesDuJour.length) {
      zone.appendChild(el("p", "p-recues-vide", "Pas encore de réservation reçue aujourd'hui."));
      return;
    }
    recuesDuJour.forEach(function (c, i) {
      var ligne = el("button", "p-recue");
      ligne.type = "button";
      var q = el("span", "p-recue-quand", "reçue");
      q.appendChild(el("b", null, heureLocale(c.recueLe)));
      ligne.appendChild(q);
      var t = el("span", "p-recue-txt", dateCourte(c.date) + " · " + (heure(c.heurePc) || "RDV " + heure(c.heureRdv)));
      t.appendChild(el("small", null, adresseCourte(c.depart) + " → " + adresseCourte(c.destination)));
      ligne.appendChild(t);
      if (i === 0) ligne.appendChild(el("span", "p-recue-new", "Nouvelle"));
      // Toucher une reservation : on va sur le jour de la course, deja ouverte.
      ligne.addEventListener("click", function () {
        jour = c.date;
        ouvertes["c" + c.id] = true;
        chargerJour().then(function () {
          var cible = $("pListeJour");
          if (cible) cible.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      zone.appendChild(ligne);
    });
  }

  // ----- Vue Semaine (7 jours a partir d'aujourd'hui) -----
  // Mise a jour automatique de l'onglet Jour (nouvelle reservation sans recharger).
  setInterval(function () {
    if (moi && vueActive === "jour" && document.visibilityState === "visible" && $("pFenetre").hidden) chargerJour();
  }, 60000);
  document.addEventListener("visibilitychange", function () {
    if (moi && vueActive === "jour" && document.visibilityState === "visible") chargerJour();
  });

  function chargerSemaine() {
    var debut = isoAujourdhui(), fin = decaler(debut, 6);
    var liste = $("pListeSemaine");
    api("GET", "/courses?debut=" + debut + "&fin=" + fin).then(function (r) {
      liste.textContent = "";
      if (!r.courses.length) { liste.appendChild(carteVide("Aucune course cette semaine", "Vos courses apparaîtront ici.")); return; }
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

  function carteMaCourse(c, sansBouton) {
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
    if (!sansBouton) {
      var b = el("button", "p-saisie", c.saisie ? "✓ Saisie dans l'appli" : "☐ Pas encore saisie");
      b.addEventListener("click", function () {
        api("POST", "/admin/mes-courses/" + c.id + "/saisie").then(chargerMes).catch(function (e) { message(e.message); });
      });
      carte.appendChild(b);
    }
    return carte;
  }

  var periodeMes = "";
  var MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

  // Une course de « Mes courses » : case « saisie », heure, trajet court ; detail au toucher.
  function ligneMes(c) {
    var cle = "m" + c.id;
    var d = el("div", "p-mes-ligne" + (c.saisie ? " saisie" : "") + (ouvertes[cle] ? " ouverte" : ""));
    var tete = el("div", "p-mes-tete");
    var caseSaisie = el("button", "p-case-saisie");
    caseSaisie.type = "button";
    caseSaisie.setAttribute("role", "checkbox");
    caseSaisie.setAttribute("aria-checked", c.saisie ? "true" : "false");
    caseSaisie.setAttribute("aria-label", c.saisie ? "Saisie dans l'appli (toucher pour décocher)" : "Marquer comme saisie dans l'appli");
    caseSaisie.addEventListener("click", function () {
      caseSaisie.disabled = true;
      api("POST", "/admin/mes-courses/" + c.id + "/saisie").then(chargerMes).catch(function (e) { message(e.message); caseSaisie.disabled = false; });
    });
    tete.appendChild(caseSaisie);
    var ouvrir = el("button", "p-mes-ouvrir");
    ouvrir.type = "button";
    ouvrir.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
    ouvrir.appendChild(el("span", "p-mes-heure", c.pcADefinir ? "PC ?" : heure(c.heurePc) || "RDV " + heure(c.heureRdv)));
    ouvrir.appendChild(el("span", "p-mes-trajet", adresseCourte(c.depart) + " → " + adresseCourte(c.destination)));
    var chev = icone("suivant");
    chev.setAttribute("class", "p-ico p-ico-bas");
    ouvrir.appendChild(chev);
    tete.appendChild(ouvrir);
    d.appendChild(tete);
    var det = carteMaCourse(c, true);
    det.classList.add("p-mes-det");
    det.hidden = !ouvertes[cle];
    ouvrir.addEventListener("click", function () {
      ouvertes[cle] = !ouvertes[cle];
      det.hidden = !ouvertes[cle];
      d.classList.toggle("ouverte", !!ouvertes[cle]);
      ouvrir.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
    });
    d.appendChild(det);
    return d;
  }

  function chargerMes() {
    var fin = decaler(semaineMes, 6);
    var d1 = new Date(semaineMes + "T12:00:00"), d2 = new Date(fin + "T12:00:00");
    $("pMesTitre").textContent = d1.getDate() + " " + MOIS_COURT[d1.getMonth()] + (d1.getFullYear() !== d2.getFullYear() ? " " + d1.getFullYear() : "") +
      " – " + d2.getDate() + " " + MOIS_COURT[d2.getMonth()] + " " + d2.getFullYear();
    periodeMes = "du " + d1.getDate() + " " + MOIS[d1.getMonth()] + " au " + d2.getDate() + " " + MOIS[d2.getMonth()];
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
      var n = r.courses.length, aSaisir = r.courses.filter(function (c) { return !c.saisie; }).length;
      $("pMesCompte").textContent = n + " réservation" + (n > 1 ? "s" : "") + " · " + aSaisir + " à saisir";
      if (!n) { liste.appendChild(carteVide("Aucune réservation cette semaine", "Vos réservations du site apparaîtront ici.")); return; }
      var groupe = null, dateCourante = null;
      r.courses.forEach(function (c) {
        if (c.date !== dateCourante) {
          dateCourante = c.date;
          var t = titreJour(c.date).replace(/(^|· )(\S)/g, function (m, avant, l) { return avant + l.toUpperCase(); });
          liste.appendChild(el("h3", "p-mes-jour", t));
          groupe = el("div", "p-mes-groupe");
          liste.appendChild(groupe);
        }
        groupe.appendChild(ligneMes(c));
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
    var lignes = ["Récap " + NOMS_ORIGINE[filtre] + " · " + periodeMes + " (" + choix.length + ")"], dateCourante = null;
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

  function pastille(paye) {
    return el("span", "p-pastille-statut " + (paye ? "paye" : "du"), paye ? "Payé" : "À régler");
  }

  function iconeDocument() {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "p-ico p-ico-doc");
    ["M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z", "M14 3.5V8h4.5", "M9 12.5h6M9 15.5h6"].forEach(function (d) {
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  }

  function lienFacture(id) {
    var a = el("a", "p-facture-pdf", "📄 PDF");
    a.href = "/api/partenaires/factures/" + id;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  // Ligne de la liste « Factures du mois » (administrateur).
  function ligneFacture(titre, montant, paye, factureId) {
    var r = el(factureId ? "a" : "div", "p-facture-ligne");
    if (factureId) {
      r.href = "/api/partenaires/factures/" + factureId;
      r.target = "_blank";
      r.rel = "noopener";
      r.setAttribute("aria-label", "Ouvrir la facture de " + titre);
    }
    r.appendChild(iconeDocument());
    r.appendChild(el("span", "p-facture-mois", titre + (factureId ? "" : " · PDF à venir")));
    r.appendChild(el("b", "p-facture-montant", montant == null ? "—" : euros(montant)));
    r.appendChild(pastille(paye));
    return r;
  }

  function chargerBilan() {
    var zone = $("pBilan");
    var tm = titreMois(mois);
    $("pMoisTitre").textContent = tm.charAt(0).toUpperCase() + tm.slice(1);
    // Chauffeur : seulement ses factures.
    if (!moi.admin) {
      api("GET", "/mes-factures").then(function (r) {
        zone.textContent = "";
        var duMois = r.factures.filter(function (f) { return f.mois === mois; })[0];

        // Montant reellement a regler pour le mois choisi.
        var resume = el("div", "p-resume");
        var g = el("div", "p-resume-txt");
        g.appendChild(el("span", null, duMois && duMois.paye ? "Montant réglé" : "Montant à régler"));
        g.appendChild(el("b", null, euros(duMois && duMois.montant != null ? duMois.montant : 0)));
        resume.appendChild(g);
        if (duMois && duMois.montant != null) resume.appendChild(pastille(duMois.paye));
        else resume.appendChild(el("span", "p-pastille-statut vide", "Aucune facture"));
        zone.appendChild(resume);

        var bloc = el("div", "p-bloc p-mes-factures");
        bloc.appendChild(el("h3", null, "Mes factures"));
        if (!r.factures.length) bloc.appendChild(el("p", "p-petit", "Aucune facture pour le moment."));
        r.factures.forEach(function (f) {
          var t = titreMois(f.mois);
          var ligne = el(f.factureId ? "a" : "div", "p-facture-ligne" + (f.mois === mois ? " choisie" : ""));
          if (f.factureId) {
            ligne.href = "/api/partenaires/factures/" + f.factureId + "?telecharger=1";
            ligne.setAttribute("aria-label", "Télécharger la facture de " + t);
          }
          ligne.appendChild(iconeDocument());
          ligne.appendChild(el("span", "p-facture-mois", t.charAt(0).toUpperCase() + t.slice(1)));
          ligne.appendChild(el("b", "p-facture-montant", f.montant == null ? "—" : euros(f.montant)));
          ligne.appendChild(pastille(f.paye));
          bloc.appendChild(ligne);
        });
        zone.appendChild(bloc);

        // Document du mois choisi.
        if (duMois && duMois.factureId) {
          var dl = el("a", "p-bouton p-bouton-telecharger", "Télécharger la facture");
          dl.href = "/api/partenaires/factures/" + duMois.factureId + "?telecharger=1";
          dl.insertBefore(iconeDocument(), dl.firstChild);
          zone.appendChild(dl);
        } else if (duMois) {
          var att = el("div", "p-facture-attente", "Facture bientôt disponible");
          att.insertBefore(iconeDocument(), att.firstChild);
          zone.appendChild(att);
        }
      }).catch(function () {});
      return;
    }
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
      var n = r.partenaires.length;
      $("pPartResume").textContent = n + " partenaire" + (n > 1 ? "s" : "");
      r.partenaires.forEach(function (p) {
        var d = el("div", "p-pers" + (p.actif ? "" : " inactif"));
        var tete = el("div", "p-pers-tete");
        var avatar = el("span", "p-avatar" + (p.admin ? " admin" : ""), (p.nom || "?").charAt(0).toUpperCase());
        tete.appendChild(avatar);
        var txt = el("span", "p-pers-txt");
        var nom = el("b", null, p.nom);
        if (p.admin) nom.appendChild(el("span", "p-badge", "Vous"));
        txt.appendChild(nom);
        txt.appendChild(el("span", null, (p.admin ? "Administrateur" : "Partenaire") + (p.actif ? "" : " · désactivé")));
        tete.appendChild(txt);
        if (p.telephone) {
          var tel = el("a", "p-pers-tel");
          tel.href = "tel:" + p.telephone.replace(/[^0-9+]/g, "");
          tel.setAttribute("aria-label", "Appeler " + p.nom);
          tel.appendChild(icone("tel"));
          tel.addEventListener("click", function (e) { e.stopPropagation(); });
          tete.appendChild(tel);
        }
        d.appendChild(tete);
        if (p.admin) { zone.appendChild(d); return; }
        tete.appendChild(icone("suivant"));
        tete.setAttribute("role", "button");
        tete.tabIndex = 0;

        // Options du partenaire : affichees au toucher.
        var cle = "p" + p.id;
        var options = el("div", "p-part-options");
        options.hidden = !ouvertes[cle];
        d.classList.toggle("ouverte", !!ouvertes[cle]);
        tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
        function basculer() {
          ouvertes[cle] = !ouvertes[cle];
          options.hidden = !ouvertes[cle];
          d.classList.toggle("ouverte", !!ouvertes[cle]);
          tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
        }
        tete.addEventListener("click", basculer);
        tete.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); basculer(); } });
        function modifier(corps, apres) {
          return api("POST", "/admin/partenaires/" + p.id, corps).then(function (res) { if (apres) apres(res); chargerPartenaires(); chargerSms(); }).catch(function (e) { message(e.message); chargerPartenaires(); });
        }
        var inters = el("div", "p-inters");
        inters.appendChild(interrupteur("Accès actif", p.actif, function (v) { modifier({ actif: v }); }));
        inters.appendChild(interrupteur("Peut ajouter des courses", p.peut_ajouter, function (v) { modifier({ peutAjouter: v }); }));
        options.appendChild(inters);

        var grille = el("div", "p-part-boutons");
        function bouton(texte, action, classe) {
          var bt = el("button", classe || null, texte);
          bt.type = "button";
          bt.addEventListener("click", action);
          grille.appendChild(bt);
        }
        if (p.lien) {
          bouton("📋 Copier le lien", function () { copierLien(p.lien); });
          bouton("💬 WhatsApp", function () { window.open(lienWhatsApp(p, p.lien), "_blank", "noopener"); });
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

  // Petites icones (traits) : telephone, fleche.
  function icone(nom) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "p-ico p-ico-" + nom);
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", nom === "tel"
      ? "M6.6 3.5h2.6l1.4 4-2 1.6a12 12 0 0 0 6.3 6.3l1.6-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"
      : "M9 6l6 6-6 6");
    svg.appendChild(path);
    return svg;
  }

  // Ligne de permanence : le seul numero qui recoit les SMS des reservations.
  function chargerSms() {
    Promise.all([api("GET", "/admin/sms"), api("GET", "/admin/partenaires")]).then(function (r) {
      $("pSmsNumero").value = r[0].numero || "";
      var qui = r[1].partenaires.filter(function (p) { return p.telephone && telephoneCle(p.telephone) === telephoneCle(r[0].numero); })[0];
      $("pSmsResume").textContent = r[0].numero ? "SMS envoyés à " + (qui ? qui.nom : r[0].numero) : "Aucun numéro : pas de SMS";
      var etat = $("pSmsEtat");
      etat.textContent = r[0].numero ? "Actif" : "Inactif";
      etat.className = "p-rub-etat " + (r[0].numero ? "ok" : "off");
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
      var t = titreMois(moisBudget);
      $("pBudgetResume").textContent = t.charAt(0).toUpperCase() + t.slice(1) + " · " + (b.depense == null ? "dépense non saisie" : euros(b.depense) + " dépensés");
      $("pDepense").value = b.depense == null ? "" : b.depense;
      var zone = $("pParts");
      zone.textContent = "";
      zone.appendChild(el("div", "p-rub-label", "Factures du mois"));
      b.partenaires.forEach(function (p) {
        var cle = "b" + moisBudget + p.id;
        var d = el("div", "p-fact" + (ouvertes[cle] ? " ouverte" : ""));
        var tete = el("button", "p-fact-tete");
        tete.type = "button";
        tete.appendChild(el("b", null, p.nom));
        tete.appendChild(el("span", "p-fact-montant", p.budget == null ? "—" : euros(p.budget)));
        tete.appendChild(el("span", "p-statut " + (p.budget == null ? "vide" : p.paye ? "paye" : "du"), p.budget == null ? "Pas de montant" : p.paye ? "Payé" : "À régler"));
        tete.appendChild(icone("suivant"));
        tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
        var det = el("div", "p-fact-det");
        det.hidden = !ouvertes[cle];
        tete.addEventListener("click", function () {
          ouvertes[cle] = !ouvertes[cle];
          det.hidden = !ouvertes[cle];
          d.classList.toggle("ouverte", !!ouvertes[cle]);
          tete.setAttribute("aria-expanded", ouvertes[cle] ? "true" : "false");
        });
        d.appendChild(tete);

        // Detail : montant, statut, facture PDF.
        var ligne1 = el("div", "p-fact-ligne");
        var montant = el("input");
        montant.type = "number"; montant.min = "0"; montant.step = "0.01"; montant.inputMode = "decimal"; montant.placeholder = "Montant €";
        montant.setAttribute("aria-label", "Montant de " + p.nom);
        montant.value = p.budget == null ? "" : p.budget;
        var payeInter = interrupteur("Payé", p.paye, enregistrer);
        function enregistrer() {
          api("POST", "/admin/budget", { mois: moisBudget, partenaireId: p.id, montant: Number(montant.value || 0), paye: payeInter.querySelector("input").checked })
            .then(function () { message("Enregistré."); chargerBudget(); }).catch(function (e) { message(e.message); });
        }
        montant.addEventListener("change", enregistrer);
        ligne1.appendChild(montant);
        ligne1.appendChild(payeInter);
        det.appendChild(ligne1);

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
        if (p.factureId) {
          ligne.appendChild(lienFacture(p.factureId));
          var suppr = el("button", "p-suppr", "🗑");
          suppr.type = "button";
          suppr.setAttribute("aria-label", "Supprimer la facture de " + p.nom);
          suppr.title = "Supprimer la facture";
          suppr.addEventListener("click", function () {
            if (!confirm("Supprimer la facture de " + p.nom + " pour " + titreMois(moisBudget) + " ? Le montant et le statut restent.")) return;
            suppr.disabled = true;
            api("POST", "/admin/factures/" + p.factureId + "/supprimer").then(function () { message("Facture supprimée."); chargerBudget(); })
              .catch(function (e) { message(e.message); chargerBudget(); });
          });
          ligne.appendChild(suppr);
        }
        det.appendChild(ligne);
        d.appendChild(det);
        zone.appendChild(d);
      });
    }).catch(function () {});
  }

  // ----- Mes clients : liste avec recherche -----
  var numerosClients = [];
  function formaterNumero(cle) {
    var n = "0" + cle;
    return n.length === 10 ? n.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : cle;
  }

  function afficherClients() {
    var zone = $("pClientsListe");
    var q = $("pClientsRecherche").value.replace(/\D/g, "").replace(/^0/, "");
    var liste = numerosClients.filter(function (c) { return !q || c.indexOf(q) !== -1; });
    zone.textContent = "";
    if (!numerosClients.length) { zone.appendChild(el("p", "p-petit", "Aucun client enregistré.")); return; }
    if (!liste.length) { zone.appendChild(el("p", "p-petit", "Aucun numéro ne correspond.")); return; }
    liste.slice(0, 200).forEach(function (c) {
      var a = el("a", "p-client-num", formaterNumero(c));
      a.href = "tel:0" + c;
      zone.appendChild(a);
    });
    if (liste.length > 200) zone.appendChild(el("p", "p-petit", "… et " + (liste.length - 200) + " autres : affinez la recherche."));
  }

  function chargerClients() {
    api("GET", "/admin/clients").then(function (r) {
      numerosClients = r.numeros || [];
      $("pClientsResume").textContent = r.nombre ? r.nombre + " client" + (r.nombre > 1 ? "s" : "") + " enregistré" + (r.nombre > 1 ? "s" : "") : "Aucun client enregistré";
      afficherClients();
    }).catch(function () {});
  }

  // ----- Gestion : rubriques repliables, une seule ouverte a la fois -----
  function brancherRubriques() {
    var rubriques = document.querySelectorAll("#vGestion .p-rub");
    Array.prototype.forEach.call(rubriques, function (rub) {
      rub.querySelector(".p-rub-tete").addEventListener("click", function () {
        var ouvrir = !rub.classList.contains("ouverte");
        Array.prototype.forEach.call(rubriques, function (autre) {
          var o = ouvrir && autre === rub;
          autre.classList.toggle("ouverte", o);
          autre.querySelector(".p-rub-corps").hidden = !o;
          autre.querySelector(".p-rub-tete").setAttribute("aria-expanded", o ? "true" : "false");
        });
      });
    });
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
    if (vueActive === "gestion") { chargerSms(); chargerPartenaires(); chargerBudget(); chargerClients(); }
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
    $("pStatRecues").addEventListener("click", function () {
      var z = $("pRecues"), o = z.hidden;
      z.hidden = !o;
      $("pStatRecues").classList.toggle("ouvert", o);
      $("pStatRecues").setAttribute("aria-expanded", o ? "true" : "false");
      if (o) afficherRecues();
    });
    $("pStatPrevues").addEventListener("click", function () {
      jour = isoAujourdhui();
      chargerJour().then(function () { $("pListeJour").scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
    $("pJourAvant").addEventListener("click", function () { jour = decaler(jour, -1); chargerJour(); });
    $("pJourApres").addEventListener("click", function () { jour = decaler(jour, 1); chargerJour(); });
    $("pMoisAvant").addEventListener("click", function () { mois = decalerMois(mois, -1); chargerBilan(); });
    $("pMoisApres").addEventListener("click", function () { mois = decalerMois(mois, 1); chargerBilan(); });
    $("pMesAvant").addEventListener("click", function () { semaineMes = decaler(semaineMes, -7); chargerMes(); });
    $("pMesApres").addEventListener("click", function () { semaineMes = decaler(semaineMes, 7); chargerMes(); });
    $("pCopierTete").addEventListener("click", function () {
      var rub = $("rubCopier"), o = !rub.classList.contains("ouverte");
      rub.classList.toggle("ouverte", o);
      rub.querySelector(".p-rub-corps").hidden = !o;
      $("pCopierTete").setAttribute("aria-expanded", o ? "true" : "false");
    });
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
    var enCours = false;
    function fermerFeuille() {
      fenetre.hidden = true;
      document.body.classList.remove("p-feuille-ouverte");
    }
    $("pBoutonAjouter").addEventListener("click", function () {
      form.reset();
      form.elements.date.value = jour;
      $("pErreurCourse").hidden = true;
      Array.prototype.forEach.call(form.querySelectorAll(".p-invalide"), function (x) { x.classList.remove("p-invalide"); });
      fenetre.hidden = false;
      document.body.classList.add("p-feuille-ouverte");
      form.querySelector(".p-feuille-corps").scrollTop = 0;
    });
    $("pFermer").addEventListener("click", fermerFeuille);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !fenetre.hidden) fermerFeuille(); });
    activerSuggestions(form.elements.depart);
    activerSuggestions(form.elements.destination);
    form.elements.nir.addEventListener("input", function () { this.value = formaterNir(this.value); });
    activerHeure(form.elements.heurePc);
    activerHeure(form.elements.heureRdv);
    function erreurForm(texte, champ) {
      $("pErreurCourse").textContent = texte;
      $("pErreurCourse").hidden = false;
      if (champ) { champ.classList.add("p-invalide"); champ.focus(); }
      else $("pErreurCourse").scrollIntoView({ block: "center", behavior: "smooth" });
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (enCours) return;
      var f = form.elements;
      $("pErreurCourse").hidden = true;
      Array.prototype.forEach.call(form.querySelectorAll(".p-invalide"), function (x) { x.classList.remove("p-invalide"); });
      if (!f.depart.value.trim()) return erreurForm("Indiquez l'adresse de départ.", f.depart);
      if (!f.destination.value.trim()) return erreurForm("Indiquez la destination.", f.destination);
      if (!f.date.value) return erreurForm("Indiquez la date de la course.", f.date);
      var hPc = lireHeure(f.heurePc.value), hRdv = lireHeure(f.heureRdv.value);
      if (hPc === null) return erreurForm("Heure de prise en charge invalide : tapez par exemple 0815 pour 08h15.", f.heurePc);
      if (hRdv === null) return erreurForm("Heure de rendez-vous invalide : tapez par exemple 0845 pour 08h45.", f.heureRdv);
      if (!hPc && !hRdv) return erreurForm("Indiquez l'heure de prise en charge ou de rendez-vous.", f.heurePc);
      // Un seul envoi a la fois (plusieurs appuis = une seule course).
      enCours = true;
      var bouton = $("pEnregistrerCourse");
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";
      api("POST", "/courses", {
        type: form.querySelector("input[name=type]:checked").value,
        nom: [f.prenom.value.trim(), f.nom.value.trim()].filter(Boolean).join(" "), telephone: f.telephone.value, depart: f.depart.value, destination: f.destination.value,
        nir: f.nir.value, naissance: f.naissance.value,
        date: f.date.value, heurePc: hPc ? hPc.replace("h", ":") : "", heureRdv: hRdv ? hRdv.replace("h", ":") : "", commentaire: f.commentaire.value,
      }).then(function () {
        fermerFeuille();
        jour = f.date.value;
        message("Course enregistrée.");
        changerVue("jour");
      }).catch(function (err) {
        // Les champs restent remplis : on peut corriger et renvoyer.
        erreurForm(err.message === "Non connecté" ? "Vous n'êtes plus connecté : rouvrez votre lien personnel." : err.message || "Enregistrement impossible, réessayez.");
      }).then(function () {
        enCours = false;
        bouton.disabled = false;
        bouton.textContent = "Enregistrer la course";
      });
    });

    // Gestion.
    brancherRubriques();
    $("pAjouterPartenaire").addEventListener("click", function () {
      var f = $("pFormPartenaire");
      f.hidden = !f.hidden;
      $("pAjouterPartenaire").textContent = f.hidden ? "＋ Ajouter un partenaire" : "Fermer le formulaire";
      $("pAjouterPartenaire").classList.toggle("p-bouton-sec", !f.hidden);
      if (!f.hidden) f.elements.nom.focus();
    });
    $("pAjouterClients").addEventListener("click", function () {
      var z = $("pClientsAjout");
      z.hidden = !z.hidden;
      $("pAjouterClients").textContent = z.hidden ? "＋ Ajouter des clients" : "Fermer";
      $("pAjouterClients").classList.toggle("p-bouton-sec", !z.hidden);
      if (!z.hidden) $("pNumeros").focus();
    });
    $("pClientsRecherche").addEventListener("input", afficherClients);
    $("pFormPartenaire").addEventListener("submit", function (e) {
      e.preventDefault();
      var f = e.target.elements;
      var nom = f.nom.value;
      api("POST", "/admin/partenaires", { nom: nom, telephone: f.telephone.value, peutAjouter: f.peutAjouter.checked }).then(function (r) {
        e.target.reset();
        e.target.hidden = true;
        $("pAjouterPartenaire").textContent = "＋ Ajouter un partenaire";
        $("pAjouterPartenaire").classList.remove("p-bouton-sec");
        afficherLien(nom, r.lien);
        chargerPartenaires();
        chargerSms();
      }).catch(function (err) { message(err.message); });
    });
    $("pSmsOk").addEventListener("click", function () { enregistrerSms($("pSmsNumero").value.trim()); });
    $("pSmsChauffeur").addEventListener("change", function (e) {
      var o = e.target.selectedOptions[0];
      if (o && o.value) enregistrerSms(o.value, o.getAttribute("data-nom"));
    });
    $("pDepenseOk").addEventListener("click", function () {
      api("POST", "/admin/budget", { mois: moisBudget, depense: Number($("pDepense").value || 0) }).then(function () { message("Dépense enregistrée."); chargerBudget(); }).catch(function (e) { message(e.message); });
    });
    $("pNumerosOk").addEventListener("click", function () {
      var numeros = $("pNumeros").value;
      if (!numeros.trim()) return;
      api("POST", "/admin/clients", { numeros: numeros }).then(function (r) {
        $("pNumeros").value = "";
        message(r.ajoutes + " numéro(s) traité(s).");
        chargerClients();
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
      $("pQui").textContent = moi.nom + " · " + (moi.admin ? "Administrateur" : "Partenaire");
      $("pSortir").hidden = false;
      $("pSortir").addEventListener("click", function () {
        if (!confirm("Se déconnecter ? Il faudra rouvrir votre lien personnel.")) return;
        api("POST", "/deconnexion").then(function () { location.reload(); });
      });
      $("pZoneAjouter").hidden = !moi.peutAjouter;
      $("pOngletGestion").hidden = !moi.admin;
      $("pOngletMes").hidden = !moi.admin;
      if (moi.admin) $("pOnglets").classList.add("cinq");
      brancher();
      changerVue("jour");
    })
    .catch(function () { afficherConnexion("Connexion impossible, réessayez dans un instant."); });
})();
