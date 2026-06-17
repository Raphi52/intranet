/**
 * Portail Amitel — serveur (shell).
 *
 * Ne connaît AUCUNE section en propre : il met en place le socle commun
 * (sécurité, JSON, statiques, SPA) puis monte dynamiquement toutes les
 * sections déclarées dans `server/sections/index.js`.
 */

import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { enregistrerSections } from './sections/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
// Interface d'écoute. Par défaut toutes interfaces (usage LAN interne) ; mettre
// HOST=127.0.0.1 pour restreindre à la machine locale.
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

// --- Point d'ancrage AUTH (inactif) ---------------------------------------
// L'auth n'est pas encore branchée (réseau interne de confiance). Quand une
// section sensible l'exigera, brancher ici un middleware qui peuple req.user,
// puis protéger les sections concernées dans leur register(). Laisser passer
// pour l'instant.
app.use((req, _res, next) => {
  req.user = null; // aucun utilisateur authentifié pour le moment
  next();
});

// --- Sections du portail (montées dynamiquement) --------------------------
enregistrerSections(app);

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
  console.log(`\n  ✅ Portail Amitel démarré sur http://localhost:${PORT}\n`);
});
