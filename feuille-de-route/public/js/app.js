(function () {
  "use strict";

  var elNomChauffeur = document.getElementById("nom-chauffeur");
  var elChoixCalendrier = document.getElementById("choix-calendrier");
  var elDateInput = document.getElementById("date-selectionnee");
  var elDateAffichee = document.getElementById("date-affichee");
  var elChargement = document.getElementById("chargement");
  var elErreur = document.getElementById("erreur");
  var elVide = document.getElementById("vide");
  var elListe = document.getElementById("liste-courses");

  var dateCourante = new Date();

  function versISO(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function depuisISO(iso) {
    var parties = iso.split("-").map(Number);
    return new Date(parties[0], parties[1] - 1, parties[2]);
  }

  function echapper(texte) {
    var div = document.createElement("div");
    div.textContent = texte == null ? "" : String(texte);
    return div.innerHTML;
  }

  function formatHeure(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Paris",
      });
    } catch (e) {
      return "";
    }
  }

  async function api(chemin, options) {
    var reponse = await fetch(chemin, Object.assign({ credentials: "same-origin" }, options || {}));
    if (reponse.status === 401) {
      location.replace("/");
      throw new Error("Non connecte");
    }
    var donnees = await reponse.json().catch(function () {
      return {};
    });
    if (!reponse.ok || donnees.ok === false) {
      throw new Error(donnees.error || "Erreur " + reponse.status);
    }
    return donnees;
  }

  function rendreCourse(course) {
    var article = document.createElement("article");
    article.className = "course" + (course.type === "medical" ? " type-medical" : "");

    var heure = document.createElement("div");
    heure.className = "course-heure";
    heure.textContent = course.journeeEntiere ? "Journée" : formatHeure(course.debut);
    article.appendChild(heure);

    var corps = document.createElement("div");
    corps.className = "course-corps";

    var lignesHtml = "<h3>" + echapper(course.titre) + "</h3>";
    if (course.priseEnCharge) lignesHtml += "<p><strong>Prise en charge :</strong> " + echapper(course.priseEnCharge) + "</p>";
    if (course.destination) lignesHtml += "<p><strong>Destination :</strong> " + echapper(course.destination) + "</p>";
    if (course.heureRdv) lignesHtml += "<p><strong>Rendez-vous :</strong> " + echapper(course.heureRdv) + "</p>";
    if (course.telephone) {
      lignesHtml +=
        '<p><strong>Téléphone :</strong> <a href="tel:' +
        echapper(course.telephone.replace(/[^0-9+]/g, "")) +
        '">' +
        echapper(course.telephone) +
        "</a></p>";
    }
    if (!course.priseEnCharge && !course.destination && course.descriptionBrute) {
      lignesHtml += "<p>" + echapper(course.descriptionBrute).replace(/\n/g, "<br>") + "</p>";
    }
    if (course.reference) lignesHtml += "<p><strong>Réf :</strong> " + echapper(course.reference) + "</p>";

    var badges = [];
    if (course.type === "medical") badges.push("Médical");
    if (course.accompagnant) badges.push("Accompagnant");
    if (course.bonTransportRetour) badges.push("BT au retour");
    if (badges.length) {
      lignesHtml +=
        '<p class="badges">' +
        badges.map(function (b) { return '<span class="badge">' + echapper(b) + "</span>"; }).join("") +
        "</p>";
    }

    corps.innerHTML = lignesHtml;
    article.appendChild(corps);
    return article;
  }

  async function chargerFeuilleDeRoute() {
    var iso = versISO(dateCourante);
    elDateInput.value = iso;
    elDateAffichee.textContent = dateCourante.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    elChargement.hidden = false;
    elErreur.hidden = true;
    elVide.hidden = true;
    elListe.innerHTML = "";

    try {
      var donnees = await api("/api/feuille-de-route?date=" + iso);
      elChargement.hidden = true;
      if (!donnees.courses.length) {
        elVide.hidden = false;
        return;
      }
      donnees.courses.forEach(function (course) {
        elListe.appendChild(rendreCourse(course));
      });
    } catch (e) {
      elChargement.hidden = true;
      elErreur.hidden = false;
      elErreur.textContent = e.message || "Une erreur est survenue.";
    }
  }

  async function initialiser() {
    try {
      var moi = await api("/api/me");
      elNomChauffeur.textContent = moi.nom ? moi.nom + " · " + moi.email : moi.email;

      try {
        var reponseCalendriers = await api("/api/calendars");
        if (reponseCalendriers.calendriers.length > 1) {
          elChoixCalendrier.hidden = false;
          elChoixCalendrier.innerHTML = reponseCalendriers.calendriers
            .map(function (c) {
              return '<option value="' + echapper(c.id) + '"' + (c.id === moi.calendarId ? " selected" : "") + ">" + echapper(c.nom) + "</option>";
            })
            .join("");
          elChoixCalendrier.addEventListener("change", async function () {
            await api("/api/calendar-choice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ calendarId: elChoixCalendrier.value }),
            });
            chargerFeuilleDeRoute();
          });
        }
      } catch (e) {
        // La liste des calendriers est une commodite : si elle echoue, on
        // continue avec le calendrier deja enregistre (ou "primary").
      }

      document.getElementById("jour-precedent").addEventListener("click", function () {
        dateCourante.setDate(dateCourante.getDate() - 1);
        chargerFeuilleDeRoute();
      });
      document.getElementById("jour-suivant").addEventListener("click", function () {
        dateCourante.setDate(dateCourante.getDate() + 1);
        chargerFeuilleDeRoute();
      });
      document.getElementById("bouton-aujourdhui").addEventListener("click", function () {
        dateCourante = new Date();
        chargerFeuilleDeRoute();
      });
      elDateInput.addEventListener("change", function () {
        if (elDateInput.value) {
          dateCourante = depuisISO(elDateInput.value);
          chargerFeuilleDeRoute();
        }
      });
      document.getElementById("bouton-imprimer").addEventListener("click", function () {
        window.print();
      });

      chargerFeuilleDeRoute();
    } catch (e) {
      // api() redirige deja vers "/" en cas de 401 ; toute autre erreur ici
      // est inattendue (ex : D1 indisponible), on l'affiche simplement.
      elChargement.hidden = true;
      elErreur.hidden = false;
      elErreur.textContent = "Impossible de charger votre profil. Reessayez plus tard.";
    }
  }

  initialiser();
})();
