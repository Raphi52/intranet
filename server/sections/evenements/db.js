/**
 * Section ÉVÉNEMENTS — couche d'accès aux données.
 *
 * Un événement (titre, date, lieu, description) créé par un compte `users`. Tout connecté
 * s'inscrit/se désinscrit (compteur = nb de participants, liste des noms visible).
 * Dates stockées en UTC ('YYYY-MM-DD HH:MM') ; le front convertit local <-> UTC.
 */

import db from '../../core/db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    createur_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    createur_nom TEXT NOT NULL DEFAULT '',
    titre        TEXT NOT NULL DEFAULT '',
    lieu         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    date_event   TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS event_participants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nom        TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(event_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_event_part ON event_participants(event_id);
`);

// Une ligne : contrôle retiré, espaces réduits, plafonné. Bloc : multi-ligne (\n gardé), contrôle retiré.
const ligne = (v, max = 200) =>
  String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const bloc = (v, max = 5000) =>
  String(v ?? '').replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, max);

const stmts = {
  insert: db.prepare(`
    INSERT INTO events (createur_id, createur_nom, titre, lieu, description, date_event)
    VALUES (@createur_id, @createur_nom, @titre, @lieu, @description, @date_event)
  `),
  get: db.prepare(`SELECT * FROM events WHERE id = ?`),
  list: db.prepare(`SELECT * FROM events LIMIT 200`),
  update: db.prepare(`UPDATE events SET titre=@titre, lieu=@lieu, description=@description, date_event=@date_event WHERE id=@id`),
  delete: db.prepare(`DELETE FROM events WHERE id = ?`),
  participants: db.prepare(`SELECT user_id, nom FROM event_participants WHERE event_id = ? ORDER BY created_at, id`),
  inscrire: db.prepare(`INSERT OR IGNORE INTO event_participants (event_id, user_id, nom) VALUES (?, ?, ?)`),
  desinscrire: db.prepare(`DELETE FROM event_participants WHERE event_id = ? AND user_id = ?`),
};

function decorer(e, userId) {
  if (!e) return null;
  const parts = stmts.participants.all(e.id);
  return {
    ...e,
    participants: parts,
    nb_participants: parts.length,
    je_participe: parts.some((p) => p.user_id === userId),
  };
}

export function creerEvent(data, user = {}) {
  const titre = ligne(data.titre, 150);
  if (!titre) return null; // titre requis
  const info = stmts.insert.run({
    createur_id: Number.isInteger(user.id) ? user.id : null,
    createur_nom: ligne(user.nom, 120),
    titre,
    lieu: ligne(data.lieu, 200),
    description: bloc(data.description),
    date_event: ligne(data.date_event, 30),
  });
  return decorer(stmts.get.get(info.lastInsertRowid), user.id);
}

export function listerEvents(userId = null) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' '); // UTC, comparable lexicalement
  const all = stmts.list.all().map((e) => decorer(e, userId));
  const futurs = all.filter((e) => e.date_event >= now).sort((a, b) => (a.date_event < b.date_event ? -1 : 1));
  const passes = all.filter((e) => e.date_event < now).sort((a, b) => (a.date_event > b.date_event ? -1 : 1));
  return [...futurs, ...passes];
}

export function getEvent(id, userId = null) {
  return decorer(stmts.get.get(id), userId);
}

export function createurDe(id) {
  const e = stmts.get.get(id);
  return e ? e.createur_id : undefined; // undefined = inexistant
}

export function majEvent(id, data) {
  const e = stmts.get.get(id);
  if (!e) return null;
  const titre = data.titre === undefined ? e.titre : ligne(data.titre, 150);
  if (!titre) return null;
  stmts.update.run({
    id,
    titre,
    lieu: data.lieu === undefined ? e.lieu : ligne(data.lieu, 200),
    description: data.description === undefined ? e.description : bloc(data.description),
    date_event: data.date_event === undefined ? e.date_event : ligne(data.date_event, 30),
  });
  return getEvent(id);
}

export function supprimerEvent(id) {
  return stmts.delete.run(id).changes > 0;
}

export function inscrire(id, user) {
  if (!stmts.get.get(id)) return null;
  stmts.inscrire.run(id, user.id, ligne(user.nom, 120));
  return getEvent(id, user.id);
}

export function desinscrire(id, user) {
  if (!stmts.get.get(id)) return null;
  stmts.desinscrire.run(id, user.id);
  return getEvent(id, user.id);
}
