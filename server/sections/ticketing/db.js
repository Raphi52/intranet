/**
 * Section TICKETING — couche d'accès aux données.
 *
 * Modèle MULTI-PROJETS. Depuis l'ajout de l'AUTH, le registre des personnes EST
 * la table `users` (créée par `core/auth.js`) : un membre / un assigné = un compte.
 * La confidentialité des projets privés est désormais RÉELLEMENT appliquée par
 * `id` utilisateur (l'identité est vérifiée côté serveur), plus un honor-system.
 * Les signatures (created_par/auteur/demandeur) restent des chaînes « Prénom N. »
 * issues de la session VÉRIFIÉE (req.operateur dérivé de req.user).
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
// NB : pas de table `tk_people` — les personnes vivent dans `users` (auth core).
// Les FK assignee_id / person_id pointent vers users(id).
db.exec(`
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
    person_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
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
    person_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

// --- Migration (idempotente) : ancien registre tk_people -> users ----------
// Sur une base d'avant l'auth, tk_people existe et les FK pointent dessus. On
// recopie les personnes dans users (ids PRÉSERVÉS) puis on reconstruit les tables
// FK vers users(id) et on supprime tk_people. Fresh DB (smoke) : pas de tk_people -> no-op.
migrerTkPeopleVersUsers();
function migrerTkPeopleVersUsers() {
  const existe = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tk_people'`).get();
  if (!existe) return;
  const people = db.prepare(`SELECT * FROM tk_people`).all();
  const insUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, nom, email, service, role, actif, must_change) VALUES (?,?,?,?,?,?,1)`,
  );
  for (const p of people) {
    const email = p.email && String(p.email).trim() ? String(p.email).trim() : `migre+${p.id}@local`;
    insUser.run(p.id, p.nom || '', email, '', 'membre', p.actif ?? 1);
  }
  // PRAGMA foreign_keys ne peut pas changer DANS une transaction -> on l'encadre.
  db.pragma('foreign_keys = OFF');
  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE tk_project_members_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE,
        person_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'membre',
        UNIQUE(project_id, person_id)
      );
      INSERT INTO tk_project_members_new (id, project_id, person_id, role)
        SELECT id, project_id, person_id, role FROM tk_project_members;
      DROP TABLE tk_project_members;
      ALTER TABLE tk_project_members_new RENAME TO tk_project_members;

      CREATE TABLE tk_tickets_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES tk_projects(id) ON DELETE CASCADE,
        numero INTEGER NOT NULL,
        titre TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT '${TYPE_DEFAUT}', priorite TEXT NOT NULL DEFAULT '${PRIORITE_DEFAUT}',
        statut TEXT NOT NULL DEFAULT 'a_faire',
        assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        demandeur TEXT NOT NULL DEFAULT '', echeance TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_par TEXT NOT NULL DEFAULT '', updated_par TEXT NOT NULL DEFAULT '',
        UNIQUE(project_id, numero)
      );
      INSERT INTO tk_tickets_new (id, project_id, numero, titre, description, type, priorite, statut, assignee_id, demandeur, echeance, created_at, updated_at, created_par, updated_par)
        SELECT id, project_id, numero, titre, description, type, priorite, statut, assignee_id, demandeur, echeance, created_at, updated_at, created_par, updated_par FROM tk_tickets;
      DROP TABLE tk_tickets;
      ALTER TABLE tk_tickets_new RENAME TO tk_tickets;

      CREATE TABLE tk_notifications_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        ticket_id INTEGER REFERENCES tk_tickets(id) ON DELETE CASCADE,
        type TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
        lu INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO tk_notifications_new (id, person_id, ticket_id, type, message, lu, created_at)
        SELECT id, person_id, ticket_id, type, message, lu, created_at FROM tk_notifications;
      DROP TABLE tk_notifications;
      ALTER TABLE tk_notifications_new RENAME TO tk_notifications;

      DROP TABLE tk_people;

      CREATE INDEX IF NOT EXISTS idx_tk_tickets_project ON tk_tickets(project_id);
      CREATE INDEX IF NOT EXISTS idx_tk_tickets_assignee ON tk_tickets(assignee_id);
      CREATE INDEX IF NOT EXISTS idx_tk_members_project ON tk_project_members(project_id);
      CREATE INDEX IF NOT EXISTS idx_tk_notifs_person ON tk_notifications(person_id);
    `);
  });
  rebuild();
  db.pragma('foreign_keys = ON');
}

// Colonne created_par_id (id de l'auteur du ticket) : sous-tend la garde « seul le créateur
// édite ses champs + son assignation ». Ajout idempotent (created_par reste le badge d'affichage).
try {
  db.exec('ALTER TABLE tk_tickets ADD COLUMN created_par_id INTEGER');
} catch {
  /* colonne déjà présente */
}

// Acteur normalisé (badge « Prénom N. » issu de la session VÉRIFIÉE), plafonné.
const acteurNet = (a) => (a ?? '').toString().trim().slice(0, 120);
const txt = (v, max = 2000) => String(v ?? '').slice(0, max);

// ==========================================================================
// PERSONNES = comptes `users` (lecture seule ici ; la gestion vit dans auth/admin)
// ==========================================================================
const stmts = {
  // Personnes : projection sur users (le registre fusionné).
  getPerson: db.prepare(`SELECT id, nom, email, actif FROM users WHERE id = ?`),
  listPeople: db.prepare(`SELECT id, nom, email, actif FROM users WHERE actif = 1 ORDER BY nom`),

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
    FROM tk_project_members m JOIN users p ON p.id = m.person_id
    WHERE m.project_id = ? ORDER BY p.nom
  `),
  deleteMember: db.prepare(`DELETE FROM tk_project_members WHERE project_id = ? AND person_id = ?`),

  insertTicket: db.prepare(`
    INSERT INTO tk_tickets (project_id, numero, titre, description, type, priorite, statut, assignee_id, demandeur, echeance, created_par, updated_par, created_par_id)
    VALUES (@project_id, @numero, @titre, @description, @type, @priorite, @statut, @assignee_id, @demandeur, @echeance, @created_par, @created_par, @created_par_id)
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

// --- Personnes (lecture du registre = users) -------------------------------
export function listerPersonnes() {
  return stmts.listPeople.all().map((p) => ({ ...p, actif: !!p.actif }));
}
/** Le compte existe-t-il (et donc assignable) ? */
export function personneExiste(id) {
  return Number.isInteger(id) && !!stmts.getPerson.get(id);
}

// ==========================================================================
// PROJETS (+ statuts seedés, membres, privé RÉELLEMENT appliqué par id user)
// ==========================================================================

/** Crée un projet, seede son workflow par défaut, ajoute ses membres (ids users) + le créateur. */
export const creerProjet = db.transaction((data, acteur = '', createurId = null) => {
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
  // Le CRÉATEUR est membre (admin) de son projet — sinon il ne pourrait pas accéder à un projet privé qu'il vient de créer.
  const membres = new Set(data.membres || []);
  if (Number.isInteger(createurId)) membres.add(createurId);
  for (const pid of membres) {
    if (Number.isInteger(pid) && stmts.getPerson.get(pid)) {
      // Le créateur est admin du projet ; les autres membres initiaux ont le rôle par défaut.
      stmts.insertMember.run({ project_id: id, person_id: pid, role: pid === createurId ? 'admin' : ROLE_DEFAUT });
    }
  }
  return id;
});

function projetComplet(p) {
  if (!p) return null;
  return {
    ...p,
    prive: !!p.prive,
    archive: !!p.archive,
    statuts: stmts.statusesOf.all(p.id).map((s) => ({ ...s, terminal: !!s.terminal })),
    membres: stmts.membersOf.all(p.id),
  };
}

export function getProjet(id) {
  return projetComplet(stmts.getProject.get(id));
}

/** Ids des membres d'un projet (pour les contrôles de visibilité). */
function membreIds(projectId) {
  return stmts.membersOf.all(projectId).map((m) => m.person_id);
}

/**
 * Liste les projets visibles par l'utilisateur `userId` (session vérifiée).
 * Un projet PRIVÉ n'est visible que si l'utilisateur en est MEMBRE (id réel) —
 * vrai contrôle d'accès (l'identité est vérifiée), plus un honor-system.
 */
export function listerProjets(userId = null) {
  return stmts.listProjects
    .all()
    .map((p) => ({ ...p, prive: !!p.prive, archive: !!p.archive, membres: stmts.membersOf.all(p.id) }))
    .filter((p) => !p.prive || (Number.isInteger(userId) && p.membres.some((m) => m.person_id === userId)));
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

function echeanceParSla(priorite) {
  const h = SLA_HEURES[priorite];
  if (!h) return '';
  const d = new Date(Date.now() + h * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** Crée un ticket dans un projet : numéro = séquence par projet (transactionnel). */
export const creerTicket = db.transaction((projectId, data, acteur = '', creatorId = null) => {
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
    assignee_id: Number.isInteger(data.assignee_id) && data.assignee_id > 0 ? data.assignee_id : null,
    demandeur: acteurNet(data.demandeur || acteur),
    echeance: data.echeance ? txt(data.echeance, 30) : echeanceParSla(priorite),
    created_par: acteurNet(acteur),
    created_par_id: Number.isInteger(creatorId) && creatorId > 0 ? creatorId : null,
  });
  const ticketId = info.lastInsertRowid;
  if (Number.isInteger(data.assignee_id) && data.assignee_id > 0) {
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
 * `userId` applique le filtre de confidentialité (projets privés visibles aux membres).
 */
export function listerTickets(filtres = {}, userId = null) {
  const projetsVisibles = new Set(listerProjets(userId).map((p) => p.id));
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
    if (champ === 'assignee_id') val = Number.isInteger(val) && val > 0 ? val : null;
    else val = txt(val, champ === 'description' ? 20000 : 300);
    const ancienne = t[champ];
    if (String(ancienne ?? '') === String(val ?? '')) continue;
    set.push(`${champ} = @${champ}`);
    params[champ] = val;
    stmts.insertHistory.run({
      ticket_id: id, champ, ancienne: String(ancienne ?? ''), nouvelle: String(val ?? ''), auteur: a,
    });
    if (champ === 'assignee_id' && Number.isInteger(val) && val > 0) {
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
/** Propriétaire (user id) d'une notification, ou null. */
export function notifProprietaire(id) {
  const n = stmts.getNotifOwner.get(id);
  return n ? n.person_id : null;
}

// --- Visibilité (ACCÈS UNITAIRE, par id utilisateur vérifié) ----------------
/** Un projet est-il visible par l'utilisateur ? (public, ou membre par id réel). */
export function projetVisiblePour(projectId, userId) {
  const p = stmts.getProject.get(projectId);
  if (!p) return false;
  if (!p.prive) return true;
  return Number.isInteger(userId) && membreIds(projectId).includes(userId);
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

// --- Tableau de bord (agrégats) -------------------------------------------
export function statistiques(userId = null) {
  const projetsVisibles = new Set(listerProjets(userId).map((p) => p.id));
  const tickets = db.prepare(`SELECT * FROM tk_tickets`).all().filter((t) => projetsVisibles.has(t.project_id)).map((t) => decorer(t));
  const parStatut = {};
  let enRetard = 0;
  for (const t of tickets) {
    parStatut[t.statut] = (parStatut[t.statut] || 0) + 1;
    if (t.en_retard) enRetard++;
  }
  return { total: tickets.length, parStatut, enRetard };
}
