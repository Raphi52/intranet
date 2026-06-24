/**
 * Section PUBLICATIONS — couche d'accès aux données (mur d'annonces de l'accueil).
 *
 * Une publication = titre + texte, signée par un compte `users`. Tout connecté en crée ;
 * l'auteur ou un admin l'édite/supprime ; l'admin peut l'épingler (remonte en tête).
 */

import db from '../../core/db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS publications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    auteur_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    auteur_nom TEXT NOT NULL DEFAULT '',
    titre      TEXT NOT NULL DEFAULT '',
    corps      TEXT NOT NULL DEFAULT '',
    epingle    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_publications_tri ON publications(epingle DESC, created_at DESC);
`);

// Titre : une ligne, contrôle retiré, plafonné. Corps : multi-ligne autorisée (\n gardé), autres
// caractères de contrôle non-imprimables retirés, plafonné.
const nettoyerTitre = (v) =>
  String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
const nettoyerCorps = (v) =>
  String(v ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, 5000);

const stmts = {
  insert: db.prepare(`
    INSERT INTO publications (auteur_id, auteur_nom, titre, corps)
    VALUES (@auteur_id, @auteur_nom, @titre, @corps)
  `),
  get: db.prepare(`SELECT * FROM publications WHERE id = ?`),
  list: db.prepare(`SELECT * FROM publications ORDER BY epingle DESC, created_at DESC LIMIT 50`),
  update: db.prepare(`UPDATE publications SET titre=@titre, corps=@corps, updated_at=datetime('now') WHERE id=@id`),
  setEpingle: db.prepare(`UPDATE publications SET epingle=@epingle, updated_at=datetime('now') WHERE id=@id`),
  delete: db.prepare(`DELETE FROM publications WHERE id = ?`),
};

const vue = (p) => (p ? { ...p, epingle: !!p.epingle } : null);

export function creerPublication({ titre, corps }, user = {}) {
  const t = nettoyerTitre(titre);
  if (!t) return null; // titre requis
  const info = stmts.insert.run({
    auteur_id: Number.isInteger(user.id) ? user.id : null,
    auteur_nom: String(user.nom ?? '').slice(0, 120),
    titre: t,
    corps: nettoyerCorps(corps),
  });
  return vue(stmts.get.get(info.lastInsertRowid));
}

export function listerPublications() {
  return stmts.list.all().map(vue);
}

export function getPublication(id) {
  return vue(stmts.get.get(id));
}

export function majPublication(id, { titre, corps }) {
  const p = stmts.get.get(id);
  if (!p) return null;
  const t = titre === undefined ? p.titre : nettoyerTitre(titre);
  if (!t) return null;
  stmts.update.run({ id, titre: t, corps: corps === undefined ? p.corps : nettoyerCorps(corps) });
  return vue(stmts.get.get(id));
}

export function epinglerPublication(id, epingle) {
  if (!stmts.get.get(id)) return null;
  stmts.setEpingle.run({ id, epingle: epingle ? 1 : 0 });
  return vue(stmts.get.get(id));
}

export function supprimerPublication(id) {
  return stmts.delete.run(id).changes > 0;
}
