/** Accueil du portail : menu des sections disponibles (cartes cliquables). */

import { echappe } from './ui.js';

export async function renduAccueil(app, sections) {
  const entete = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">Portail <span>amitel</span></h1>
        <p class="tdb__sous">Choisissez une section pour commencer.</p>
      </div>
    </div>`;

  const cartes = sections
    .map(
      (s) => `
      <a class="carte-section" href="#/${s.id}/">
        <div class="carte-section__icone" aria-hidden="true">${s.icon}</div>
        <div>
          <h3 class="carte-section__titre">${echappe(s.label)}</h3>
          <p class="carte-section__desc">${echappe(s.description || '')}</p>
        </div>
      </a>`,
    )
    .join('');

  app.innerHTML = entete + `<div class="grille-sections">${cartes}</div>`;
}
