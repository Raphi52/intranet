/**
 * Identité de l'OPÉRATEUR — désormais une VRAIE authentification (session serveur).
 * Remplace l'ancienne identité déclarative (nom en localStorage). Le cookie de
 * session (HttpOnly) est géré par le navigateur ; ce module expose le compte courant
 * + connexion / déconnexion. Plus aucun secret côté client.
 */

let _moi = null; // compte courant en cache (rempli par chargerMoi)

/** Compte courant déjà chargé (synchrone), ou null. */
export function moiCourant() {
  return _moi;
}
export function estAdmin() {
  return _moi?.role === 'admin';
}

/** Récupère le compte courant depuis la session serveur (GET /api/auth/me). */
export async function chargerMoi() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    _moi = r.ok ? await r.json() : null;
  } catch {
    _moi = null;
  }
  return _moi;
}

/** Connexion. Renvoie le compte si OK, sinon lève une Error (message serveur). */
export async function connexion(email, motDePasse) {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password: motDePasse }),
  });
  if (!r.ok) {
    const corps = await r.json().catch(() => null);
    throw new Error(corps?.erreur || `Erreur ${r.status}`);
  }
  _moi = await r.json();
  return _moi;
}

/** Déconnexion (détruit la session serveur + le cookie). */
export async function deconnexion() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
  _moi = null;
}

/** Badge « Prénom N. » du compte courant (affichage), ou '' si déconnecté. */
export function badgeOperateur() {
  if (!_moi?.nom) return _moi?.email || '';
  const parts = String(_moi.nom).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return _moi.email || '';
  const dernier = parts.length > 1 ? parts[parts.length - 1] : '';
  return dernier ? `${parts[0]} ${dernier[0].toUpperCase()}.` : parts[0];
}
