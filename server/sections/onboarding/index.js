/**
 * Section ONBOARDING — manifeste + montage serveur.
 *
 * C'est le contrat qu'une section expose au portail :
 *   { id, label, icon, basePath, register(app) }
 * Le registre (`server/sections/index.js`) ne connaît QUE ce contrat.
 */

import routes from './routes.js';

export default {
  id: 'onboarding',
  label: 'Onboarding',
  icon: '🚀',
  description: 'Accueil et checklist des nouveaux collaborateurs.',
  basePath: '/api/onboarding',
  register(app) {
    // basePath est la source unique du préfixe (pas de chemin en dur dupliqué).
    app.use(this.basePath, routes);
  },
};
