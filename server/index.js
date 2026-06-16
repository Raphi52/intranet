/**
 * Serveur Express : sert l'application web (dossier /public) et expose l'API REST
 * de gestion des fiches d'onboarding (stockées en SQLite).
 */

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// Petit utilitaire pour renvoyer une 404 propre.
const introuvable = (res) => res.status(404).json({ erreur: 'Collaborateur introuvable' });

// --- Métadonnées (services, contrats, structure des parties) --------------
app.get('/api/meta', (_req, res) => {
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
app.get('/api/collaborateurs', (_req, res) => {
  res.json(listerCollaborateurs());
});

app.post('/api/collaborateurs', (req, res) => {
  const { nom, prenom } = req.body || {};
  if (!nom?.trim() && !prenom?.trim()) {
    return res.status(400).json({ erreur: 'Le nom ou le prénom est requis.' });
  }
  const id = creerCollaborateur(req.body || {});
  res.status(201).json(getFiche(id));
});

app.get('/api/collaborateurs/:id', (req, res) => {
  const fiche = getFiche(Number(req.params.id));
  return fiche ? res.json(fiche) : introuvable(res);
});

app.put('/api/collaborateurs/:id', (req, res) => {
  const fiche = majIdentite(Number(req.params.id), req.body || {});
  return fiche ? res.json(fiche) : introuvable(res);
});

app.delete('/api/collaborateurs/:id', (req, res) => {
  const ok = supprimerCollaborateur(Number(req.params.id));
  return ok ? res.status(204).end() : introuvable(res);
});

// --- Tâches & demandes -----------------------------------------------------
app.patch('/api/taches/:id', (req, res) => {
  const t = majTache(Number(req.params.id), req.body || {});
  return t ? res.json(t) : res.status(404).json({ erreur: 'Tâche introuvable' });
});

app.patch('/api/demandes/:id', (req, res) => {
  const d = majDemande(Number(req.params.id), req.body || {});
  return d ? res.json(d) : res.status(404).json({ erreur: 'Demande introuvable' });
});

// --- Fichiers statiques (SPA) ---------------------------------------------
app.use(express.static(join(__dirname, '..', 'public')));

// Toute autre route non-API renvoie l'app (routing côté client par hash).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  ✅ Onboarding Amitel démarré sur http://localhost:${PORT}\n`);
});
