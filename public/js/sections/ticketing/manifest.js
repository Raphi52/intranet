/**
 * Section TICKETING — manifeste front.
 *
 * Sous-routes (après `#/ticketing/`) :
 *   ''         → accueil : projets + stats
 *   'p/<id>'   → board Kanban d'un projet
 *   't/<id>'   → détail d'un ticket
 *   'personnes'→ registre des personnes
 */

import { charger } from './store.js';
import { renduAccueil, renduBoard } from './board.js';
import { renduDetail } from './detail.js';
import { renduPersonnes } from './admin.js';

export default {
  id: 'ticketing',
  label: 'Tickets',
  icon: '🎫',
  description: 'Suivi des demandes, incidents et tâches par projet (multi-services).',
  async render(conteneur, sousRoute) {
    await charger();
    const mP = sousRoute.match(/^p\/([1-9]\d*)/);
    const mT = sousRoute.match(/^t\/([1-9]\d*)/);
    if (mP) return renduBoard(conteneur, Number(mP[1]));
    if (mT) return renduDetail(conteneur, Number(mT[1]));
    if (/^personnes/.test(sousRoute)) return renduPersonnes(conteneur);
    return renduAccueil(conteneur);
  },
};
