/**
 * Registre des sections du portail (côté serveur).
 *
 * AJOUTER UNE SECTION = créer son dossier `server/sections/<id>/` (exposant
 * { id, label, icon, description, basePath, register(app) }) puis l'importer +
 * l'ajouter à ce tableau. Aucune autre modification ailleurs n'est nécessaire.
 * `register(app)` est le point d'extension où brancher, le moment venu, un
 * middleware d'auth propre à la section.
 */

import onboarding from './onboarding/index.js';
import docs from './docs/index.js';
import ticketing from './ticketing/index.js';

export const sections = [onboarding, docs, ticketing];

/** Monte toutes les sections sur l'app Express. */
export function enregistrerSections(app) {
  for (const section of sections) {
    section.register(app);
  }
}
