/**
 * Registre des sections du portail (côté front).
 *
 * AJOUTER UNE SECTION = créer son dossier `js/sections/<id>/` exposant un
 * manifeste par défaut { id, label, icon, description, render(conteneur, sousRoute) },
 * puis l'importer + l'ajouter à ce tableau. Rien d'autre à modifier.
 */

import onboarding from './onboarding/manifest.js';
import docs from './docs/manifest.js';
import ticketing from './ticketing/manifest.js';
import evenements from './evenements/manifest.js';
import admin from './admin/manifest.js';

export const sections = [onboarding, docs, ticketing, evenements, admin];
