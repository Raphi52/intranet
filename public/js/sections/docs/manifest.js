/**
 * Section DÉMO « Docs internes » — manifeste front.
 *
 * Squelette : prouve qu'on ajoute une section complète (menu + route + vue +
 * API) sans toucher au code de l'onboarding. À étoffer plus tard.
 */

import { requete } from '../../core/http.js';
import { echappe } from '../../core/ui.js';

export default {
  id: 'docs',
  label: 'Docs internes',
  icon: '📚',
  description: 'Procédures, outils et base de connaissances (à venir).',
  async render(conteneur) {
    const liens = await requete('/api/docs/liens');

    const entete = `
      <div class="tdb__entete">
        <div>
          <h1 class="tdb__titre">Docs internes</h1>
          <p class="tdb__sous">Section de démonstration — preuve d'extensibilité du portail.</p>
        </div>
      </div>`;

    const cartes = liens
      .map(
        (l) => `
        <a class="carte-section" href="${echappe(l.url)}">
          <div class="carte-section__icone" aria-hidden="true">📄</div>
          <div>
            <h3 class="carte-section__titre">${echappe(l.titre)}</h3>
            <p class="carte-section__desc">${echappe(l.description)}</p>
          </div>
        </a>`,
      )
      .join('');

    conteneur.innerHTML = entete + `<div class="grille-sections">${cartes}</div>`;
  },
};
