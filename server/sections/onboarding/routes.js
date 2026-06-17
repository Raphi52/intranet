/**
 * Section ONBOARDING — routeur Express.
 *
 * Monté par le portail sous le préfixe `/api/onboarding` (voir index.js de la
 * section). Toutes les routes métier onboarding vivent ici, isolées.
 */

import { Router } from 'express';

import {
  creerCollaborateur,
  getFiche,
  listerCollaborateurs,
  majIdentite,
  majTache,
  majDemande,
  supprimerCollaborateur,
} from './db.js';
import { PARTIES, SERVICES, TYPES_CONTRAT } from './template.js';

const router = Router();

// 404 propre, cohérente avec le reste de l'API (JSON, pas de HTML).
const introuvable = (res) => res.status(404).json({ erreur: 'Collaborateur introuvable' });

// Parse + valide un :id de route. Renvoie null (et répond 400) si non entier positif.
const idValide = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ erreur: 'Identifiant invalide' });
    return null;
  }
  return id;
};

// --- Métadonnées (services, contrats, structure des parties) --------------
router.get('/meta', (_req, res) => {
  res.json({
    services: SERVICES,
    typesContrat: TYPES_CONTRAT,
    parties: PARTIES.map(({ cle, titre, icone, sousTitre, relais }) => ({
      cle,
      titre,
      icone,
      sousTitre,
      relais,
    })),
  });
});

// --- Collaborateurs --------------------------------------------------------
router.get('/collaborateurs', (_req, res) => {
  res.json(listerCollaborateurs());
});

router.post('/collaborateurs', (req, res) => {
  const { nom, prenom } = req.body || {};
  if (!nom?.trim() && !prenom?.trim()) {
    return res.status(400).json({ erreur: 'Le nom ou le prénom est requis.' });
  }
  const id = creerCollaborateur(req.body || {});
  res.status(201).json(getFiche(id));
});

router.get('/collaborateurs/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const fiche = getFiche(id);
  return fiche ? res.json(fiche) : introuvable(res);
});

router.put('/collaborateurs/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const fiche = majIdentite(id, req.body || {});
  return fiche ? res.json(fiche) : introuvable(res);
});

router.delete('/collaborateurs/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const ok = supprimerCollaborateur(id);
  return ok ? res.status(204).end() : introuvable(res);
});

// --- Tâches & demandes -----------------------------------------------------
router.patch('/taches/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const t = majTache(id, req.body || {});
  return t ? res.json(t) : res.status(404).json({ erreur: 'Tâche introuvable' });
});

router.patch('/demandes/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const d = majDemande(id, req.body || {});
  return d ? res.json(d) : res.status(404).json({ erreur: 'Demande introuvable' });
});

export default router;
