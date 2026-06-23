/**
 * Section TICKETING — couche d'accès aux données.
 *
 * Possède SES tables sur la connexion partagée du portail (`core/db.js`).
 * Modèle MULTI-PROJETS : tout ticket appartient à un projet ; chaque projet a
 * son workflow (statuts), ses membres, et un drapeau « privé ». L'identité reste
 * déclarative (badge « Prénom N. ») → assignation / appartenance = honor-system.
 */

import db from '../../core/db.js';
import {
  STATUTS_DEFAUT,
  PRIORITE_DEFAUT,
  TYPE_DEFAUT,
  ROLE_DEFAUT,
  SLA_HEURES,
  COULEUR_DEFAUT,
} from './template.js';

// --- Schéma (idempotent) --------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS tk_people (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nom        TEXT NOT NULL DEFAULT '',
    email      TEXT NOT NULL DEFAULT '',
    actif      INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tk_projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cle         TEXT NOT NULL UNIQUE,
    nom         TEXT NOT NULL DEFAULT '',
    couleur     TEXT NOT NULL DEFAULT '${COULEUR_DEFAUT}',
    description TEXT NOT NULL DEFAULT '',
    prive       INTEGER NOT NULL DEFAULT 0,
    archive     INTEGER NOT NULL DEFAULT 0,
    seq         INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    created_par TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS tk_project_members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE,
    person_id  INTEGER NOT NULL REFERENCES tk_people(id) ON DELETE CASCADE,
    role       TEXT NOT NULL DEFAULT '${ROLE_DEFAUT}',
    UNIQUE(project_id, person_id)
  );

  CREATE TABLE IF NOT EXISTS tk_project_statuses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE,
    cle        TEXT NOT NULL,
    label      TEXT NOT NULL,
    ordre      INTEGER NOT NULL DEFAULT 0,
    terminal   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(project_id, cle)
  );

  CREATE TABLE IF NOT EXISTS tk_tickets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id   INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE,
    numero       INTEGER NOT NULL,
    titre        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    type         TEXT NOT NULL DEFAULT '${TYPE_DEFAUT}',
    priorite     TEXT NOT NULL DEFAULT '${PRIORITE_DEFAUT}',
    statut       TEXT NOT NULL DEFAULT 'a_faire',
    assignee_id  INTEGER REFERENCES tk_people(id) ON DELETE SET NULL,
    demandeur    TEXT NOT NULL DEFAULT '',
    echeance     TEXT NOT NULL DEFAULT '',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
    created_par  TEXT NOT NULL DEFAULT '',
    updated_par  TEXT NOT NULL DEFAULT '',
    UNIQUE(project_id, numero)
  );

  CREATE TABLE IF NOT EXISTS tk_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tk_tickets(id) ON DELETE CASCADE,
    corps      TEXT NOT NULL DEFAULT '',
    auteur     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tk_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id  INTEGER NOT NULL REFERENCES tk_tickets(id) ON DELETE CASCADE,
    champ      TEXT NOT NULL,
    ancienne   TEXT NOT NULL DEFAULT '',
    nouvelle   TEXT NOT NULL DEFAULT '',
    auteur     TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tk_attachments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL REFERENCES tk_tickets(id) ON DELETE CASCADE,
    nom         TEXT NOT NULL DEFAULT '',
    stocke      TEXT NOT NULL DEFAULT '',
    taille      INTEGER NOT NULL DEFAULT 0,
    mime        TEXT NOT NULL DEFAULT '',
    auteur      TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tk_notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id  INTEGER NOT NULL REFERENCES tk_people(id) ON DELETE CASCADE,
    ticket_id  INTEGER REFERENCES tk_tickets(id) ON DELETE CASCADE,
    type       TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL DEFAULT '',
    lu         INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tk_tickets_project ON tk_tickets(project_id);
  CREATE INDEX IF NOT EXISTS idx_tk_tickets_assignee ON tk_tickets(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tk_comments_ticket ON tk_comments(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_tk_history_ticket ON tk_history(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_tk_members_project ON tk_project_members(project_id);
  CREATE INDEX IF NOT EXISTS idx_tk_statuses_project ON tk_project_statuses(project_id);
  CREATE INDEX IF NOT EXISTS idx_tk_notifs_person ON tk_notifications(person_id);
`);

// Acteur normalisé (badge « Prénom N. »), plafonné. '' si non identifié.
const acteurNet = (a) => (a ?? '').toString().trim().slice(0, 120);
const txt = (v, max = 2000) => String(v ?? '').slice(0, max);

// Badge « Prénom N. » dérivé d'un NOM COMPLET (miroir de badgeNom côté front).
// L'opérateur déclaratif n'envoie QUE son badge (X-Operateur, « Prénom N. ») ; pour
// le matcher à un membre du registre (qui stocke un nom complet) on dérive le même badge.
function badgeDeNom(nom) {
  const parts = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const dernier = parts.length > 1 ? parts[parts.length - 1] : '';
  return dernier ? `${parts[0]} ${dernier[0].toUpperCase()}.` : parts[0];
}

// ==========================================================================
// PERSONNES (registre — nom + e-mail, socle de l'assignation et des notifs)
// ==========================================================================
const stmts = {
  insertPerson: db.prepare(`INSERT INTO tk_people (nom, email) VALUES (@nom, @email)`),
  getPerson: db.prepare(`SELECT * FROM tk_people WHERE id = ?`),
  listPeople: db.prepare(`SELECT * FROM tk_people ORDER BY actif DESC, nom`),
  updatePerson: db.prepare(
    `UPDATE tk_people SET nom=@nom, email=@email, actif=@actif WHERE id=@id`,
  ),
  deletePerson: db.prepare(`DELETE FROM tk_people WHERE id = ?`),

  insertProject: db.prepare(`
    INSERT INTO tk_projects (cle, nom, couleur, description, prive, created_par)
    VALUES (@cle, @nom, @couleur, @description, @prive, @created_par)
  `),
  getProject: db.prepare(`SELECT * FROM tk_projects WHERE id = ?`),
  getProjectByCle: db.prepare(`SELECT * FROM tk_projects WHERE cle = ?`),
  listProjects: db.prepare(`SELECT * FROM tk_projects ORDER BY archive, nom`),
  updateProject: db.prepare(`
    UPDATE tk_projects SET nom=@nom, couleur=@couleur, description=@description,
      prive=@prive, archive=@archive WHERE id=@id
  `),
  deleteProject: db.prepare(`DELETE FROM tk_projects WHERE id = ?`),
  bumpSeq: db.prepare(`UPDATE tk_projects SET seq = seq + 1 WHERE id = ?`),

  insertStatus: db.prepare(`
    INSERT INTO tk_project_statuses (project_id, cle, label, ordre, terminal)
    VALUES (@project_id, @cle, @label, @ordre, @terminal)
  `),
  statusesOf: db.prepare(`SELECT * FROM tk_project_statuses WHERE project_id = ? ORDER BY ordre`),

  insertMember: db.prepare(`
    INSERT OR IGNORE INTO tk_project_members (project_id, person_id, role)
    VALUES (@project_id, @person_id, @role)
  `),
  membersOf: db.prepare(`
    SELECT m.id, m.role, m.person_id, p.nom, p.email
    FROM tk_project_members m JOIN tk_people p ON p.id = m.person_id
    WHERE m.project_id = ? ORDER BY p.nom
  `),
  deleteMember: db.prepare(`DELETE FROM tk_project_members WHERE project_id = ? AND person_id = ?`),

  insertTicket: db.prepare(`
    INSERT INTO tk_tickets (project_id, numero, titre, description, type, priorite, statut, assignee_id, demandeur, echeance, created_par, updated_par)
    VALUES (@project_id, @numero, @titre, @description, @type, @priorite, @statut, @assignee_id, @demandeur, @echeance, @created_par, @created_par)
  `),
  getTicket: db.prepare(`SELECT * FROM tk_tickets WHERE id = ?`),
  deleteTicket: db.prepare(`DELETE FROM tk_tickets WHERE id = ?`),
  touchTicket: db.prepare(`UPDATE tk_tickets SET updated_at = datetime('now'), updated_par = ? WHERE id = ?`),

  insertComment: db.prepare(`
    INSERT INTO tk_comments (ticket_id, corps, auteur) VALUES (@ticket_id, @corps, @auteur)
  `),
  commentsOf: db.prepare(`SELECT * FROM tk_comments WHERE ticket_id = ? ORDER BY created_at, id`),
  insertHistory: db.prepare(`
    INSERT INTO tk_history (ticket_id, champ, ancienne, nouvelle, auteur)
    VALUES (@ticket_id, @champ, @ancienne, @nouvelle, @auteur)
  `),
  historyOf: db.prepare(`SELECT * FROM tk_history WHERE ticket_id = ? ORDER BY created_at, id`),
  attachmentsOf: db.prepare(`SELECT * FROM tk_attachments WHERE ticket_id = ? ORDER BY created_at, id`),

  insertNotif: db.prepare(`
    INSERT INTO tk_notifications (person_id, ticket_id, type, message)
    VALUES (@person_id, @ticket_id, @type, @message)
  `),
  listNotifs: db.prepare(`SELECT * FROM tk_notifications WHERE person_id = ? ORDER BY created_at DESC, id DESC`),
  markNotifRead: db.prepare(`UPDATE tk_notifications SET lu = 1 WHERE id = ?`),
  getNotifOwner: db.prepare(`SELECT person_id FROM tk_notifications WHERE id = ?`),
};

// --- Personnes -------------------------------------------------------------
export function creerPersonne({ nom, email }) {
  const info = stmts.insertPerson.run({ nom: txt(nom, 120), email: txt(email, 200) });
  return stmts.getPerson.get(info.lastInsertRowid);
}
export function listerPersonnes() {
  return stmts.listPeople.all().map((p) => ({ ...p, actif: !!p.actif }));
}
export function majPersonne(id, { nom, email, actif }) {
  const p = stmts.getPerson.get(id);
  if (!p) return null;
  stmts.updatePerson.run({
    id,
    nom: nom === undefined ? p.nom : txt(nom, 120),
    email: email === undefined ? p.email : txt(email, 200),
    actif: actif === undefined ? p.actif : actif ? 1 : 0,
  });
  const row = stmts.getPerson.get(id);
  return { ...row, actif: !!row.actif };
}
export function supprimerPersonne(id) {
  return stmts.deletePerson.run(id).changes > 0;
}

// ==========================================================================
// PROJETS (+ statuts seedés, membres, privé honor-system)
// ==========================================================================

/** Crée un projet, seede son workflow par défaut, l'ajoute à ses membres si demandé. */
export const creerProjet = db.transaction((data, acteur = '') => {
  const info = stmts.insertProject.run({
    cle: txt(data.cle, 12).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'PROJ',
    nom: txt(data.nom, 120),
    couleur: txt(data.couleur, 16) || COULEUR_DEFAUT,
    description: txt(data.description, 2000),
    prive: data.prive ? 1 : 0,
    created_par: acteurNet(acteur),
  });
  const id = info.lastInsertRowid;
  STATUTS_DEFAUT.forEach((s) =>
    stmts.insertStatus.run({ project_id: id, cle: s.cle, label: s.label, ordre: s.ordre, terminal: s.terminal }),
  );
  // Membres initiaux (ids du registre), si fournis.
  for (const pid of data.membres || []) {
    if (Number.isInteger(pid)) stmts.insertMember.run({ project_id: id, person_id: pid, role: 'admin' });
  }
  return id;
});

function projetComplet(p) {
  if (!p) return null;
  const membres = stmts.membersOf.all(p.id);
  return {
    ...p,
    prive: !!p.prive,
    archive: !!p.archive,
    statuts: stmts.statusesOf.all(p.id).map((s) => ({ ...s, terminal: !!s.terminal })),
    membres,
  };
}

export function getProjet(id) {
  return projetComplet(stmts.getProject.get(id));
}

/**
 * Liste les projets visibles par `operateur` (badge déclaratif). Un projet PRIVÉ
 * n'est listé que si l'opérateur correspond (insensible casse) au nom d'un membre
 * — barrière douce honor-system (pas un vrai contrôle d'accès, cf. cadrage).
 */
export function listerProjets(operateur = '') {
  const op = acteurNet(operateur).toLowerCase();
  return stmts.listProjects
    .all()
    .map((p) => {
      const membres = stmts.membersOf.all(p.id);
      return { ...p, prive: !!p.prive, archive: !!p.archive, membres };
    })
    .filter((p) => !p.prive || (op && p.membres.some((m) => badgeDeNom(m.nom).toLowerCase() === op)));
}

export function majProjet(id, data) {
  const p = stmts.getProject.get(id);
  if (!p) return null;
  stmts.updateProject.run({
    id,
    nom: data.nom === undefined ? p.nom : txt(data.nom, 120),
    couleur: data.couleur === undefined ? p.couleur : txt(data.couleur, 16),
    description: data.description === undefined ? p.description : txt(data.description, 2000),
    prive: data.prive === undefined ? p.prive : data.prive ? 1 : 0,
    archive: data.archive === undefined ? p.archive : data.archive ? 1 : 0,
  });
  return getProjet(id);
}

export function supprimerProjet(id) {
  return stmts.deleteProject.run(id).changes > 0;
}

export function ajouterMembre(projectId, personId, role = ROLE_DEFAUT) {
  if (!stmts.getProject.get(projectId) || !stmts.getPerson.get(personId)) return null;
  stmts.insertMember.run({ project_id: projectId, person_id: personId, role: txt(role, 20) || ROLE_DEFAUT });
  return stmts.membersOf.all(projectId);
}
export function retirerMembre(projectId, personId) {
  stmts.deleteMember.run(projectId, personId);
  return stmts.membersOf.all(projectId);
}

// ==========================================================================
// TICKETS
// ==========================================================================

const CHAMPS_SUIVIS = ['titre', 'description', 'type', 'priorite', 'statut', 'assignee_id', 'echeance'];

// Échéance projetée depuis le SLA de la priorité (si non fournie explicitement).
function echeanceParSla(priorite) {
  const h = SLA_HEURES[priorite];
  if (!h) return '';
  const d = new Date(Date.now() + h * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Crée un ticket dans un projet : numéro = séquence par projet (transactionnel). */
export const creerTicket = db.transaction((projectId, data, acteur = '') => {
  const projet = stmts.getProject.get(projectId);
  if (!projet) return null;
  stmts.bumpSeq.run(projectId);
  const numero = stmts.getProject.get(projectId).seq;
  const statuts = stmts.statusesOf.all(projectId);
  const statutDefaut = statuts[0]?.cle || 'a_faire';
  const priorite = data.priorite || PRIORITE_DEFAUT;
  const info = stmts.insertTicket.run({
    project_id: projectId,
    numero,
    titre: txt(data.titre, 300),
    description: txt(data.description, 20000),
    type: data.type || TYPE_DEFAUT,
    priorite,
    statut: data.statut || statutDefaut,
    assignee_id: Number.isInteger(data.assignee_id) ? data.assignee_id : null,
    demandeur: acteurNet(data.demandeur || acteur),
    echeance: data.echeance ? txt(data.echeance, 30) : echeanceParSla(priorite),
    created_par: acteurNet(acteur),
  });
  const ticketId = info.lastInsertRowid;
  // Assignation dès la création -> notif in-app au nouvel assigné (l'historique part de cet état).
  if (Number.isInteger(data.assignee_id)) {
    stmts.insertNotif.run({ person_id: data.assignee_id, ticket_id: ticketId, type: 'assignation', message: `Ticket assigné : ${txt(data.titre, 300)}` });
  }
  return ticketId;
});

const aujourdhui = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/** Décore un ticket brut : clé d'affichage, assigné, en_retard. */
function decorer(t, projet) {
  if (!t) return null;
  const p = projet || stmts.getProject.get(t.project_id);
  const assignee = t.assignee_id ? stmts.getPerson.get(t.assignee_id) : null;
  const statut = stmts.statusesOf.all(t.project_id).find((s) => s.cle === t.statut) || null;
  const terminal = statut ? !!statut.terminal : false;
  return {
    ...t,
    cle: p ? `${p.cle}-${t.numero}` : String(t.numero),
    projet_cle: p?.cle || '',
    projet_nom: p?.nom || '',
    assignee: assignee ? { id: assignee.id, nom: assignee.nom, email: assignee.email } : null,
    statut_terminal: terminal,
    en_retard: !!t.echeance && !terminal && t.echeance < aujourdhui(),
  };
}

export function getTicket(id) {
  const t = stmts.getTicket.get(id);
  if (!t) return null;
  return {
    ...decorer(t),
    commentaires: stmts.commentsOf.all(id),
    historique: stmts.historyOf.all(id),
    pieces_jointes: stmts.attachmentsOf.all(id),
  };
}

/**
 * Liste filtrée. `filtres` : { project_id, statut, priorite, type, assignee_id, q, retard }.
 * `operateur` applique le filtre de confidentialité (projets privés).
 */
export function listerTickets(filtres = {}, operateur = '') {
  const projetsVisibles = new Set(listerProjets(operateur).map((p) => p.id));
  const where = [];
  const params = {};
  if (Number.isInteger(filtres.project_id)) { where.push('project_id = @project_id'); params.project_id = filtres.project_id; }
  if (filtres.statut) { where.push('statut = @statut'); params.statut = filtres.statut; }
  if (filtres.priorite) { where.push('priorite = @priorite'); params.priorite = filtres.priorite; }
  if (filtres.type) { where.push('type = @type'); params.type = filtres.type; }
  if (Number.isInteger(filtres.assignee_id)) { where.push('assignee_id = @assignee_id'); params.assignee_id = filtres.assignee_id; }
  if (filtres.q) { where.push('(titre LIKE @q OR description LIKE @q)'); params.q = `%${txt(filtres.q, 100)}%`; }
  const sql = `SELECT * FROM tk_tickets ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC, id DESC`;
  let rows = db.prepare(sql).all(params).filter((t) => projetsVisibles.has(t.project_id));
  rows = rows.map((t) => decorer(t));
  if (filtres.retard) rows = rows.filter((t) => t.en_retard);
  return rows;
}

/** Met à jour un ticket champ par champ + journalise l'historique + notifie l'assigné. */
export const majTicket = db.transaction((id, data, acteur = '') => {
  const t = stmts.getTicket.get(id);
  if (!t) return null;
  const a = acteurNet(acteur);
  const set = [];
  const params = { id };
  for (const champ of CHAMPS_SUIVIS) {
    if (data[champ] === undefined) continue;
    let val = data[champ];
    if (champ === 'assignee_id') val = Number.isInteger(val) ? val : null;
    else val = txt(val, champ === 'description' ? 20000 : 300);
    const ancienne = t[champ];
    if (String(ancienne ?? '') === String(val ?? '')) continue;
    set.push(`${champ} = @${champ}`);
    params[champ] = val;
    stmts.insertHistory.run({
      ticket_id: id,
      champ,
      ancienne: String(ancienne ?? ''),
      nouvelle: String(val ?? ''),
      auteur: a,
    });
    // Notif in-app : (ré)assignation -> notifie le nouvel assigné du registre.
    if (champ === 'assignee_id' && Number.isInteger(val)) {
      stmts.insertNotif.run({ person_id: val, ticket_id: id, type: 'assignation', message: `Ticket assigné : ${t.titre}` });
    }
  }
  if (set.length) {
    db.prepare(`UPDATE tk_tickets SET ${set.join(', ')}, updated_at = datetime('now'), updated_par = @upar WHERE id = @id`)
      .run({ ...params, upar: a });
  }
  return getTicket(id);
});

export function commenter(ticketId, corps, acteur = '') {
  const t = stmts.getTicket.get(ticketId);
  if (!t) return null;
  stmts.insertComment.run({ ticket_id: ticketId, corps: txt(corps, 20000), auteur: acteurNet(acteur) });
  stmts.touchTicket.run(acteurNet(acteur), ticketId);
  // Notif in-app à l'assigné (collaboration : l'assigné est prévenu d'un nouveau commentaire).
  if (t.assignee_id) {
    stmts.insertNotif.run({ person_id: t.assignee_id, ticket_id: ticketId, type: 'commentaire', message: `Nouveau commentaire : ${t.titre}` });
  }
  return getTicket(ticketId);
}

export function supprimerTicket(id) {
  return stmts.deleteTicket.run(id).changes > 0;
}

// --- Notifications (in-app) ------------------------------------------------
export function listerNotifications(personId) {
  return stmts.listNotifs.all(personId).map((n) => ({ ...n, lu: !!n.lu }));
}
export function marquerNotifLue(id) {
  return stmts.markNotifRead.run(id).changes > 0;
}
/** Propriétaire (person_id) d'une notification, ou null. */
export function notifProprietaire(id) {
  const n = stmts.getNotifOwner.get(id);
  return n ? n.person_id : null;
}

// --- Visibilité / identité (honor-system, ACCÈS UNITAIRE) ------------------
// Le filtre de liste (listerProjets) ne suffit pas : l'accès direct par id doit AUSSI vérifier.
/** Un projet est-il visible par l'opérateur ? (public, ou opérateur = membre via badge). */
export function projetVisiblePour(projectId, operateur) {
  const p = stmts.getProject.get(projectId);
  if (!p) return false;
  if (!p.prive) return true;
  const op = acteurNet(operateur).toLowerCase();
  return !!op && stmts.membersOf.all(projectId).some((m) => badgeDeNom(m.nom).toLowerCase() === op);
}
/** Personne du registre correspondant au badge déclaratif de l'opérateur, ou null. */
export function personneDuBadge(operateur) {
  const op = acteurNet(operateur).toLowerCase();
  if (!op) return null;
  return stmts.listPeople.all().find((p) => badgeDeNom(p.nom).toLowerCase() === op) || null;
}
/** Le statut `cle` fait-il partie du workflow du projet ? */
export function statutValide(projectId, cle) {
  return stmts.statusesOf.all(projectId).some((s) => s.cle === cle);
}
/** project_id d'un ticket (lecture légère), ou null. */
export function ticketProjet(id) {
  const t = stmts.getTicket.get(id);
  return t ? t.project_id : null;
}
/** La personne du registre existe-t-elle ? */
export function personneExiste(id) {
  return Number.isInteger(id) && !!stmts.getPerson.get(id);
}

// --- Tableau de bord (agrégats) -------------------------------------------
export function statistiques(operateur = '') {
  const projetsVisibles = new Set(listerProjets(operateur).map((p) => p.id));
  const tickets = db.prepare(`SELECT * FROM tk_tickets`).all().filter((t) => projetsVisibles.has(t.project_id)).map((t) => decorer(t));
  const parStatut = {};
  let enRetard = 0;
  for (const t of tickets) {
    parStatut[t.statut] = (parStatut[t.statut] || 0) + 1;
    if (t.en_retard) enRetard++;
  }
  return { total: tickets.length, parStatut, enRetard };
}
