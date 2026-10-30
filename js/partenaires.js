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

  // ----- Carte d'une course -----
  function carteCourse(c) {
    var carte = el("div", "p-carte" + (c.priseParMoi ? " moi" : "") + (c.annulee ? " annulee" : ""));
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

    var etat = el("div", "p-etat " + (c.prisePar ? "pris" : "libre"));
    if (c.annulee) {
      etat.className = "p-etat";
      etat.textContent = "✕ Annulée";
    } else if (c.prisePar) {
      etat.appendChild(document.createTextNode("✓ Prise par " + c.prisePar));
      if (c.priseParMoi || moi.admin) {
        var lib = el("button", "p-petit-bouton", c.priseParMoi ? "Je ne peux plus" : "Libérer");
        lib.addEventListener("click", function () {
          if (!confirm("Remettre cette course à disposition des partenaires ?")) return;
          api("POST", "/courses/" + c.id + "/liberer").then(function () { message("Course remise à disposition."); recharger(); }).catch(function (e) { message(e.message); });
        });
        etat.appendChild(lib);
      }
    } else {
      etat.appendChild(document.createTextNode("● Libre"));
      var prendre = el("button", "p-prendre", "Je la prends");
      prendre.addEventListener("click", function () {
        prendre.disabled = true;
        api("POST", "/courses/" + c.id + "/prendre").then(function () { message("C'est noté : la course est à vous."); recharger(); })
          .catch(function (e) { message(e.message); recharger(); });
      });
      etat.appendChild(prendre);
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
    } else if (!c.prisePar && !c.annulee) {
      carte.appendChild(el("div", "p-cache", "Nom et téléphone du client affichés à celui qui prend la course"));
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
      r.courses.forEach(function (c) { liste.appendChild(carteCourse(c)); });
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
        liste.appendChild(carteCourse(c));
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
    api("GET", "/admin/mes-courses?debut=" + semaineMes + "&fin=" + fin).then(function (r) {
      mesCourses = r.courses;
      liste.textContent = "";
      $("pMesCopier").hidden = !r.courses.length;
      if (!r.courses.length) { liste.appendChild(el("div", "p-vide", "Aucune réservation du site sur ces 7 jours.")); return; }
      var dateCourante = null;
      r.courses.forEach(function (c) {
        if (c.date !== dateCourante) {
          dateCourante = c.date;
          var n = r.courses.filter(function (x) { return x.date === c.date; }).length;
          liste.appendChild(el("div", "p-titre-jour", titreJour(c.date) + " · " + n + " course" + (n > 1 ? "s" : "")));
        }
        liste.appendChild(carteMaCourse(c));
      });
    }).catch(function () {});
  }

  function texteMes() {
    var lignes = [], dateCourante = null;
    mesCourses.forEach(function (c) {
      if (c.date !== dateCourante) {
        dateCourante = c.date;
        if (lignes.length) lignes.push("");
        lignes.push(titreJour(c.date).toUpperCase());
      }
      lignes.push("- " + heureMa(c) + (c.heureRdv && (c.heurePc || c.pcADefinir) ? " (RDV " + heure(c.heureRdv) + ")" : "") +
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

  function chargerBilan() {
    $("pMoisTitre").textContent = "Bilan de " + titreMois(mois);
    var zone = $("pBilan");
    api("GET", "/bilan?mois=" + mois).then(function (b) {
      zone.textContent = "";
      var grille = el("div", "p-chiffres");
      grille.appendChild(chiffre(String(b.total), "courses Google Ads"));
      grille.appendChild(chiffre(euros(b.depense), "budget dépensé"));
      grille.appendChild(chiffre(b.coutParCourse == null ? "—" : euros(b.coutParCourse), "coût par course"));
      grille.appendChild(chiffre(String(b.nonPrises), "courses non prises"));
      zone.appendChild(grille);
      if (b.parTelephone) zone.appendChild(el("p", "p-petit p-marge", "Dont " + b.parTelephone + " reçue(s) par téléphone."));

      var bloc = el("div", "p-bloc");
      bloc.appendChild(el("h3", null, "Courses prises par chacun"));
      var max = Math.max(1, Math.max.apply(null, b.partenaires.map(function (p) { return p.courses; })));
      b.partenaires.forEach(function (p) {
        var r = el("div", "p-rang");
        r.appendChild(el("span", null, p.nom));
        r.appendChild(el("b", null, String(p.courses)));
        bloc.appendChild(r);
        var barre = el("div", "p-barre");
        barre.style.width = Math.max(3, Math.round((p.courses / max) * 100)) + "%";
        bloc.appendChild(barre);
      });
      zone.appendChild(bloc);

      var budget = el("div", "p-bloc");
      budget.appendChild(el("h3", null, "Participation au budget"));
      var aucune = true;
      b.partenaires.forEach(function (p) {
        if (p.budget == null) return;
        aucune = false;
        var r = el("div", "p-rang");
        r.appendChild(el("span", null, p.nom));
        var v = el("b", p.paye ? "p-paye" : "p-du", euros(p.budget) + (p.paye ? " ✓ payé" : " · à régler"));
        r.appendChild(v);
        budget.appendChild(r);
      });
      if (aucune) budget.appendChild(el("p", "p-petit", "Pas encore de participation saisie pour ce mois."));
      zone.appendChild(budget);
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

  function chargerPartenaires() {
    var zone = $("pListePartenaires");
    api("GET", "/admin/partenaires").then(function (r) {
      zone.textContent = "";
      r.partenaires.forEach(function (p) {
        var d = el("div", "p-partenaire");
        d.appendChild(el("div", "nom", p.nom + (p.admin ? " (vous, admin)" : "") + (p.actif ? "" : " · désactivé")));
        d.appendChild(el("div", "det", [p.telephone ? "📞 " + p.telephone : "pas de téléphone (pas de SMS)", p.peut_ajouter ? "peut ajouter des courses" : ""].filter(Boolean).join(" · ")));
        if (!p.admin) {
          var act = el("div", "act");
          function bouton(texte, corps, apres) {
            var b = el("button", null, texte);
            b.addEventListener("click", function () {
              api("POST", "/admin/partenaires/" + p.id, corps).then(function (res) { if (apres) apres(res); chargerPartenaires(); }).catch(function (e) { message(e.message); });
            });
            act.appendChild(b);
          }
          bouton(p.actif ? "Désactiver" : "Réactiver", { actif: !p.actif });
          bouton(p.peut_ajouter ? "Retirer l'ajout de courses" : "Autoriser l'ajout de courses", { peutAjouter: !p.peut_ajouter });
          bouton("Nouveau lien", { nouveauLien: true }, function (res) { afficherLien(p.nom, res.lien); message("L'ancien lien ne marche plus."); });
          var tel = el("button", null, "Téléphone");
          tel.addEventListener("click", function () {
            var t = prompt("Téléphone de " + p.nom + " (pour les SMS des nouvelles courses) :", p.telephone || "");
            if (t === null) return;
            api("POST", "/admin/partenaires/" + p.id, { telephone: t }).then(chargerPartenaires).catch(function (e) { message(e.message); });
          });
          act.appendChild(tel);
          d.appendChild(act);
        }
        zone.appendChild(d);
      });
    }).catch(function () {});
  }

  function chargerBudget() {
    $("pBudgetMois").textContent = titreMois(moisBudget);
    api("GET", "/bilan?mois=" + moisBudget).then(function (b) {
      $("pDepense").value = b.depense == null ? "" : b.depense;
      var zone = $("pParts");
      zone.textContent = "";
      zone.appendChild(el("p", "p-petit", "Part de chacun pour ce mois :"));
      b.partenaires.forEach(function (p) {
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
        zone.appendChild(r);
      });
    }).catch(function () {});
    api("GET", "/admin/clients").then(function (r) {
      $("pNbClients").textContent = r.nombre + " numéro(s) de clients enregistré(s).";
    }).catch(function () {});
  }

  // ----- Onglets -----
  var vueActive = "jour";
  function recharger() {
    if (vueActive === "jour") chargerJour();
    if (vueActive === "semaine") chargerSemaine();
    if (vueActive === "bilan") chargerBilan();
    if (vueActive === "mes") chargerMes();
    if (vueActive === "gestion") { chargerPartenaires(); chargerBudget(); }
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
      var t = texteMes();
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
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements;
      if (!f.heurePc.value && !f.heureRdv.value) {
        $("pErreurCourse").textContent = "Indiquez l'heure de prise en charge ou de rendez-vous.";
        $("pErreurCourse").hidden = false;
        return;
      }
      api("POST", "/courses", {
        type: form.querySelector("input[name=type]:checked").value,
        nom: f.nom.value, telephone: f.telephone.value, depart: f.depart.value, destination: f.destination.value,
        date: f.date.value, heurePc: f.heurePc.value, heureRdv: f.heureRdv.value, commentaire: f.commentaire.value,
        garder: moi.admin && !!form.querySelector("input[name=garder]:checked").value,
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
    $("pDepenseOk").addEventListener("click", function () {
      api("POST", "/admin/budget", { mois: moisBudget, depense: Number($("pDepense").value || 0) }).then(function () { message("Dépense enregistrée."); }).catch(function (e) { message(e.message); });
    });
    $("pNumerosOk").addEventListener("click", function () {
      var numeros = $("pNumeros").value;
      if (!numeros.trim()) return;
      api("POST", "/admin/clients", { numeros: numeros }).then(function (r) {
        $("pNumeros").value = "";
        $("pNbClients").textContent = r.nombre + " numéro(s) de clients enregistré(s).";
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
      // « Je la garde » : administrateur seul. Un partenaire qui ajoute une
      // course la met forcement au dispatch.
      $("pQuiLabel").hidden = !moi.admin;
      $("pQuiChoix").hidden = !moi.admin;
      brancher();
      changerVue("jour");
    })
    .catch(function () { afficherConnexion("Connexion impossible, réessayez dans un instant."); });
})();
