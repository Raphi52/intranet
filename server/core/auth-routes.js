/**
 * Routes d'authentification + administration des comptes (préfixe /api/auth).
 * Exemptées de la garde globale (login doit être joignable sans session).
 */
import { Router } from 'express';
import {
  utilisateurParEmail,
  verifierLoginConstant,
  autresAdminsActifs,
  creerSession,
  detruireSession,
  poserCookieSession,
  effacerCookieSession,
  lireCookie,
  vueUtilisateur,
  creerUtilisateur,
  listerUtilisateurs,
  majUtilisateur,
  definirMotDePasse,
  utilisateurParId,
} from './auth.js';
import { SERVICES } from '../sections/onboarding/template.js';

const ROLES = ['admin', 'membre'];
const router = Router();

const idValide = (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ erreur: 'Identifiant invalide' }); return null; }
  return id;
};
const emailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
function exigerAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ erreur: 'Réservé aux administrateurs' });
}

// --- Throttle anti-brute-force (en mémoire, par IP) ------------------------
const LOGIN_MAX = 10;
const LOGIN_FENETRE = 15 * 60 * 1000; // 15 min
const tentatives = new Map();
const clefIp = (req) => req.ip || req.socket?.remoteAddress || 'x';

// --- Session courante ------------------------------------------------------
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  // Clef par (IP + e-mail) : throttle le password-guessing d'UN compte sans bloquer tout un
  // sous-réseau NAT (les échecs d'un collègue ne verrouillent pas votre compte).
  const clef = clefIp(req) + '|' + String(email || '').toLowerCase();
  const now = Date.now();
  const t = tentatives.get(clef);
  if (t && now < t.reset && t.n >= LOGIN_MAX) {
    return res.status(429).json({ erreur: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }
  const u = utilisateurParEmail(email);
  // Vérif à temps CONSTANT (scrypt toujours exécuté) -> ne révèle pas si l'e-mail existe. Message uniforme.
  if (!verifierLoginConstant(password, u)) {
    const cur = t && now < t.reset ? t : { n: 0, reset: now + LOGIN_FENETRE };
    cur.n++;
    tentatives.set(clef, cur);
    return res.status(401).json({ erreur: 'E-mail ou mot de passe incorrect.' });
  }
  tentatives.delete(clef); // succès -> remet le compteur à zéro
  const sid = creerSession(u.id);
  poserCookieSession(res, sid);
  res.json(vueUtilisateur(u));
});

router.post('/logout', (req, res) => {
  detruireSession(lireCookie(req));
  effacerCookieSession(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ erreur: 'Non authentifié' });
  res.json(vueUtilisateur(req.user));
});

router.get('/services', (req, res) => {
  if (!req.user) return res.status(401).json({ erreur: 'Non authentifié' });
  res.json({ services: SERVICES, roles: ROLES });
});

// --- Administration des comptes (rôle admin) -------------------------------
router.get('/users', exigerAdmin, (_req, res) => res.json(listerUtilisateurs()));

router.post('/users', exigerAdmin, (req, res) => {
  const { nom, email, motDePasse, password, service, role } = req.body || {};
  const mdp = motDePasse || password;
  if (!nom?.trim()) return res.status(400).json({ erreur: 'Le nom est requis.' });
  if (!emailOk(email)) return res.status(400).json({ erreur: 'E-mail invalide.' });
  if (!mdp || String(mdp).length < 6) return res.status(400).json({ erreur: 'Mot de passe trop court (≥ 6 caractères).' });
  if (service && !SERVICES.includes(service)) return res.status(400).json({ erreur: 'Service invalide.' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ erreur: 'Rôle invalide.' });
  if (utilisateurParEmail(email)) return res.status(409).json({ erreur: 'Cet e-mail est déjà utilisé.' });
  const u = creerUtilisateur({ nom, email, motDePasse: mdp, service, role });
  res.status(201).json(vueUtilisateur(u));
});

router.put('/users/:id', exigerAdmin, (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const body = req.body || {};
  const { service, role } = body;
  if (service && !SERVICES.includes(service)) return res.status(400).json({ erreur: 'Service invalide.' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ erreur: 'Rôle invalide.' });
  // Garde anti-lockout : interdit de rétrograder OU désactiver le DERNIER administrateur actif.
  const cible = utilisateurParId(id);
  if (!cible) return res.status(404).json({ erreur: 'Compte introuvable' });
  // Désactivation = actif présent dans le corps ET falsy (false/0/null/'') — aligné sur majUtilisateur
  // (`actif ? 1 : 0`). Couvre le bypass {actif:null} qui échappait à `=== false || === 0`.
  const desactive = body.actif !== undefined && !body.actif;
  const devientNonAdmin = (role && role !== 'admin') || desactive;
  if (cible.role === 'admin' && cible.actif && devientNonAdmin && autresAdminsActifs(id) === 0) {
    return res.status(409).json({ erreur: 'Impossible : c\'est le dernier administrateur actif.' });
  }
  const u = majUtilisateur(id, body);
  return u ? res.json(u) : res.status(404).json({ erreur: 'Compte introuvable' });
});

router.post('/users/:id/password', exigerAdmin, (req, res) => {
  const id = idValide(req, res);
  if (id === null) return;
  const mdp = req.body?.motDePasse || req.body?.password;
  if (!mdp || String(mdp).length < 6) return res.status(400).json({ erreur: 'Mot de passe trop court (≥ 6 caractères).' });
  if (!utilisateurParId(id)) return res.status(404).json({ erreur: 'Compte introuvable' });
  definirMotDePasse(id, mdp);
  res.json({ ok: true });
});

export default router;
