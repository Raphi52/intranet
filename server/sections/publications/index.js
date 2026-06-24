/**
 * Section PUBLICATIONS — manifeste + montage serveur.
 *
 * Pas d'entrée de navigation : l'UI vit sur la PAGE D'ACCUEIL (public/js/core/home.js),
 * qui consomme cette API. Seul le contrat de montage serveur est exposé ici.
 */

import routes from './routes.js';

export default {
  id: 'publications',
  label: 'Publications',
  icon: '📣',
  description: 'Mur d’annonces interne (page d’accueil).',
  basePath: '/api/publications',
  register(app) {
    app.use(this.basePath, routes);
  },
};
