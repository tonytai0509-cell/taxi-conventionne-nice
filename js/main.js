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
