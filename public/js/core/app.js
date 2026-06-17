/**
 * Portail Amitel — shell + routeur (par hash).
 *
 * Le routeur ne connaît AUCUNE section en propre : il lit le registre front
 * (`sections/index.js`), construit la navigation, et dispatche
 *   #/<idSection>/<sous-route>   →   section.render(conteneur, sousRoute)
 * `#/` (racine) affiche l'accueil du portail (menu des sections).
 */

import { sections } from '../sections/index.js';
import { renduAccueil } from './home.js';
import { toast, echappe } from './ui.js';

const app = document.getElementById('app');
const parId = Object.fromEntries(sections.map((s) => [s.id, s]));

function construireNav(idActif) {
  const nav = document.getElementById('portail-nav');
  if (!nav) return;
  nav.innerHTML = sections
    .map(
      (s) =>
        `<a class="nav__lien ${s.id === idActif ? 'is-active' : ''}" href="#/${s.id}/">` +
        `<span class="nav__icone" aria-hidden="true">${s.icon}</span>${s.label}</a>`,
    )
    .join('');
}

function vue404() {
  return `<div class="vide">
    <div class="vide__emoji">🧭</div>
    <h3>Section introuvable</h3>
    <p>Cette section n'existe pas (ou plus).</p>
    <a class="bouton" href="#/">Retour à l'accueil</a>
  </div>`;
}

async function routeur() {
  const hash = location.hash || '#/';
  app.innerHTML = '<div class="chargement">Chargement…</div>';
  window.scrollTo(0, 0);

  try {
    // Accueil du portail
    if (hash === '#/' || hash === '#' || hash === '') {
      construireNav(null);
      await renduAccueil(app, sections);
      return;
    }

    // #/<id>/<reste>
    const m = hash.match(/^#\/([^/]+)\/?(.*)$/);
    const section = m && parId[m[1]];
    if (!section) {
      construireNav(null);
      app.innerHTML = vue404();
      return;
    }

    construireNav(section.id);
    await section.render(app, m[2] || '');
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="vide">
      <div class="vide__emoji">😕</div>
      <h3>Oups…</h3><p>${echappe(e.message)}</p>
      <a class="bouton" href="#/">Retour à l'accueil</a>
    </div>`;
    toast(e.message, 'err');
  }
}

function demarrer() {
  window.addEventListener('hashchange', routeur);
  routeur();
}

demarrer();
