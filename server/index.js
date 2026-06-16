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
// Interface d'écoute. Par défaut toutes interfaces (usage LAN interne) ; mettre
// HOST=127.0.0.1 pour restreindre à la machine locale. Voir aussi la note d'auth du README.
const HOST = process.env.HOST || undefined;

const app = express();
app.disable('x-powered-by'); // ne pas divulguer la stack serveur

// En-têtes de sécurité de base (défense en profondeur — sans dépendance externe).
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Le payload légitime est minuscule : on plafonne bas pour limiter l'abus.
app.use(express.json({ limit: '32kb' }));

// Petit utilitaire pour renvoyer une 404 propre.
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
  const id = idValide(req, res);
  if (id === null) return;
  const fiche = getFiche(id);
  return fiche ? res.json(fiche) : introuvable(res);
});

app.put('/api/collaborateurs/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const fiche = majIdentite(id, req.body || {});
  return fiche ? res.json(fiche) : introuvable(res);
});

app.delete('/api/collaborateurs/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const ok = supprimerCollaborateur(id);
  return ok ? res.status(204).end() : introuvable(res);
});

// --- Tâches & demandes -----------------------------------------------------
app.patch('/api/taches/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const t = majTache(id, req.body || {});
  return t ? res.json(t) : res.status(404).json({ erreur: 'Tâche introuvable' });
});

app.patch('/api/demandes/:id', (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const d = majDemande(id, req.body || {});
  return d ? res.json(d) : res.status(404).json({ erreur: 'Demande introuvable' });
});

// --- Fichiers statiques (SPA) ---------------------------------------------
app.use(express.static(join(__dirname, '..', 'public')));

// Toute autre route non-API renvoie l'app (routing côté client par hash).
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// Route API inconnue → 404 JSON (cohérent avec le reste de l'API, pas le HTML d'Express).
app.use('/api', (_req, res) => res.status(404).json({ erreur: 'Route inconnue' }));

// Gestionnaire d'erreurs final : journalise côté serveur, ne renvoie JAMAIS la stack au client.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ erreur: 'Erreur serveur' });
});

app.listen(PORT, HOST, () => {
  console.log(`\n  ✅ Onboarding Amitel démarré sur http://localhost:${PORT}\n`);
});
