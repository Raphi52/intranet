/**
 * Section TICKETING — manifeste + montage serveur.
 *
 * Contrat exposé au portail : { id, label, icon, description, basePath, register(app) }.
 */

import routes from './routes.js';

export default {
  id: 'ticketing',
  label: 'Tickets',
  icon: '🎫',
  description: 'Suivi des demandes, incidents et tâches par projet (multi-services).',
  basePath: '/api/ticketing',
  register(app) {
    app.use(this.basePath, routes);
  },
};
