/**
 * API notifications (préfixe /api/notifications, derrière la garde d'auth globale).
 * Toujours scopé à `req.user` (session vérifiée) — un utilisateur ne voit/altère QUE ses notifs.
 */
import { Router } from 'express';
import { listerPourUser, compterNonLus, marquerLue, marquerToutLu } from './notifications.js';

const router = Router();

// Liste + compteur de non-lus de l'utilisateur courant.
router.get('/', (req, res) => {
  const userId = req.user.id;
  res.json({ items: listerPourUser(userId), nonLus: compterNonLus(userId) });
});

// Marquer lue : { id } pour une notif précise, sinon TOUTES. Renvoie le nouveau compteur.
router.post('/lu', (req, res) => {
  const userId = req.user.id;
  const id = req.body?.id;
  if (Number.isInteger(id)) marquerLue(userId, id);
  else marquerToutLu(userId);
  res.json({ nonLus: compterNonLus(userId) });
});

export default router;
