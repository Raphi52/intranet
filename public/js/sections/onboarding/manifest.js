/**
 * Section ONBOARDING — manifeste front.
 *
 * Sous-routes gérées (après `#/onboarding/`) :
 *   ''        → tableau de bord (liste des collaborateurs)
 *   'c/<id>'  → fiche / checklist d'un collaborateur
 */

import { chargerMeta } from './store.js';
import { renduDashboard } from './dashboard.js';
import { renduChecklist } from './checklist.js';

export default {
  id: 'onboarding',
  label: 'Onboarding',
  icon: '🚀',
  description: 'Accueil et checklist des nouveaux collaborateurs.',
  async render(conteneur, sousRoute) {
    // Les vues lisent les métadonnées de façon synchrone : on les garantit chargées.
    await chargerMeta();
    if (/^c\//.test(sousRoute)) {
      // Sous-route "fiche" : exige un id entier positif (id 0 / non numérique = malformé).
      const m = sousRoute.match(/^c\/([1-9]\d*)/);
      if (m) {
        await renduChecklist(conteneur, Number(m[1]));
      } else {
        conteneur.innerHTML =
          '<p class="vide">Fiche introuvable. <a href="#/onboarding/">Retour au tableau de bord</a></p>';
      }
    } else {
      await renduDashboard(conteneur);
    }
  },
};
