/**
 * Notifications in-app (cloche du portail).
 *
 * Registre unifié des 3 déclencheurs : nouvelle publication, nouvel événement,
 * ticket assigné. On RÉUTILISE la table `tk_notifications` (créée par la couche
 * ticketing : person_id→users(id) ON DELETE CASCADE, ticket_id, type, message, lu,
 * created_at) plutôt que d'en dupliquer une — les notifs d'assignation de ticket y
 * sont déjà émises, la cloche les affiche donc « gratuitement ».
 *
 * Prépares PARESSEUX (db.prepare est mis en cache par better-sqlite3) : on ne dépend
 * pas de l'ordre d'import — la table existe au premier appel (runtime), pas au chargement.
 */
import db from './db.js';

const MAX_MSG = 300;
// Les messages sont construits à partir de champs DÉJÀ nettoyés côté section ; on se
// contente de normaliser les espaces + plafonner (pas de regex de contrôle ici).
const net = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MSG);
const typeNet = (t) => (String(t ?? '').replace(/\s+/g, '').slice(0, 40) || 'info');

/** Notifie UN utilisateur (ignoré si id invalide ou auto-destinataire filtré en amont). */
export function notifier(userId, { type, message }) {
  if (!Number.isInteger(userId) || userId <= 0) return;
  db.prepare(
    'INSERT INTO tk_notifications (person_id, ticket_id, type, message) VALUES (?, NULL, ?, ?)',
  ).run(userId, typeNet(type), net(message));
}

/** Diffuse à TOUS les utilisateurs actifs SAUF `exceptUserId` (l'acteur). Renvoie le nb de destinataires. */
export const notifierTous = db.transaction(({ type, message }, exceptUserId = 0) => {
  const t = typeNet(type);
  const m = net(message);
  const ins = db.prepare('INSERT INTO tk_notifications (person_id, ticket_id, type, message) VALUES (?, NULL, ?, ?)');
  const ids = db.prepare('SELECT id FROM users WHERE actif = 1 AND id != ?').all(Number.isInteger(exceptUserId) ? exceptUserId : 0);
  for (const { id } of ids) ins.run(id, t, m);
  return ids.length;
});

/** Notifs récentes d'un utilisateur (récent d'abord). */
export function listerPourUser(userId, limit = 40) {
  return db
    .prepare(
      'SELECT id, ticket_id, type, message, lu, created_at FROM tk_notifications WHERE person_id = ? ORDER BY id DESC LIMIT ?',
    )
    .all(userId, limit)
    .map((n) => ({ ...n, lu: !!n.lu }));
}

export function compterNonLus(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM tk_notifications WHERE person_id = ? AND lu = 0').get(userId).n;
}

/** Marque UNE notif lue — scopé au propriétaire (anti-fuite : on ne touche pas celles d'autrui). */
export function marquerLue(userId, id) {
  return db.prepare('UPDATE tk_notifications SET lu = 1 WHERE id = ? AND person_id = ?').run(id, userId).changes > 0;
}

/** Marque toutes les notifs de l'utilisateur comme lues. Renvoie le nb mis à jour. */
export function marquerToutLu(userId) {
  return db.prepare('UPDATE tk_notifications SET lu = 1 WHERE person_id = ? AND lu = 0').run(userId).changes;
}
