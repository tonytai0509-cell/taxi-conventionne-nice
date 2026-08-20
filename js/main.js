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

  // Footer year
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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

  // Quick-fill buttons for the "Nom de l'établissement" field
  var facilityChips = document.getElementById("facilityChips");
  var facilityInput = document.getElementById("f-facility");
  if (facilityChips && facilityInput) {
    facilityChips.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        facilityInput.value = btn.textContent;
        facilityInput.focus();
      });
    });
  }

  // Reservation form -> WhatsApp
  function formatDateTimeFr(value) {
    if (!value) return value;
    var parts = value.split("T");
    if (parts.length !== 2) return value;
    var dateParts = parts[0].split("-");
    if (dateParts.length !== 3) return value;
    return dateParts[2] + "/" + dateParts[1] + "/" + dateParts[0] + " à " + parts[1];
  }

  var form = document.getElementById("reserveForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var lines = [
        "Nouvelle demande de transport :",
        "Nom : " + data.get("name"),
        "Téléphone : " + data.get("phone"),
        "Trajet : " + data.get("tripType"),
      ];
      lines.push("Accompagnant : " + (data.get("accompanist") ? "Oui" : "Non"));
      lines.push("Bon de transport remis au retour : " + (data.get("btReturn") ? "Oui" : "Non"));
      lines.push("Date/heure de prise en charge : " + formatDateTimeFr(data.get("datetime")));
      var apptTime = data.get("apptTime");
      if (apptTime) lines.push("Heure du rendez-vous médical : " + apptTime);
      var facility = data.get("facility");
      if (facility) lines.push("Établissement : " + facility);
      lines.push("Départ : " + data.get("from"));
      lines.push("Arrivée : " + data.get("to"));
      lines.push("Passagers : " + data.get("passengers"));
      lines.push("Aide à la marche : " + data.get("walkingHelp"));
      lines.push("Retour : " + data.get("returnTrip"));
      lines.push("Type de course : " + data.get("type"));

      var message = data.get("message");
      if (message) lines.push("Message : " + message);

      var text = encodeURIComponent(lines.join("\n"));
      window.open("https://wa.me/33624836448?text=" + text, "_blank", "noopener");
    });
  }
})();
