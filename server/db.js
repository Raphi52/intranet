/**
 * Couche d'accès à la base SQLite (better-sqlite3).
 *
 * - Crée le schéma au démarrage s'il n'existe pas.
 * - Expose des fonctions de haut niveau utilisées par les routes Express.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { DEMANDES, TACHES, PARTIES } from './template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'onboarding.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schéma ---------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS collaborateurs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    nom            TEXT NOT NULL DEFAULT '',
    prenom         TEXT NOT NULL DEFAULT '',
    service        TEXT NOT NULL DEFAULT '',
    date_entree    TEXT NOT NULL DEFAULT '',
    date_sortie    TEXT NOT NULL DEFAULT '',
    type_contrat   TEXT NOT NULL DEFAULT '',
    intitule_poste TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS demandes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    collaborateur_id INTEGER NOT NULL REFERENCES collaborateurs(id) ON DELETE CASCADE,
    libelle          TEXT NOT NULL,
    demande          INTEGER NOT NULL DEFAULT 0,
    ordre            INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS taches (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    collaborateur_id INTEGER NOT NULL REFERENCES collaborateurs(id) ON DELETE CASCADE,
    partie           TEXT NOT NULL,
    libelle          TEXT NOT NULL,
    details          TEXT NOT NULL DEFAULT '',
    responsable      TEXT NOT NULL DEFAULT '',
    type_profil      TEXT NOT NULL DEFAULT '',
    fait             INTEGER NOT NULL DEFAULT 0,
    commentaire      TEXT NOT NULL DEFAULT '',
    ordre            INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_taches_collab ON taches(collaborateur_id);
  CREATE INDEX IF NOT EXISTS idx_demandes_collab ON demandes(collaborateur_id);
`);

// --- Requêtes préparées ---------------------------------------------------
const stmts = {
  insertCollab: db.prepare(`
    INSERT INTO collaborateurs (nom, prenom, service, date_entree, date_sortie, type_contrat, intitule_poste)
    VALUES (@nom, @prenom, @service, @date_entree, @date_sortie, @type_contrat, @intitule_poste)
  `),
  insertDemande: db.prepare(`
    INSERT INTO demandes (collaborateur_id, libelle, ordre) VALUES (?, ?, ?)
  `),
  insertTache: db.prepare(`
    INSERT INTO taches (collaborateur_id, partie, libelle, details, responsable, type_profil, ordre)
    VALUES (@collaborateur_id, @partie, @libelle, @details, @responsable, @type_profil, @ordre)
  `),
  getCollab: db.prepare(`SELECT * FROM collaborateurs WHERE id = ?`),
  listCollabs: db.prepare(`SELECT * FROM collaborateurs ORDER BY created_at DESC`),
  getDemandes: db.prepare(`SELECT * FROM demandes WHERE collaborateur_id = ? ORDER BY ordre`),
  getTaches: db.prepare(`SELECT * FROM taches WHERE collaborateur_id = ? ORDER BY ordre`),
  deleteCollab: db.prepare(`DELETE FROM collaborateurs WHERE id = ?`),
  touchCollab: db.prepare(`UPDATE collaborateurs SET updated_at = datetime('now') WHERE id = ?`),
};

// --- Helpers ---------------------------------------------------------------

const CHAMPS_IDENTITE = [
  'nom',
  'prenom',
  'service',
  'date_entree',
  'date_sortie',
  'type_contrat',
  'intitule_poste',
];

// Longueur max d'un champ d'identité (garde-fou anti-abus / grossissement de la base).
const MAX_CHAMP = 200;

function normaliseIdentite(data = {}) {
  const out = {};
  for (const champ of CHAMPS_IDENTITE) {
    out[champ] = (data[champ] ?? '').toString().trim().slice(0, MAX_CHAMP);
  }
  return out;
}

/** Crée un collaborateur + sa checklist (demandes & tâches issues du modèle). */
export const creerCollaborateur = db.transaction((data) => {
  const identite = normaliseIdentite(data);
  const info = stmts.insertCollab.run(identite);
  const id = info.lastInsertRowid;

  DEMANDES.forEach((libelle, i) => stmts.insertDemande.run(id, libelle, i));

  let ordre = 0;
  for (const { cle } of PARTIES) {
    for (const tache of TACHES[cle] || []) {
      stmts.insertTache.run({
        collaborateur_id: id,
        partie: cle,
        libelle: tache.libelle,
        details: tache.details || '',
        responsable: tache.responsable || '',
        type_profil: tache.type_profil || '',
        ordre: ordre++,
      });
    }
  }
  return id;
});

/** Renvoie la fiche complète (identité + demandes + tâches groupées par partie). */
export function getFiche(id) {
  const collab = stmts.getCollab.get(id);
  if (!collab) return null;

  const demandes = stmts.getDemandes.all(id).map((d) => ({ ...d, demande: !!d.demande }));
  const tachesRows = stmts.getTaches.all(id).map((t) => ({ ...t, fait: !!t.fait }));

  const parties = PARTIES.map((p) => {
    const taches = tachesRows.filter((t) => t.partie === p.cle);
    const faites = taches.filter((t) => t.fait).length;
    return {
      ...p,
      taches,
      total: taches.length,
      faites,
      complete: taches.length > 0 && faites === taches.length,
    };
  });

  const totalTaches = tachesRows.length;
  const totalFaites = tachesRows.filter((t) => t.fait).length;

  return {
    ...collab,
    demandes,
    parties,
    progression: {
      total: totalTaches,
      faites: totalFaites,
      pourcentage: totalTaches ? Math.round((totalFaites / totalTaches) * 100) : 0,
    },
  };
}

/** Liste des collaborateurs avec un résumé de progression (pour le tableau de bord). */
export function listerCollaborateurs() {
  const collabs = stmts.listCollabs.all();
  const compte = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(fait), 0) AS faites
    FROM taches WHERE collaborateur_id = ?
  `);
  return collabs.map((c) => {
    const { total, faites } = compte.get(c.id);
    return {
      ...c,
      progression: {
        total,
        faites,
        pourcentage: total ? Math.round((faites / total) * 100) : 0,
      },
    };
  });
}

export function majIdentite(id, data) {
  const collab = stmts.getCollab.get(id);
  if (!collab) return null;
  const identite = normaliseIdentite({ ...collab, ...data });
  db.prepare(`
    UPDATE collaborateurs
    SET nom=@nom, prenom=@prenom, service=@service, date_entree=@date_entree,
        date_sortie=@date_sortie, type_contrat=@type_contrat, intitule_poste=@intitule_poste,
        updated_at=datetime('now')
    WHERE id=@id
  `).run({ ...identite, id });
  return getFiche(id);
}

export function majTache(id, { fait, commentaire }) {
  const tache = db.prepare(`SELECT * FROM taches WHERE id = ?`).get(id);
  if (!tache) return null;
  const nouveauFait = fait === undefined ? tache.fait : fait ? 1 : 0;
  // String(... ?? '') : tolère null/number/bool sans lever (commentaire.toString() plantait sur null).
  const nouveauComm =
    commentaire === undefined ? tache.commentaire : String(commentaire ?? '').slice(0, 2000);
  db.prepare(`UPDATE taches SET fait = ?, commentaire = ? WHERE id = ?`).run(
    nouveauFait,
    nouveauComm,
    id,
  );
  stmts.touchCollab.run(tache.collaborateur_id);
  return { ...tache, fait: !!nouveauFait, commentaire: nouveauComm };
}

export function majDemande(id, { demande }) {
  const d = db.prepare(`SELECT * FROM demandes WHERE id = ?`).get(id);
  if (!d) return null;
  const val = demande ? 1 : 0;
  db.prepare(`UPDATE demandes SET demande = ? WHERE id = ?`).run(val, id);
  stmts.touchCollab.run(d.collaborateur_id);
  return { ...d, demande: !!val };
}

export function supprimerCollaborateur(id) {
  return stmts.deleteCollab.run(id).changes > 0;
}

export default db;
