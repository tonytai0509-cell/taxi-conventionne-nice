-- Base D1 de l'application feuille de route. Un chauffeur = une ligne : le
-- refresh_token_chiffre suffit a re-obtenir un acces a son agenda a chaque
-- consultation, sans lui redemander de se reconnecter chaque jour.

CREATE TABLE IF NOT EXISTS utilisateurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  nom TEXT,
  refresh_token_chiffre TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  cree_le TEXT NOT NULL DEFAULT (datetime('now')),
  maj_le TEXT NOT NULL DEFAULT (datetime('now'))
);
