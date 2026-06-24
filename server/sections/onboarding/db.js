/**
 * Section ONBOARDING — couche d'accès aux données.
 *
 * Possède SES tables (collaborateurs / demandes / taches) sur la connexion
 * partagée du portail (`core/db.js`). Le schéma et les requêtes vivent ici,
 * isolés des autres sections.
 */

import db from '../../core/db.js';
import {
  DEMANDES,
  TACHES,
  PARTIES,
  PARTIE_ACCES,
  RESPONSABLE_ACCES,
  tachesPourDemande,
  offsetPour,
} from './template.js';

// --- Schéma (idempotent) --------------------------------------------------
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

// --- Migration : colonnes de SIGNATURE (attribution du dernier intervenant) ---
// Idempotent et non destructif : ajoute la colonne seulement si absente. Les
// fiches existantes héritent de '' (affiché « — ») jusqu'à une prochaine action.
function ajouterColonne(table, colonne, decl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === colonne)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${colonne} ${decl}`);
  }
}
ajouterColonne('taches', 'fait_par', `TEXT NOT NULL DEFAULT ''`);
ajouterColonne('taches', 'fait_le', `TEXT NOT NULL DEFAULT ''`);
ajouterColonne('taches', 'commentaire_par', `TEXT NOT NULL DEFAULT ''`);
ajouterColonne('taches', 'commentaire_le', `TEXT NOT NULL DEFAULT ''`);
ajouterColonne('demandes', 'demande_par', `TEXT NOT NULL DEFAULT ''`);
ajouterColonne('demandes', 'demande_le', `TEXT NOT NULL DEFAULT ''`);
// Lien explicite tâche → demande d'origine (NULL pour les tâches d'onboarding
// classiques ; renseigné pour les tâches générées par une demande d'accès).
ajouterColonne('taches', 'demande_id', `INTEGER`);
ajouterColonne('collaborateurs', 'cree_par', `TEXT NOT NULL DEFAULT ''`);
ajouterColonne('collaborateurs', 'identite_par', `TEXT NOT NULL DEFAULT ''`);
ajouterColonne('collaborateurs', 'identite_le', `TEXT NOT NULL DEFAULT ''`);

// Acteur normalisé (badge « Prénom N. »), plafonné. '' si non identifié.
const acteurNet = (a) => (a ?? '').toString().trim().slice(0, 120);

// --- Requêtes préparées ---------------------------------------------------
const stmts = {
  insertCollab: db.prepare(`
    INSERT INTO collaborateurs (nom, prenom, service, date_entree, date_sortie, type_contrat, intitule_poste, cree_par)
    VALUES (@nom, @prenom, @service, @date_entree, @date_sortie, @type_contrat, @intitule_poste, @cree_par)
  `),
  insertDemande: db.prepare(`
    INSERT INTO demandes (collaborateur_id, libelle, ordre) VALUES (?, ?, ?)
  `),
  insertTache: db.prepare(`
    INSERT INTO taches (collaborateur_id, partie, libelle, details, responsable, type_profil, ordre)
    VALUES (@collaborateur_id, @partie, @libelle, @details, @responsable, @type_profil, @ordre)
  `),
  // Tâche d'accès : portée par une demande (demande_id) et rangée dans la partie « acces ».
  insertTacheAcces: db.prepare(`
    INSERT INTO taches (collaborateur_id, demande_id, partie, libelle, details, responsable, type_profil, ordre)
    VALUES (@collaborateur_id, @demande_id, @partie, @libelle, @details, @responsable, @type_profil, @ordre)
  `),
  // Tâches d'une demande donnée (pour idempotence + comptage avant suppression).
  tachesDeDemande: db.prepare(`SELECT * FROM taches WHERE demande_id = ? ORDER BY ordre`),
  compteTachesFaitesDeDemande: db.prepare(
    `SELECT COALESCE(SUM(fait), 0) AS faites, COUNT(*) AS total FROM taches WHERE demande_id = ?`,
  ),
  deleteTachesDeDemande: db.prepare(`DELETE FROM taches WHERE demande_id = ?`),
  // Plus grand `ordre` existant pour une fiche (pour ranger les tâches d'accès à la suite).
  maxOrdreTache: db.prepare(
    `SELECT COALESCE(MAX(ordre), -1) AS maxOrdre FROM taches WHERE collaborateur_id = ?`,
  ),
  getCollab: db.prepare(`SELECT * FROM collaborateurs WHERE id = ?`),
  // Dashboard : liste + progression agrégée en UNE requête (fix N+1 — évite un
  // COUNT séparé par fiche). LEFT JOIN pour garder les fiches sans tâche.
  listCollabsProgression: db.prepare(`
    SELECT c.*, COUNT(t.id) AS total, COALESCE(SUM(t.fait), 0) AS faites
    FROM collaborateurs c
    LEFT JOIN taches t ON t.collaborateur_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `),
  getDemandes: db.prepare(`SELECT * FROM demandes WHERE collaborateur_id = ? ORDER BY ordre`),
  getTaches: db.prepare(`SELECT * FROM taches WHERE collaborateur_id = ? ORDER BY ordre`),
  deleteCollab: db.prepare(`DELETE FROM collaborateurs WHERE id = ?`),
  touchCollab: db.prepare(`UPDATE collaborateurs SET updated_at = datetime('now') WHERE id = ?`),
  // Lecture d'une tâche par id (statement réutilisé — plus de db.prepare() recréé à chaque appel).
  getTache: db.prepare(`SELECT * FROM taches WHERE id = ?`),
  // Maj identité : deux statements PRÉPARÉS fixes (avec / sans signature) au lieu
  // d'un SQL reconstruit par interpolation conditionnelle à chaque appel.
  majIdentiteAvecSig: db.prepare(`
    UPDATE collaborateurs
    SET nom=@nom, prenom=@prenom, service=@service, date_entree=@date_entree,
        date_sortie=@date_sortie, type_contrat=@type_contrat, intitule_poste=@intitule_poste,
        updated_at=datetime('now'), identite_par=@identite_par, identite_le=datetime('now')
    WHERE id=@id
  `),
  majIdentiteSansSig: db.prepare(`
    UPDATE collaborateurs
    SET nom=@nom, prenom=@prenom, service=@service, date_entree=@date_entree,
        date_sortie=@date_sortie, type_contrat=@type_contrat, intitule_poste=@intitule_poste,
        updated_at=datetime('now')
    WHERE id=@id
  `),
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

// Longueur max d'un champ d'identité (garde-fou anti-abus / casse de l'UI / grossissement de la base).
const MAX_CHAMP = 120;
// Nom + prénom : plafond court (25) — garde court le rendu des cards / du hero.
const MAX_NOM = 25;
const MAX_PAR_CHAMP = { nom: MAX_NOM, prenom: MAX_NOM };

// Nettoie un champ d'identité : retire retours de ligne + caractères de contrôle (qui cassent
// le rendu des cards), réduit les espaces multiples, plafonne la longueur.
function nettoyerChamp(v, max = MAX_CHAMP) {
  return String(v ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ') // \n \r \t + caractères de contrôle -> espace
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function normaliseIdentite(data = {}) {
  const out = {};
  for (const champ of CHAMPS_IDENTITE) out[champ] = nettoyerChamp(data[champ], MAX_PAR_CHAMP[champ] ?? MAX_CHAMP);
  return out;
}

/** Crée un collaborateur + sa checklist (demandes & tâches issues du modèle). */
export const creerCollaborateur = db.transaction((data, acteur = '') => {
  const identite = normaliseIdentite(data);
  const info = stmts.insertCollab.run({ ...identite, cree_par: acteurNet(acteur) });
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

  // Feature #2 — échéance projetée = date_entree + offset (jours) de la tâche ;
  // « en retard » = échéance dépassée ET tâche non faite. Calcul en UTC (T..Z +
  // setUTCDate) pour rester indépendant du fuseau du serveur.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const echeanceDe = (libelle) => {
    const offset = offsetPour(libelle);
    if (offset === null || !collab.date_entree) return null;
    const base = new Date(`${collab.date_entree}T00:00:00Z`);
    if (Number.isNaN(base.getTime())) return null;
    base.setUTCDate(base.getUTCDate() + offset);
    return base.toISOString().slice(0, 10);
  };
  const tachesRows = stmts.getTaches.all(id).map((t) => {
    const fait = !!t.fait;
    const echeance = echeanceDe(t.libelle);
    return { ...t, fait, echeance, en_retard: !!echeance && !fait && echeance < aujourdhui };
  });

  const enPartie = (cle, modele) => {
    const taches = tachesRows.filter((t) => t.partie === cle);
    const faites = taches.filter((t) => t.fait).length;
    return {
      ...modele,
      taches,
      total: taches.length,
      faites,
      complete: taches.length > 0 && faites === taches.length,
    };
  };

  const parties = PARTIES.map((p) => enPartie(p.cle, p));

  // Section « Mise en place des accès » : ajoutée en fin de page, seulement si
  // au moins une tâche d'accès existe (= au moins une demande active avec checklist).
  const partieAcces = enPartie(PARTIE_ACCES.cle, PARTIE_ACCES);
  if (partieAcces.total > 0) parties.push(partieAcces);

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
  return stmts.listCollabsProgression.all().map(({ total, faites, ...c }) => ({
    ...c,
    progression: {
      total,
      faites,
      pourcentage: total ? Math.round((faites / total) * 100) : 0,
    },
  }));
}

export function majIdentite(id, data, acteur = '') {
  const collab = stmts.getCollab.get(id);
  if (!collab) return null;
  const identite = normaliseIdentite({ ...collab, ...data });
  const a = acteurNet(acteur);
  // Signature posée seulement si l'opérateur est identifié (sinon on ne l'écrase pas).
  if (a) {
    stmts.majIdentiteAvecSig.run({ ...identite, id, identite_par: a });
  } else {
    stmts.majIdentiteSansSig.run({ ...identite, id });
  }
  return getFiche(id);
}

export function majTache(id, { fait, commentaire }, acteur = '') {
  const tache = stmts.getTache.get(id);
  if (!tache) return null;
  const a = acteurNet(acteur);

  // Coche et commentaire = deux actions distinctes → deux signatures séparées.
  const set = [];
  const params = { id, a };
  if (fait !== undefined) {
    set.push('fait = @fait');
    params.fait = fait ? 1 : 0;
    if (a) set.push("fait_par = @a", "fait_le = datetime('now')");
  }
  if (commentaire !== undefined) {
    set.push('commentaire = @commentaire');
    // String(... ?? '') : tolère null/number/bool sans lever (commentaire.toString() plantait sur null).
    params.commentaire = String(commentaire ?? '').slice(0, 2000);
    if (a) set.push("commentaire_par = @a", "commentaire_le = datetime('now')");
  }
  if (set.length) {
    db.prepare(`UPDATE taches SET ${set.join(', ')} WHERE id = @id`).run(params);
    stmts.touchCollab.run(tache.collaborateur_id);
  }
  const row = stmts.getTache.get(id);
  return { ...row, fait: !!row.fait };
}

/** Crée le mini-checklist d'une demande (idempotent : ne fait rien si déjà présent). */
function creerTachesAcces(demande) {
  const existantes = stmts.tachesDeDemande.all(demande.id);
  if (existantes.length > 0) return; // idempotent : pas de double création
  let ordre = stmts.maxOrdreTache.get(demande.collaborateur_id).maxOrdre + 1;
  for (const t of tachesPourDemande(demande.libelle)) {
    stmts.insertTacheAcces.run({
      collaborateur_id: demande.collaborateur_id,
      demande_id: demande.id,
      partie: PARTIE_ACCES.cle,
      libelle: t.libelle,
      details: t.details || '',
      responsable: t.responsable || RESPONSABLE_ACCES,
      type_profil: t.type_profil || '',
      ordre: ordre++,
    });
  }
}

/**
 * Bascule une demande d'accès. À l'activation, crée son mini-checklist dans la
 * section « accès ». À la désactivation, retire ses tâches.
 *
 * Garde-fou (modèle B) : si des tâches de la demande sont déjà cochées, la
 * suppression n'a lieu QUE si `confirmer === true`. Sinon on renvoie
 * `{ confirmation: { faites, total } }` SANS rien modifier, pour que le front
 * demande confirmation à l'opérateur.
 */
// fix-ok: feature badge/signature + cascade tâches — cause connue (cadrage RUN), fix ciblé
export function majDemande(id, { demande, confirmer }, acteur = '') {
  const d = db.prepare(`SELECT * FROM demandes WHERE id = ?`).get(id);
  if (!d) return null;
  const val = demande ? 1 : 0;
  const a = acteurNet(acteur);

  // Désactivation avec travail déjà fait et sans confirmation → on s'arrête net.
  if (!val) {
    const { faites, total } = stmts.compteTachesFaitesDeDemande.get(id);
    if (faites > 0 && !confirmer) {
      return { ...d, demande: !!d.demande, confirmation: { faites, total } };
    }
  }

  const appliquer = db.transaction(() => {
    if (a) {
      db.prepare(
        `UPDATE demandes SET demande=?, demande_par=?, demande_le=datetime('now') WHERE id=?`,
      ).run(val, a, id);
    } else {
      db.prepare(`UPDATE demandes SET demande = ? WHERE id = ?`).run(val, id);
    }
    if (val) creerTachesAcces(d);
    else stmts.deleteTachesDeDemande.run(id);
    stmts.touchCollab.run(d.collaborateur_id);
  });
  appliquer();

  const row = db.prepare(`SELECT * FROM demandes WHERE id = ?`).get(id);
  // On renvoie la fiche entière : la cascade a modifié la section « accès »,
  // le front la ré-affiche intégralement à partir de cet état frais.
  return { ...row, demande: !!row.demande, fiche: getFiche(d.collaborateur_id) };
}

export function supprimerCollaborateur(id) {
  return stmts.deleteCollab.run(id).changes > 0;
}
