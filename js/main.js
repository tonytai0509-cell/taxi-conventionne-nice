(function () {
  "use strict";

  // Mobile nav toggle
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Liens internes (« Réserver »...) : defilement gere ici. Sans ca, un lien
  // vers l'ancre deja presente dans l'adresse (visiteur arrive par le QR code
  // ou un lien en .../#reserver) ne faisait rien du tout.
  document.addEventListener("click", function (e) {
    var lien = e.target.closest && e.target.closest('a[href^="#"]');
    if (!lien) return;
    var id = lien.getAttribute("href").slice(1);
    var cible = cibleAncre(id);
    if (!cible) return;
    e.preventDefault();
    cible.scrollIntoView({ behavior: "smooth", block: "start" });
    if (history.replaceState) history.replaceState(null, "", "#" + id);
  });

  // « #reserver » mene directement au formulaire (« Qui reserve ? ») et non au
  // titre de la section : arrives par le QR code, les clients ne voyaient pas
  // qu'il fallait descendre.
  function cibleAncre(id) {
    if (id === "reserver") return document.getElementById("reserveForm") || document.getElementById(id);
    return id ? document.getElementById(id) : null;
  }
  if (location.hash === "#reserver") {
    var aBouge = false;
    var bouge = function () { aBouge = true; };
    ["touchstart", "wheel", "keydown"].forEach(function (t) { window.addEventListener(t, bouge, { passive: true, once: true }); });
    var placer = function () {
      var f = cibleAncre("reserver");
      if (f && !aBouge) f.scrollIntoView({ block: "start" });
    };
    // Une fois tout de suite, puis apres le chargement des images (la page
    // s'allonge et decale le formulaire).
    requestAnimationFrame(placer);
    window.addEventListener("load", function () { setTimeout(placer, 50); });
  }

  // Origine du visiteur, gardee 30 jours sur ce telephone : pub Google Ads
  // (gclid / gbraid / wbraid ou utm cpc) ou QR code / cartes de Tony (?src=qr).
  // Sert a trier les reservations (espace partenaires ou Tony).
  (function () {
    try {
      var p = new URLSearchParams(location.search);
      var origine = null;
      if (p.get("src") === "qr") origine = "qr";
      else if (p.get("gclid") || p.get("gbraid") || p.get("wbraid") || (p.get("utm_source") === "google" && /cpc|ads|paid/.test(p.get("utm_medium") || ""))) origine = "ads";
      if (origine) localStorage.setItem("origineVisite", JSON.stringify({ o: origine, t: Date.now() }));
    } catch (e) {}
  })();
  function origineVisite() {
    try {
      var v = JSON.parse(localStorage.getItem("origineVisite") || "null");
      if (v && Date.now() - v.t < 30 * 24 * 3600 * 1000) return v.o;
    } catch (e) {}
    return "site";
  }

  // Gold progress bar under the header, filling left-to-right with scroll depth,
  // with a lit-fuse spark glowing at the advancing tip
  var headerProgressFill = document.getElementById("headerProgressFill");
  var headerProgressSpark = document.getElementById("headerProgressSpark");
  if (headerProgressFill && headerProgressSpark) {
    var updateHeaderProgress = function () {
      var scrollTop = window.scrollY || document.documentElement.scrollTop;
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0;
      var pctStr = pct * 100 + "%";
      headerProgressFill.style.width = pctStr;
      headerProgressSpark.style.left = pctStr;
      headerProgressSpark.classList.toggle("is-active", pct > 0.002);
    };
    window.addEventListener("scroll", updateHeaderProgress, { passive: true });
    window.addEventListener("resize", updateHeaderProgress);
    updateHeaderProgress();
  }

  // Reveal on scroll (progressive enhancement: elements are visible by
  // default in CSS; only hide-then-animate them once we know JS runs).
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    revealEls.forEach(function (el) { el.classList.add("pending"); });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  }

  // Animated counters: count from 0 to the target number once the stat
  // card scrolls into view
  var statNumbers = document.querySelectorAll(".stat-number");
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var animateCount = function (el) {
    var from = parseInt(el.getAttribute("data-count-from"), 10) || 0;
    var target = parseInt(el.getAttribute("data-count-to"), 10) || 0;
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduceMotion) {
      el.textContent = target + suffix;
      return;
    }
    var duration = 1400;
    var start = null;
    var step = function (timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min(1, (timestamp - start) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + eased * (target - from)) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (statNumbers.length && "IntersectionObserver" in window) {
    var statsIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            statsIo.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    statNumbers.forEach(function (el) { statsIo.observe(el); });
  } else {
    statNumbers.forEach(function (el) {
      el.textContent = (el.getAttribute("data-count-to") || "0") + (el.getAttribute("data-suffix") || "");
    });
  }

  // Footer year
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Reservation date field: no past dates
  var dateInput = document.getElementById("f-date");
  if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);

  // Zone map: load the embed only when the visitor asks for it
  var mapContainer = document.getElementById("zoneMap");
  var mapButton = document.getElementById("zoneMapButton");
  if (mapContainer && mapButton) {
    mapButton.addEventListener("click", function () {
      var iframe = document.createElement("iframe");
      iframe.title = "Carte de la zone desservie : Nice, Saint-Laurent-du-Var, Cagnes-sur-Mer";
      iframe.src = mapContainer.getAttribute("data-map-src");
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer-when-downgrade";
      mapContainer.innerHTML = "";
      mapContainer.appendChild(iframe);
    });
  }

  // Highlight the current section's link in the main nav while scrolling
  var navLinks = nav ? nav.querySelectorAll("a[href^='#']") : [];
  var sections = [];
  navLinks.forEach(function (link) {
    var section = document.querySelector(link.getAttribute("href"));
    if (section) sections.push({ link: link, section: section });
  });
  if (sections.length && "IntersectionObserver" in window) {
    var navIo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var match = sections.find(function (s) { return s.section === entry.target; });
          if (!match) return;
          if (entry.isIntersecting) {
            navLinks.forEach(function (l) { l.classList.remove("is-active"); });
            match.link.classList.add("is-active");
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach(function (s) { navIo.observe(s.section); });
  }

  // ----- Reservation form (card-based flow) -----
  var reserveForm = document.getElementById("reserveForm");
  if (reserveForm) {
    var radioPrive = document.getElementById("f-type-prive");
    var radioMedical = document.getElementById("f-type-medical");
    var optionsMedical = document.getElementById("rOptionsMedical");
    var destinationInput = document.getElementById("f-destination");
    var destinationLabel = document.getElementById("rDestinationLabel");
    var destinationIcone = document.getElementById("rDestinationIcone");
    var boutonTexte = document.getElementById("rBoutonTexte");

    var iconePin = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    var iconeHopital = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><path d="M12 7v6M9 10h6"/></svg>';

    function majOptionsMedical() {
      var estMedical = radioMedical.checked;
      optionsMedical.hidden = !estMedical;
      if (destinationLabel) destinationLabel.textContent = estMedical ? "Établissement ou destination" : "Destination";
      if (destinationIcone) destinationIcone.innerHTML = estMedical ? iconeHopital : iconePin;
      if (destinationInput) destinationInput.placeholder = estMedical ? "Ex : Hôpital Pasteur 2" : "Ex : Aéroport de Nice";
      if (boutonTexte) boutonTexte.textContent = estMedical ? "Réserver mon transport" : "Réserver la course";
    }
    if (radioPrive && radioMedical && optionsMedical) {
      radioPrive.addEventListener("change", majOptionsMedical);
      radioMedical.addEventListener("change", majOptionsMedical);
      majOptionsMedical();
    }

    // « Qui reserve ? » : un professionnel de sante reserve pour un patient.
    var quiPro = document.getElementById("f-qui-pro");
    var quiPatient = document.getElementById("f-qui-patient");
    var blocPro = document.getElementById("rBlocPro");
    function majQui() {
      var pro = quiPro.checked;
      blocPro.hidden = !pro;
      document.getElementById("f-reserve-par").required = pro;
      document.getElementById("f-tel-reservant").required = pro;
      document.getElementById("rTitreCoordonnees").textContent = pro ? "Patient" : "Vos coordonnées";
      document.getElementById("rLabelTelephone").textContent = pro ? "Téléphone du patient" : "Téléphone";
    }
    if (quiPro && quiPatient && blocPro) {
      quiPro.addEventListener("change", majQui);
      quiPatient.addEventListener("change", majQui);
      majQui();
    }

    // Swap "prise en charge" / "destination" addresses
    var boutonInverser = document.getElementById("rBoutonInverser");
    var priseEnChargeInput = document.getElementById("f-prise-en-charge");
    if (boutonInverser && priseEnChargeInput && destinationInput) {
      boutonInverser.addEventListener("click", function () {
        var temp = priseEnChargeInput.value;
        priseEnChargeInput.value = destinationInput.value;
        destinationInput.value = temp;
      });
    }

    // Suggestions d'adresses pendant la saisie (etablissements connus + BAN).
    // Liste partagee avec l'espace partenaires : js/etablissements.js.
    var ETABLISSEMENTS = window.ETABLISSEMENTS_NICE || [];
    function sansAccents(t) {
      return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }
    function activerSuggestions(champ) {
      if (!champ) return;
      champ.setAttribute("autocomplete", "off");
      var liste = document.createElement("ul");
      liste.className = "rsuggestions";
      liste.hidden = true;
      champ.parentNode.appendChild(liste);
      var minuterie = null;
      var numero = 0;
      function fermer() { liste.hidden = true; liste.innerHTML = ""; }
      function afficher(elements) {
        liste.innerHTML = "";
        elements.forEach(function (el) {
          var li = document.createElement("li");
          var titre = document.createElement("strong");
          titre.textContent = el.titre;
          li.appendChild(titre);
          if (el.detail) {
            var detail = document.createElement("span");
            detail.textContent = el.detail;
            li.appendChild(detail);
          }
          li.addEventListener("mousedown", function (e) {
            e.preventDefault();
            champ.value = el.valeur;
            fermer();
          });
          liste.appendChild(li);
        });
        liste.hidden = elements.length === 0;
      }
      champ.addEventListener("input", function () {
        var texte = champ.value.trim();
        clearTimeout(minuterie);
        if (texte.length < 2) { fermer(); return; }
        var connus = window.etablissementsConnus ? window.etablissementsConnus(texte) : [];
        afficher(connus);
        if (texte.length < 3) return;
        var moi = ++numero;
        minuterie = setTimeout(function () {
          fetch("/api/adresses?q=" + encodeURIComponent(texte))
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (moi !== numero) return;
              var adresses = (d.adresses || []).map(function (a) { return { titre: a, valeur: a }; });
              afficher(connus.concat(adresses).slice(0, 7));
            })
            .catch(function () {});
        }, 250);
      });
      // Mobile : le champ remonte sous l'en-tete et la barre du bas se cache,
      // pour que les suggestions restent visibles au-dessus du clavier.
      function placerChamp() {
        if (window.innerWidth > 760) return;
        var entete = document.getElementById("header");
        var haut = entete ? entete.getBoundingClientRect().height : 0;
        window.scrollTo({ top: champ.getBoundingClientRect().top + window.pageYOffset - haut - 40, behavior: "smooth" });
      }
      function ajusterHauteur() {
        var vue = window.visualViewport;
        if (!vue) return;
        var dispo = vue.height - champ.getBoundingClientRect().bottom - 16;
        liste.style.maxHeight = Math.max(140, Math.min(320, dispo)) + "px";
      }
      champ.addEventListener("focus", function () {
        document.body.classList.add("saisie-adresse");
        setTimeout(placerChamp, 250);
      });
      if (window.visualViewport) window.visualViewport.addEventListener("resize", function () { if (!liste.hidden) ajusterHauteur(); });
      var afficherBase = afficher;
      afficher = function (elements) { afficherBase(elements); if (elements.length) ajusterHauteur(); };
      champ.addEventListener("blur", function () {
        document.body.classList.remove("saisie-adresse");
        setTimeout(fermer, 150);
      });
      champ.addEventListener("keydown", function (e) { if (e.key === "Escape") fermer(); });
    }
    activerSuggestions(priseEnChargeInput);
    activerSuggestions(destinationInput);

    // "Calcul automatique de l'heure de prise en charge" toggle
    var caseInconnue = document.getElementById("f-heure-inconnue");
    var champPC = document.getElementById("f-heure-pc");
    var champRDV = document.getElementById("f-heure-rdv");
    function majEtatsChamps() {
      var inconnue = caseInconnue.checked;
      champPC.disabled = inconnue;
      champPC.required = !inconnue;
      if (inconnue) champPC.value = "";
      champRDV.required = inconnue;
    }
    if (caseInconnue && champPC && champRDV) {
      caseInconnue.addEventListener("change", majEtatsChamps);
      majEtatsChamps();
    }

    // Submit -> Netlify function: creates the Google Agenda event and sends
    // the confirmation email (same format as reservation_web.py).
    var boutonEnvoyer = reserveForm.querySelector(".renvoyer");
    var statusEl = document.getElementById("rFormStatus");

    function afficherStatus(type, message) {
      if (!statusEl) return;
      statusEl.hidden = false;
      statusEl.className = "rform-status rform-status-" + type;
      statusEl.textContent = message;
    }

    // Verrou d'envoi : desactiver le bouton ne suffit pas (un formulaire peut
    // aussi etre soumis par la touche Entree), et un double envoi creerait
    // deux evenements d'agenda pour une seule course.
    var envoiEnCours = false;

    reserveForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (envoiEnCours) return;
      envoiEnCours = true;
      var data = new FormData(reserveForm);
      var payload = {
        prenom: data.get("prenom") || "",
        nom: data.get("nom") || "",
        telephone: data.get("telephone") || "",
        typeCourse: data.get("typeCourse") || "prive",
        accompagnant: !!data.get("accompagnant"),
        btoRetour: !!data.get("btoRetour"),
        priseEnCharge: data.get("priseEnCharge") || "",
        destination: data.get("destination") || "",
        date: data.get("date") || "",
        heureRdv: data.get("heureRdv") || "",
        heurePc: data.get("heurePc") || "",
        siteWeb: data.get("siteWeb") || "",
        reservePar: data.get("qui") === "pro" ? data.get("reservePar") || "" : "",
        telReservant: data.get("qui") === "pro" ? data.get("telReservant") || "" : "",
        telephone2: data.get("telephone2") || "",
        commentaire: data.get("commentaire") || "",
        origine: origineVisite(),
      };

      if (boutonEnvoyer) boutonEnvoyer.disabled = true;
      afficherStatus("pending", "Envoi de votre demande en cours…");

      fetch("/.netlify/functions/reserver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (resp) {
          return resp.json().then(function (json) {
            return { status: resp.status, json: json };
          });
        })
        .then(function (result) {
          var json = result.json || {};
          if (result.status !== 200 || !json.ok) {
            afficherStatus(
              "error",
              "Votre demande n'a pas pu être envoyée automatiquement. Merci d'appeler directement le 06 24 83 64 48."
            );
            return;
          }

          // Le serveur repond ok:true des que la saisie est valide, meme si
          // l'agenda et l'e-mail ont echoue ensuite. Sans ce controle, le
          // client verrait "demande recue" alors que la centrale n'a rien
          // recu du tout : on ne confirme donc que si au moins un des deux
          // canaux a reellement abouti.
          var agendaOk = !!(json.agenda && json.agenda.ok);
          var emailOk = !!(json.email && json.email.ok);

          if (!agendaOk && !emailOk) {
            afficherStatus(
              "error",
              "Votre demande n'a pas pu être enregistrée. Merci d'appeler directement le " +
              "06 24 83 64 48 pour confirmer votre course."
            );
            return;
          }

          if (typeof gtag === "function") {
            gtag("event", "conversion", {
              send_to: "AW-18403307378/lmN8CM-whO4cEPLesMdE",
              value: 1.0,
              currency: "EUR",
            });
          }

          afficherStatus(
            "success",
            "Merci ! Votre demande a bien été reçue (référence " + json.reference + "). " +
            "Nous vous recontactons pour confirmer."
          );
          reserveForm.reset();
          if (radioMedical) { radioMedical.checked = true; majOptionsMedical(); }
        })
        .catch(function () {
          afficherStatus(
            "error",
            "Votre demande n'a pas pu être envoyée (connexion). Merci d'appeler directement le 06 24 83 64 48."
          );
        })
        .finally(function () {
          envoiEnCours = false;
          if (boutonEnvoyer) boutonEnvoyer.disabled = false;
        });
    });
  }
})();
