/**
 * Section TICKETING — routeur Express.
 *
 * Monté sous `/api/ticketing`. Identité déclarative : `req.operateur` (badge
 * « Prénom N. ») signe les actions et pilote la visibilité des projets privés.
 */

import { Router } from 'express';

import {
  creerPersonne,
  listerPersonnes,
  majPersonne,
  supprimerPersonne,
  creerProjet,
  getProjet,
  listerProjets,
  majProjet,
  supprimerProjet,
  ajouterMembre,
  retirerMembre,
  creerTicket,
  getTicket,
  listerTickets,
  majTicket,
  commenter,
  supprimerTicket,
  listerNotifications,
  marquerNotifLue,
  notifProprietaire,
  statistiques,
  projetVisiblePour,
  personneDuBadge,
  statutValide,
  ticketProjet,
  personneExiste,
} from './db.js';
import { STATUTS_DEFAUT, PRIORITES, TYPES, ROLES } from './template.js';

const router = Router();

// Couleur projet : format hexadécimal strict (#RRGGBB) — bloque l'injection CSS via l'API directe.
const couleurValide = (c) => !c || /^#[0-9A-Fa-f]{6}$/.test(c);

// Gardes de visibilité honor-system pour l'ACCÈS UNITAIRE (lecture ET mutation) : un projet/ticket
// privé n'est touchable que par un membre. 404 (ne révèle pas l'existence). Renvoie false si bloqué.
const projetVisibleOuStop = (id, req, res) => {
  if (projetVisiblePour(id, req.operateur)) return true;
  res.status(404).json({ erreur: 'Projet introuvable' });
  return false;
};
const ticketVisibleOuStop = (id, req, res) => {
  const pid = ticketProjet(id);
  if (pid !== null && projetVisiblePour(pid, req.operateur)) return true;
  res.status(404).json({ erreur: 'Ticket introuvable' });
  return false;
};

const idValide = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ erreur: 'Identifiant invalide' });
    return null;
  }
  return id;
};
const intOuNull = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

// --- Métadonnées (référentiels pour l'UI) ---------------------------------
router.get('/meta', (_req, res) => {
  res.json({ statutsDefaut: STATUTS_DEFAUT, priorites: PRIORITES, types: TYPES, roles: ROLES });
});

// --- Personnes (registre) --------------------------------------------------
router.get('/personnes', (_req, res) => res.json(listerPersonnes()));
router.post('/personnes', (req, res) => {
  const { nom, email } = req.body || {};
  if (!nom?.trim()) return res.status(400).json({ erreur: 'Le nom est requis.' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erreur: 'E-mail invalide.' });
  res.status(201).json(creerPersonne({ nom, email }));
});
router.put('/personnes/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const p = majPersonne(id, req.body || {});
  return p ? res.json(p) : res.status(404).json({ erreur: 'Personne introuvable' });
});
router.delete('/personnes/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  return supprimerPersonne(id) ? res.status(204).end() : res.status(404).json({ erreur: 'Personne introuvable' });
});

// --- Projets ---------------------------------------------------------------
router.get('/projets', (req, res) => res.json(listerProjets(req.operateur)));
router.post('/projets', (req, res) => {
  const body = req.body || {};
  if (!body.nom?.trim()) return res.status(400).json({ erreur: 'Le nom du projet est requis.' });
  if (!body.cle?.trim()) return res.status(400).json({ erreur: 'La clé du projet est requise.' });
  if (!couleurValide(body.couleur)) return res.status(400).json({ erreur: 'Couleur invalide (format #RRGGBB attendu).' });
  const id = creerProjet(body, req.operateur);
  res.status(201).json(getProjet(id));
});
router.get('/projets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  // Accès unitaire : un projet privé n'est lisible que par un membre (404 sinon, ne révèle pas l'existence).
  if (!projetVisiblePour(id, req.operateur)) return res.status(404).json({ erreur: 'Projet introuvable' });
  const p = getProjet(id);
  return p ? res.json(p) : res.status(404).json({ erreur: 'Projet introuvable' });
});
router.put('/projets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!projetVisibleOuStop(id, req, res)) return;
  if (!couleurValide(req.body?.couleur)) return res.status(400).json({ erreur: 'Couleur invalide (format #RRGGBB attendu).' });
  const p = majProjet(id, req.body || {});
  return p ? res.json(p) : res.status(404).json({ erreur: 'Projet introuvable' });
});
router.delete('/projets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!projetVisibleOuStop(id, req, res)) return;
  return supprimerProjet(id) ? res.status(204).end() : res.status(404).json({ erreur: 'Projet introuvable' });
});
router.post('/projets/:id/membres', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!projetVisibleOuStop(id, req, res)) return;
  const personId = intOuNull(req.body?.person_id);
  if (!personId) return res.status(400).json({ erreur: 'person_id requis.' });
  const membres = ajouterMembre(id, personId, req.body?.role);
  return membres ? res.json(membres) : res.status(404).json({ erreur: 'Projet ou personne introuvable' });
});
router.delete('/projets/:id/membres/:personId', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!projetVisibleOuStop(id, req, res)) return;
  const personId = Number(req.params.personId);
  if (!Number.isInteger(personId)) return res.status(400).json({ erreur: 'Identifiant invalide' });
  res.json(retirerMembre(id, personId));
});

// --- Tickets ---------------------------------------------------------------
router.get('/tickets', (req, res) => {
  const f = {
    project_id: intOuNull(req.query.project_id),
    statut: req.query.statut || undefined,
    priorite: req.query.priorite || undefined,
    type: req.query.type || undefined,
    assignee_id: intOuNull(req.query.assignee_id),
    q: req.query.q || undefined,
    retard: req.query.retard === '1' || req.query.retard === 'true',
  };
  res.json(listerTickets(f, req.operateur));
});
router.post('/projets/:id/tickets', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!projetVisibleOuStop(id, req, res)) return;
  const body = req.body || {};
  if (!body.titre?.trim()) return res.status(400).json({ erreur: 'Le titre est requis.' });
  if (body.priorite && !PRIORITES.includes(body.priorite)) return res.status(400).json({ erreur: 'Priorité invalide.' });
  if (body.type && !TYPES.includes(body.type)) return res.status(400).json({ erreur: 'Type invalide.' });
  if (body.statut && !statutValide(id, body.statut)) return res.status(400).json({ erreur: 'Statut invalide pour ce projet.' });
  const assignee_id = intOuNull(body.assignee_id);
  if (assignee_id && !personneExiste(assignee_id)) return res.status(400).json({ erreur: 'Personne assignée inconnue.' });
  try {
    const ticketId = creerTicket(id, { ...body, assignee_id }, req.operateur);
    if (!ticketId) return res.status(404).json({ erreur: 'Projet introuvable' });
    res.status(201).json(getTicket(ticketId));
  } catch (e) {
    // course sur le numéro (UNIQUE project_id,numero) en multi-process → conflit ; toute autre erreur remonte.
    if (String(e?.code || '').startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ erreur: 'Conflit lors de la création du ticket, réessayez.' });
    }
    throw e;
  }
});
router.get('/tickets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const t = getTicket(id);
  if (!t) return res.status(404).json({ erreur: 'Ticket introuvable' });
  // Accès unitaire : ticket d'un projet privé masqué aux non-membres (404).
  if (!projetVisiblePour(t.project_id, req.operateur)) return res.status(404).json({ erreur: 'Ticket introuvable' });
  res.json(t);
});
router.patch('/tickets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!ticketVisibleOuStop(id, req, res)) return;
  const body = req.body || {};
  if (body.priorite && !PRIORITES.includes(body.priorite)) return res.status(400).json({ erreur: 'Priorité invalide.' });
  if (body.type && !TYPES.includes(body.type)) return res.status(400).json({ erreur: 'Type invalide.' });
  const data = { ...body };
  if ('assignee_id' in body) {
    data.assignee_id = intOuNull(body.assignee_id);
    if (data.assignee_id && !personneExiste(data.assignee_id)) return res.status(400).json({ erreur: 'Personne assignée inconnue.' });
  }
  // Statut : doit appartenir au workflow du projet (sinon le ticket sortirait de toute colonne du board).
  if (body.statut !== undefined) {
    const pid = ticketProjet(id);
    if (pid === null) return res.status(404).json({ erreur: 'Ticket introuvable' });
    if (!statutValide(pid, body.statut)) return res.status(400).json({ erreur: 'Statut invalide pour ce projet.' });
  }
  const t = majTicket(id, data, req.operateur);
  return t ? res.json(t) : res.status(404).json({ erreur: 'Ticket introuvable' });
});
router.delete('/tickets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!ticketVisibleOuStop(id, req, res)) return;
  return supprimerTicket(id) ? res.status(204).end() : res.status(404).json({ erreur: 'Ticket introuvable' });
});
router.post('/tickets/:id/commentaires', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!ticketVisibleOuStop(id, req, res)) return;
  if (!req.body?.corps?.trim()) return res.status(400).json({ erreur: 'Le commentaire est vide.' });
  const t = commenter(id, req.body.corps, req.operateur);
  return t ? res.status(201).json(t) : res.status(404).json({ erreur: 'Ticket introuvable' });
});

// --- Notifications & tableau de bord --------------------------------------
router.get('/personnes/:id/notifications', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  // On ne lit QUE ses propres notifications (l'opérateur déclaré doit être la personne :id).
  const moi = personneDuBadge(req.operateur);
  if (!moi || moi.id !== id) return res.status(403).json({ erreur: 'Accès refusé' });
  res.json(listerNotifications(id));
});
router.patch('/notifications/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const owner = notifProprietaire(id);
  if (owner === null) return res.status(404).json({ erreur: 'Notification introuvable' });
  const moi = personneDuBadge(req.operateur);
  if (!moi || moi.id !== owner) return res.status(403).json({ erreur: 'Accès refusé' });
  return marquerNotifLue(id) ? res.json({ ok: true }) : res.status(404).json({ erreur: 'Notification introuvable' });
});
router.get('/stats', (req, res) => res.json(statistiques(req.operateur)));

export default router;
