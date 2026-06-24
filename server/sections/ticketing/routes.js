/**
 * Section TICKETING — routeur Express (monté sous /api/ticketing, derrière l'auth).
 *
 * Identité VÉRIFIÉE (session) : `req.user` (compte) pilote la visibilité/appartenance
 * RÉELLE des projets privés (par id), et `req.operateur` (badge dérivé de la session)
 * signe les actions. Le registre des personnes = les comptes `users` (gérés par l'admin).
 */

import { Router } from 'express';

import {
  listerPersonnes,
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
  statutValide,
  ticketProjet,
  personneExiste,
} from './db.js';
import { STATUTS_DEFAUT, PRIORITES, TYPES, ROLES } from './template.js';

const router = Router();

const couleurValide = (c) => !c || /^#[0-9A-Fa-f]{6}$/.test(c);

// Gardes de visibilité (ACCÈS UNITAIRE, lecture ET mutation) par id utilisateur vérifié :
// un projet/ticket privé n'est touchable que par un membre. 404 sinon (ne révèle pas l'existence).
const projetVisibleOuStop = (id, req, res) => {
  if (projetVisiblePour(id, req.user.id)) return true;
  res.status(404).json({ erreur: 'Projet introuvable' });
  return false;
};
const ticketVisibleOuStop = (id, req, res) => {
  const pid = ticketProjet(id);
  if (pid !== null && projetVisiblePour(pid, req.user.id)) return true;
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

// --- Personnes assignables (= comptes users actifs ; gestion via admin auth) ---
router.get('/personnes', (_req, res) => res.json(listerPersonnes()));

// --- Projets ---------------------------------------------------------------
router.get('/projets', (req, res) => res.json(listerProjets(req.user.id)));
router.post('/projets', (req, res) => {
  const body = req.body || {};
  if (!body.nom?.trim()) return res.status(400).json({ erreur: 'Le nom du projet est requis.' });
  if (!body.cle?.trim()) return res.status(400).json({ erreur: 'La clé du projet est requise.' });
  if (!couleurValide(body.couleur)) return res.status(400).json({ erreur: 'Couleur invalide (format #RRGGBB attendu).' });
  const id = creerProjet(body, req.operateur, req.user.id);
  res.status(201).json(getProjet(id));
});
router.get('/projets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!projetVisiblePour(id, req.user.id)) return res.status(404).json({ erreur: 'Projet introuvable' });
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
  const role = req.body?.role;
  if (role && !ROLES.includes(role)) return res.status(400).json({ erreur: 'Rôle invalide.' });
  const membres = ajouterMembre(id, personId, role);
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
  res.json(listerTickets(f, req.user.id));
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
    const ticketId = creerTicket(id, { ...body, assignee_id }, req.operateur, req.user.id);
    if (!ticketId) return res.status(404).json({ erreur: 'Projet introuvable' });
    res.status(201).json(getTicket(ticketId));
  } catch (e) {
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
  if (!projetVisiblePour(t.project_id, req.user.id)) return res.status(404).json({ erreur: 'Ticket introuvable' });
  res.json(t);
});
router.patch('/tickets/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (!ticketVisibleOuStop(id, req, res)) return;
  const body = req.body || {};
  if (body.priorite && !PRIORITES.includes(body.priorite)) return res.status(400).json({ erreur: 'Priorité invalide.' });
  if (body.type && !TYPES.includes(body.type)) return res.status(400).json({ erreur: 'Type invalide.' });
  const courant = getTicket(id);
  if (!courant) return res.status(404).json({ erreur: 'Ticket introuvable' });

  // Édition des CHAMPS + de l'ASSIGNATION : réservée au créateur du ticket (ou à un admin).
  // Le déplacement de colonne (statut) garde sa propre règle plus bas (« je prends un ticket libre »).
  const CHAMPS_PROTEGES = ['titre', 'description', 'priorite', 'type', 'echeance', 'assignee_id'];
  if (CHAMPS_PROTEGES.some((c) => c in body)) {
    const estCreateur =
      (Number.isInteger(courant.created_par_id) && courant.created_par_id === req.user.id) ||
      // Tickets antérieurs à la colonne created_par_id : repli sur le badge d'auteur.
      (courant.created_par_id == null && !!courant.created_par && courant.created_par === req.operateur);
    if (!estCreateur && req.user.role !== 'admin') {
      return res.status(403).json({ erreur: 'Seul le créateur du ticket peut modifier ses champs et son assignation.' });
    }
  }

  const data = { ...body };
  if ('assignee_id' in body) {
    data.assignee_id = intOuNull(body.assignee_id);
    if (data.assignee_id && !personneExiste(data.assignee_id)) return res.status(400).json({ erreur: 'Personne assignée inconnue.' });
  }
  if (body.statut !== undefined) {
    if (!statutValide(courant.project_id, body.statut)) return res.status(400).json({ erreur: 'Statut invalide pour ce projet.' });
    if (body.statut !== courant.statut) {
      // Déplacement : on ne déplace QUE son propre ticket ou un ticket libre (qu'on s'attribue). Admin = exempt.
      const assigneId = courant.assignee_id ?? null;
      if (assigneId && assigneId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ erreur: 'Ce ticket est assigné a quelqu\'un d\'autre — réassignez-le avant de le déplacer.' });
      }
      // « Je le prends » : déplacer un ticket NON assigné me l'assigne (sauf si l'appel fixe déjà un assigné).
      if (!assigneId && !('assignee_id' in body)) data.assignee_id = req.user.id;
    }
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
// On ne lit/modifie QUE ses propres notifications (id = l'utilisateur connecté).
router.get('/personnes/:id/notifications', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (req.user.id !== id) return res.status(403).json({ erreur: 'Accès refusé' });
  res.json(listerNotifications(id));
});
router.patch('/notifications/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const owner = notifProprietaire(id);
  if (owner === null) return res.status(404).json({ erreur: 'Notification introuvable' });
  if (req.user.id !== owner) return res.status(403).json({ erreur: 'Accès refusé' });
  return marquerNotifLue(id) ? res.json({ ok: true }) : res.status(404).json({ erreur: 'Notification introuvable' });
});
router.get('/stats', (req, res) => res.json(statistiques(req.user.id)));

export default router;
