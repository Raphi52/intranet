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

// Auth CORE importée AVANT les sections : crée les tables users/sessions + amorce l'admin,
// pour que le ticketing puisse référencer users(id) dès sa propre création de tables.
import { middlewareSession, exigerAuth, amorcerAdmin } from './core/auth.js';
import authRoutes from './core/auth-routes.js';
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

// --- AUTH : session vérifiée côté serveur ---------------------------------
// Peuple req.user (compte authentifié, ou null) + req.operateur (badge dérivé, qui
// signe les actions — désormais issu de la session VÉRIFIÉE, plus d'un en-tête falsifiable).
app.use(middlewareSession);

// Routes d'auth (login/logout/me + admin comptes) : EXEMPTES de la garde (login doit
// être joignable sans session). Montées avant la garde globale.
app.use('/api/auth', authRoutes);

// Garde : toute autre route /api exige une session valide → 401 sinon (anti-usurpation).
// Les statiques + le shell SPA restent publics (le front affiche l'écran de login).
app.use('/api', exigerAuth);

// --- Sections du portail (montées dynamiquement, derrière la garde) -------
enregistrerSections(app);

// Amorçage de l'admin APRÈS les sections : la migration tk_people->users (dans la couche
// ticketing) a déjà tourné -> l'admin reçoit un id postérieur aux personnes migrées (zéro collision).
amorcerAdmin();

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
