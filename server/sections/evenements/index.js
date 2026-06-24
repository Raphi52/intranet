/**
 * Section ÉVÉNEMENTS — manifeste + montage serveur.
 */

import routes from './routes.js';

export default {
  id: 'evenements',
  label: 'Événements',
  icon: '📅',
  description: 'Créez des événements et inscrivez-vous (compteur de participants).',
  basePath: '/api/evenements',
  register(app) {
    app.use(this.basePath, routes);
  },
};
