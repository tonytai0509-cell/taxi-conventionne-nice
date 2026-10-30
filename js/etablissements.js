// Etablissements connus et leurs raccourcis (« stg », « p2 », « cal »...),
// proposes en premier pendant la saisie d'une adresse : formulaire du site
// (js/main.js) et espace partenaires (js/partenaires.js).
(function () {
  "use strict";
  // [nom affiche, raccourcis, adresse]
  var LISTE = [
    ["Hôpital Pasteur 2", "pasteur p2 pst chu", "30 avenue de la Voie Romaine, 06000 Nice"],
    ["Hôpital de l'Archet", "archet arc a1 a2 chu", "151 route Saint-Antoine de Ginestière, 06200 Nice"],
    ["Hôpital Lenval (pédiatrique)", "lenval len chu pediatrique", "57 avenue de la Californie, 06200 Nice"],
    ["Hôpital Saint-Roch", "saint roch st roch str chu", "5 rue Pierre Dévoluy, 06000 Nice"],
    ["Hôpital de Cimiez", "cimiez cim chu", "4 avenue Reine Victoria, 06003 Nice"],
    ["Hôpital Les Sources", "sources src", "10 chemin René Pietruschi, 06100 Nice"],
    ["Centre Antoine Lacassagne", "lacassagne cal cac antoine", "33 avenue de Valombrose, 06189 Nice"],
    ["Clinique Saint-George", "saint georges st george stg csg", "2 avenue de Rimiez, 06100 Nice"],
    ["Clinique du Parc Impérial", "parc imperial cpi", "28 boulevard du Tzarewitch, 06000 Nice"],
    ["Clinique Saint-Antoine", "saint antoine st antoine sta", "7 avenue Durante, 06000 Nice"],
    ["Clinique Saint-François", "saint francois st francois stf", "10 boulevard Pasteur, 06000 Nice"],
    ["Polyclinique Santa Maria", "santa maria psm", "57 avenue de la Californie, 06200 Nice"],
    ["Polyclinique Saint-Jean", "saint jean st jean stj cagnes", "92 avenue du Docteur Maurice Donat, 06800 Cagnes-sur-Mer"],
    ["Institut Arnault Tzanck", "tzanck tz iat", "231 avenue du Docteur Maurice Donat, 06721 Saint-Laurent-du-Var"],
    ["Aéroport Nice - Terminal 1", "aeroport t1", "Boulevard Maryse Bastié, 06200 Nice"],
    ["Aéroport Nice - Terminal 2", "aeroport t2", "Boulevard Jacqueline Auriol, 06200 Nice"],
    ["Gare de Nice-Ville", "gare thiers sncf", "Avenue Thiers, 06000 Nice"],
  ];

  function sansAccents(t) {
    return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  window.ETABLISSEMENTS_NICE = LISTE;

  // Suggestions pour le texte tape : raccourci exact d'abord, puis le reste.
  window.etablissementsConnus = function (texte) {
    var cle = sansAccents(texte).trim();
    if (cle.length < 2) return [];
    var exacts = [], autres = [];
    LISTE.forEach(function (e) {
      var mots = sansAccents(e[1]).split(" ");
      if (mots.indexOf(cle) !== -1) exacts.push(e);
      else if (cle.length >= 3 && sansAccents(e[0] + " " + e[1]).indexOf(cle) !== -1) autres.push(e);
    });
    return exacts.concat(autres).slice(0, 3).map(function (e) {
      return { titre: e[0], detail: e[2], valeur: e[0] + ", " + e[2] };
    });
  };
})();
