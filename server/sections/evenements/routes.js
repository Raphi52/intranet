/**
 * Section ÉVÉNEMENTS — routeur Express (préfixe /api/evenements, derrière l'auth).
 *
 * Tout connecté crée + s'inscrit/se désinscrit. Édition/suppression : créateur OU admin.
 */

import { Router } from 'express';

import {
  creerEvent,
  listerEvents,
  getEvent,
  createurDe,
  majEvent,
  supprimerEvent,
  inscrire,
  desinscrire,
} from './db.js';

const router = Router();

const idValide = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ erreur: 'Identifiant invalide' });
    return null;
  }
  return id;
};
const peutModifier = (createurId, user) => createurId === user.id || user.role === 'admin';

router.get('/', (req, res) => res.json(listerEvents(req.user.id)));

router.post('/', (req, res) => {
  const body = req.body || {};
  if (!body.titre?.trim()) return res.status(400).json({ erreur: 'Le titre est requis.' });
  if (!body.date_event?.trim()) return res.status(400).json({ erreur: 'La date est requise.' });
  const e = creerEvent(body, req.user);
  return e ? res.status(201).json(e) : res.status(400).json({ erreur: 'Données invalides.' });
});

router.put('/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const createurId = createurDe(id);
  if (createurId === undefined) return res.status(404).json({ erreur: 'Événement introuvable' });
  if (!peutModifier(createurId, req.user)) return res.status(403).json({ erreur: 'Réservé au créateur ou à un admin.' });
  const e = majEvent(id, req.body || {});
  return e ? res.json(e) : res.status(400).json({ erreur: 'Données invalides.' });
});

router.delete('/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const createurId = createurDe(id);
  if (createurId === undefined) return res.status(404).json({ erreur: 'Événement introuvable' });
  if (!peutModifier(createurId, req.user)) return res.status(403).json({ erreur: 'Réservé au créateur ou à un admin.' });
  return supprimerEvent(id) ? res.status(204).end() : res.status(404).json({ erreur: 'Événement introuvable' });
});

// Inscription / désinscription du compte connecté (compteur de participants).
router.post('/:id/participation', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const e = inscrire(id, req.user);
  return e ? res.json(e) : res.status(404).json({ erreur: 'Événement introuvable' });
});
router.delete('/:id/participation', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const e = desinscrire(id, req.user);
  return e ? res.json(e) : res.status(404).json({ erreur: 'Événement introuvable' });
});

export default router;
