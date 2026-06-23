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
import { toast, echappe, badgeNom } from './ui.js';
import { getOperateur, setOperateur, effacerOperateur, badgeOperateur } from './identite.js';

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

/* ----------------------- Gate d'identification --------------------------- */
// Aucun accès au portail (quelle que soit la section / l'URL) tant que
// l'opérateur n'a pas saisi son prénom ET son nom. Identification déclarative.
function vueGate() {
  return `
    <div class="gate">
      <div class="gate__carte">
        <div class="gate__logo" aria-hidden="true">🪪</div>
        <h1>Qui êtes-vous ?</h1>
        <p>Indiquez votre prénom et votre nom pour accéder au portail.
           Vos actions seront signées de votre badge.</p>
        <form id="gate-form" class="gate__form">
          <div class="champ">
            <label for="gate-prenom">Prénom</label>
            <input id="gate-prenom" autocomplete="given-name" required />
          </div>
          <div class="champ">
            <label for="gate-nom">Nom</label>
            <input id="gate-nom" autocomplete="family-name" required />
          </div>
          <button class="bouton" type="submit">Entrer dans le portail →</button>
          <p class="gate__apercu" id="gate-apercu" aria-live="polite"></p>
        </form>
      </div>
    </div>`;
}

function brancherGate() {
  const prenom = document.getElementById('gate-prenom');
  const nom = document.getElementById('gate-nom');
  const apercu = document.getElementById('gate-apercu');

  const majApercu = () => {
    const p = prenom.value.trim();
    const n = nom.value.trim();
    apercu.textContent = p || n ? `Votre badge : ${badgeNom(p, n)}` : '';
  };
  prenom.addEventListener('input', majApercu);
  nom.addEventListener('input', majApercu);

  document.getElementById('gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!prenom.value.trim() || !nom.value.trim()) {
      toast('Prénom et nom sont requis.', 'err');
      return;
    }
    setOperateur(prenom.value, nom.value);
    afficherBadge();
    routeur(); // rejoue la route demandée, désormais autorisée
  });
  prenom.focus();
}

/** Peuple (ou vide) le badge opérateur dans l'en-tête. */
function afficherBadge() {
  const zone = document.getElementById('entete-actions');
  if (!zone) return;
  const badge = badgeOperateur();
  if (!badge) {
    zone.innerHTML = '';
    return;
  }
  zone.innerHTML = `
    <span class="op-badge" title="Vos actions sont signées de ce badge">
      <span class="op-badge__pastille" aria-hidden="true">${echappe(badge[0])}</span>
      <span class="op-badge__nom">${echappe(badge)}</span>
    </span>
    <button class="bouton bouton--fantome bouton--sm" id="op-changer">Changer</button>`;
  zone.querySelector('#op-changer').addEventListener('click', () => {
    effacerOperateur();
    afficherBadge();
    routeur(); // retombe sur le gate
  });
}

async function routeur() {
  const hash = location.hash || '#/';
  window.scrollTo(0, 0);

  // Gate : pas d'opérateur identifié → on bloque tout accès (y compris une URL
  // de section saisie directement) et on affiche l'écran de saisie.
  if (!getOperateur()) {
    construireNav(null);
    const zone = document.getElementById('entete-actions');
    if (zone) zone.innerHTML = '';
    app.innerHTML = vueGate();
    brancherGate();
    return;
  }
  afficherBadge();

  app.innerHTML = '<div class="chargement">Chargement…</div>';

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
