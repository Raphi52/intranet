/**
 * Auth CORE du portail — vraie authentification (remplace l'identité déclarative).
 *
 * - Comptes = registre UNIQUE `users` (nom, email=identifiant, mot de passe haché,
 *   service, rôle admin/membre, actif). Fusion avec l'ancien registre ticketing.
 * - Sessions SERVEUR : jeton opaque aléatoire (cookie HttpOnly) + table `sessions`
 *   (révocable, expirable). Pas de JWT, pas de dépendance.
 * - Mot de passe : `crypto.scrypt` natif + sel par utilisateur, comparaison à temps
 *   constant. Jamais de stockage en clair.
 * - Amorçage : un 1er admin créé au démarrage depuis ADMIN_EMAIL/ADMIN_PASSWORD (idempotent).
 */
import crypto from 'node:crypto';
import db from './db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 h
const COOKIE = 'sid';

// --- Schéma (idempotent) ---------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nom         TEXT NOT NULL DEFAULT '',
    email       TEXT NOT NULL UNIQUE,
    pass_hash   TEXT NOT NULL DEFAULT '',
    pass_salt   TEXT NOT NULL DEFAULT '',
    service     TEXT NOT NULL DEFAULT '',
    role        TEXT NOT NULL DEFAULT 'membre',
    actif       INTEGER NOT NULL DEFAULT 1,
    must_change INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

// --- Hachage mot de passe (scrypt natif) -----------------------------------
export function hacher(motDePasse) {
  const sel = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(motDePasse), sel, 64).toString('hex');
  return { hash, sel };
}
export function verifierMotDePasse(motDePasse, hash, sel) {
  if (!hash || !sel) return false;
  const candidat = crypto.scryptSync(String(motDePasse), sel, 64);
  const attendu = Buffer.from(hash, 'hex');
  return candidat.length === attendu.length && crypto.timingSafeEqual(candidat, attendu);
}

// Hash FACTICE constant : permet de brûler le même temps de calcul (scrypt) même quand le
// compte n'existe pas / est inactif -> pas de fuite de timing distinguant les e-mails valides.
const FAUX = hacher('compte-inexistant');
/** Vérifie un login à temps quasi constant (scrypt toujours exécuté). */
export function verifierLoginConstant(motDePasse, u) {
  const okHash = verifierMotDePasse(motDePasse, u?.pass_hash || FAUX.hash, u?.pass_salt || FAUX.sel);
  return !!u && !!u.actif && okHash;
}

// --- Requêtes préparées ----------------------------------------------------
const stmts = {
  userParEmail: db.prepare(`SELECT * FROM users WHERE lower(email) = lower(?)`),
  userParId: db.prepare(`SELECT * FROM users WHERE id = ?`),
  insertUser: db.prepare(`
    INSERT INTO users (nom, email, pass_hash, pass_salt, service, role, actif, must_change)
    VALUES (@nom, @email, @pass_hash, @pass_salt, @service, @role, @actif, @must_change)
  `),
  insertSession: db.prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`),
  getSession: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE id = ?`),
  deleteSessionsUser: db.prepare(`DELETE FROM sessions WHERE user_id = ?`),
  purgeExpirees: db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`),
};

// --- Sessions --------------------------------------------------------------
export function creerSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const expire = new Date(Date.now() + SESSION_TTL_MS).toISOString().slice(0, 19).replace('T', ' ');
  stmts.insertSession.run(id, userId, expire);
  return id;
}
export function detruireSession(id) {
  if (id) stmts.deleteSession.run(id);
}
/** Résout une session valide → l'utilisateur, ou null (purge les expirées au passage). */
export function utilisateurDeSession(sid) {
  if (!sid) return null;
  const s = stmts.getSession.get(sid);
  if (!s) return null;
  if (s.expires_at < new Date().toISOString().slice(0, 19).replace('T', ' ')) {
    stmts.deleteSession.run(sid);
    return null;
  }
  const u = stmts.userParId.get(s.user_id);
  if (!u || !u.actif) return null;
  return u;
}

// --- Comptes (CRUD admin) --------------------------------------------------
export function creerUtilisateur({ nom, email, motDePasse, service = '', role = 'membre', must_change = 1 }) {
  const { hash, sel } = motDePasse ? hacher(motDePasse) : { hash: '', sel: '' };
  const info = stmts.insertUser.run({
    nom: String(nom ?? '').trim().slice(0, 120),
    email: String(email ?? '').trim().toLowerCase().slice(0, 200),
    pass_hash: hash,
    pass_salt: sel,
    service: String(service ?? '').slice(0, 60),
    role: role === 'admin' ? 'admin' : 'membre',
    actif: 1,
    must_change: must_change ? 1 : 0,
  });
  return stmts.userParId.get(info.lastInsertRowid);
}
export function utilisateurParEmail(email) {
  return stmts.userParEmail.get(String(email ?? ''));
}
export function utilisateurParId(id) {
  return stmts.userParId.get(id);
}
export function listerUtilisateurs() {
  return db.prepare(`SELECT * FROM users ORDER BY actif DESC, nom`).all().map(vueUtilisateur);
}
/** Nombre d'admins ACTIFS hors `saufId` — garde anti-lockout (ne pas supprimer le dernier admin). */
export function autresAdminsActifs(saufId) {
  return db.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND actif = 1 AND id != ?`).get(saufId).c;
}
export function majUtilisateur(id, { nom, service, role, actif }) {
  const u = stmts.userParId.get(id);
  if (!u) return null;
  db.prepare(`UPDATE users SET nom=@nom, service=@service, role=@role, actif=@actif WHERE id=@id`).run({
    id,
    nom: nom === undefined ? u.nom : String(nom).trim().slice(0, 120),
    service: service === undefined ? u.service : String(service).slice(0, 60),
    role: role === undefined ? u.role : role === 'admin' ? 'admin' : 'membre',
    actif: actif === undefined ? u.actif : actif ? 1 : 0,
  });
  if (actif === 0 || actif === false) stmts.deleteSessionsUser.run(id); // désactivation -> révoque les sessions
  return vueUtilisateur(stmts.userParId.get(id));
}
export function definirMotDePasse(id, motDePasse) {
  if (!stmts.userParId.get(id)) return false;
  const { hash, sel } = hacher(motDePasse);
  db.prepare(`UPDATE users SET pass_hash=?, pass_salt=?, must_change=1 WHERE id=?`).run(hash, sel, id);
  stmts.deleteSessionsUser.run(id); // reset -> révoque les sessions existantes
  return true;
}
/** Projection SANS secret (ni hash ni sel) pour les réponses API. */
export function vueUtilisateur(u) {
  if (!u) return null;
  return { id: u.id, nom: u.nom, email: u.email, service: u.service, role: u.role, actif: !!u.actif, must_change: !!u.must_change };
}

/** Badge « Prénom N. » d'un utilisateur (pour signer les actions, comme l'ancien X-Operateur). */
export function badgeUtilisateur(u) {
  if (!u) return '';
  const parts = String(u.nom || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return u.email || '';
  const dernier = parts.length > 1 ? parts[parts.length - 1] : '';
  return dernier ? `${parts[0]} ${dernier[0].toUpperCase()}.` : parts[0];
}

// --- Amorçage admin (idempotent) -------------------------------------------
export function amorcerAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@amitel.fr').trim().toLowerCase();
  if (stmts.userParEmail.get(email)) return; // déjà présent (idempotent)
  let mdp = process.env.ADMIN_PASSWORD;
  if (!mdp) {
    // JAMAIS de mot de passe par défaut connu en dur : on en génère un ALÉATOIRE, journalisé une fois.
    mdp = crypto.randomBytes(9).toString('base64url');
    console.warn(`\n  ⚠️  ADMIN_PASSWORD non défini — compte « ${email} » créé avec un mot de passe ALÉATOIRE :\n      ${mdp}\n      Changez-le à la 1re connexion ; définissez ADMIN_PASSWORD pour maîtriser cette valeur.\n`);
  }
  creerUtilisateur({ nom: 'Administrateur', email, motDePasse: mdp, service: 'Direction', role: 'admin', must_change: 1 });
}
// Amorçage NON exécuté ici : index.js l'appelle APRÈS le montage des sections, donc APRÈS la
// migration tk_people->users — sinon l'admin (id 1) entrerait en collision avec une personne migrée id 1.
stmts.purgeExpirees.run();
setInterval(() => { try { stmts.purgeExpirees.run(); } catch { /* */ } }, 3600 * 1000).unref(); // purge horaire

// --- Helpers cookie (sans dépendance) --------------------------------------
export function lireCookie(req, nom = COOKIE) {
  const brut = req.headers.cookie || '';
  for (const part of brut.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === nom) return decodeURIComponent(v.join('='));
  }
  return '';
}
export function poserCookieSession(res, sid) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie', `${COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}
export function effacerCookieSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// --- Middlewares -----------------------------------------------------------
/** Peuple req.user (ou null) + req.operateur (badge dérivé, pour signer) depuis la session. */
export function middlewareSession(req, _res, next) {
  const u = utilisateurDeSession(lireCookie(req));
  req.user = u || null;
  req.operateur = u ? badgeUtilisateur(u) : '';
  next();
}
/** Garde : refuse 401 toute route /api non authentifiée (sauf exemptions). */
export function exigerAuth(req, res, next) {
  if (req.user) return next();
  res.status(401).json({ erreur: 'Authentification requise' });
}
