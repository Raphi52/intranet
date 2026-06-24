/**
 * Section PUBLICATIONS — routeur Express (préfixe /api/publications, derrière l'auth).
 *
 * Tout utilisateur connecté crée. Édition/suppression : auteur OU admin. Épinglage : admin.
 */

import { Router } from 'express';
import { notifierTous } from '../../core/notifications.js';

import {
  creerPublication,
  listerPublications,
  getPublication,
  majPublication,
  epinglerPublication,
  supprimerPublication,
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
// L'auteur (par id) ou un admin peut modifier/supprimer.
const peutModifier = (pub, user) => !!pub && (pub.auteur_id === user.id || user.role === 'admin');

router.get('/', (_req, res) => res.json(listerPublications()));

router.post('/', (req, res) => {
  const { titre, corps } = req.body || {};
  if (!titre?.trim()) return res.status(400).json({ erreur: 'Le titre est requis.' });
  const pub = creerPublication({ titre, corps }, req.user);
  if (pub) notifierTous({ type: 'publication', message: `Nouvelle publication : ${pub.titre}` }, req.user.id);
  return pub ? res.status(201).json(pub) : res.status(400).json({ erreur: 'Titre invalide.' });
});

router.put('/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const pub = getPublication(id);
  if (!pub) return res.status(404).json({ erreur: 'Publication introuvable' });
  if (!peutModifier(pub, req.user)) return res.status(403).json({ erreur: 'Réservé à l’auteur ou à un admin.' });
  const maj = majPublication(id, req.body || {});
  return maj ? res.json(maj) : res.status(400).json({ erreur: 'Titre invalide.' });
});

router.delete('/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const pub = getPublication(id);
  if (!pub) return res.status(404).json({ erreur: 'Publication introuvable' });
  if (!peutModifier(pub, req.user)) return res.status(403).json({ erreur: 'Réservé à l’auteur ou à un admin.' });
  return supprimerPublication(id) ? res.status(204).end() : res.status(404).json({ erreur: 'Publication introuvable' });
});

router.patch('/:id/epingle', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  if (req.user.role !== 'admin') return res.status(403).json({ erreur: 'Épinglage réservé aux administrateurs.' });
  const maj = epinglerPublication(id, !!req.body?.epingle);
  return maj ? res.json(maj) : res.status(404).json({ erreur: 'Publication introuvable' });
});

export default router;
