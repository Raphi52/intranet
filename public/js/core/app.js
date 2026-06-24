/**
 * Portail Amitel — shell + routeur (par hash).
 *
 * Le routeur lit le registre front (`sections/index.js`), construit la navigation
 * et dispatche #/<idSection>/<sous-route> → section.render(conteneur, sousRoute).
 * Accès protégé par une VRAIE authentification (session serveur) : pas de session
 * → écran de connexion.
 */

import { sections } from '../sections/index.js';
import { renduAccueil } from './home.js';
import { toast, echappe } from './ui.js';
import { chargerMoi, moiCourant, connexion, deconnexion, badgeOperateur, estAdmin } from './identite.js';

const app = document.getElementById('app');
const parId = Object.fromEntries(sections.map((s) => [s.id, s]));

// Une section peut être réservée aux admins (manifest `adminSeul: true`).
const visibleEnNav = (s) => !s.adminSeul || estAdmin();

function construireNav(idActif) {
  const nav = document.getElementById('portail-nav');
  if (!nav) return;
  if (!moiCourant()) {
    nav.innerHTML = '';
    return;
  }
  nav.innerHTML = sections
    .filter(visibleEnNav)
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

/* ----------------------- Écran de connexion ------------------------------ */
function vueLogin() {
  return `
    <div class="gate">
      <div class="gate__carte">
        <div class="gate__logo" aria-hidden="true">🔐</div>
        <h1>Connexion</h1>
        <p>Identifiez-vous pour accéder au portail Amitel.</p>
        <form id="login-form" class="gate__form">
          <div class="champ">
            <label for="login-email">E-mail</label>
            <input id="login-email" type="email" autocomplete="username" required />
          </div>
          <div class="champ">
            <label for="login-mdp">Mot de passe</label>
            <input id="login-mdp" type="password" autocomplete="current-password" required />
          </div>
          <button class="bouton" type="submit">Se connecter →</button>
          <p class="gate__apercu" id="login-erreur" aria-live="polite"></p>
        </form>
      </div>
    </div>`;
}

function brancherLogin() {
  const form = document.getElementById('login-form');
  const erreur = document.getElementById('login-erreur');
  const email = document.getElementById('login-email');
  email?.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    erreur.textContent = '';
    try {
      await connexion(email.value.trim(), document.getElementById('login-mdp').value);
      routeur(); // session ouverte → rejoue la route demandée
    } catch (err) {
      erreur.textContent = err.message;
    }
  });
}

/** Peuple (ou vide) le badge opérateur + bouton déconnexion dans l'en-tête. */
function afficherBadge() {
  const zone = document.getElementById('entete-actions');
  if (!zone) return;
  const badge = badgeOperateur();
  if (!moiCourant() || !badge) {
    zone.innerHTML = '';
    return;
  }
  const sombre = document.body.classList.contains('sombre');
  zone.innerHTML = `
    <span class="op-badge" title="Connecté — vos actions sont signées de ce badge">
      <span class="op-badge__pastille" aria-hidden="true">${echappe(badge[0])}</span>
      <span class="op-badge__nom">${echappe(badge)}</span>
    </span>
    <div class="cote__bas">
      <button class="cote__theme" id="theme-toggle" aria-label="Thème clair / sombre" title="Thème clair / sombre">${sombre ? '☀️' : '🌙'}</button>
      <button class="bouton bouton--fantome bouton--sm" id="op-deconnexion">Déconnexion</button>
    </div>`;
  zone.querySelector('#op-deconnexion').addEventListener('click', async () => {
    await deconnexion();
    location.hash = '#/';
    routeur();
  });
  zone.querySelector('#theme-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    basculerTheme();
  });
}

async function routeur() {
  const hash = location.hash || '#/';
  window.scrollTo(0, 0);
  // Masque la sidebar tant qu'on n'est pas connecté (écran de login pleine page).
  document.body.classList.toggle('hors-ligne', !moiCourant());

  // Pas de session valide → écran de connexion (bloque tout accès, même une URL directe).
  if (!moiCourant()) {
    construireNav(null);
    const zone = document.getElementById('entete-actions');
    if (zone) zone.innerHTML = '';
    app.innerHTML = vueLogin();
    brancherLogin();
    return;
  }
  afficherBadge();

  app.innerHTML = '<div class="chargement">Chargement…</div>';

  try {
    if (hash === '#/' || hash === '#' || hash === '') {
      construireNav(null);
      await renduAccueil(app, sections.filter(visibleEnNav));
      return;
    }

    const m = hash.match(/^#\/([^/]+)\/?(.*)$/);
    const section = m && parId[m[1]];
    if (!section || (section.adminSeul && !estAdmin())) {
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

// Sidebar rétractable au SURVOL : s'ouvre au passage de la souris, se replie 2 s après
// que la souris en est sortie (le chevron permet aussi de replier immédiatement).
function brancherCote() {
  const cote = document.getElementById('cote');
  if (!cote) return;
  let minuteur;
  const ouvrir = () => { clearTimeout(minuteur); cote.classList.add('is-ouvert'); };
  const fermer = () => { clearTimeout(minuteur); cote.classList.remove('is-ouvert'); };
  cote.addEventListener('mouseenter', ouvrir);
  const planifierFermeture = () => { clearTimeout(minuteur); minuteur = setTimeout(fermer, 500); }; // sleep-ok: délai UX voulu (replier 0,5 s après sortie souris), pas un sleep de test
  cote.addEventListener('mouseleave', planifierFermeture);
  document.getElementById('cote-toggle')?.addEventListener('click', (e) => { e.stopPropagation(); fermer(); });
}

// Thème clair / sombre, mémorisé (localStorage). Le bouton vit dans l'en-tête de la sidebar
// (rendu par afficherBadge, sur la même ligne que Déconnexion).
function appliquerTheme() {
  document.body.classList.toggle('sombre', localStorage.getItem('portail.theme') === 'sombre');
}
function basculerTheme() {
  const sombre = !document.body.classList.contains('sombre');
  localStorage.setItem('portail.theme', sombre ? 'sombre' : 'clair');
  document.body.classList.toggle('sombre', sombre);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = sombre ? '☀️' : '🌙';
}

async function demarrer() {
  appliquerTheme(); // applique le thème mémorisé au plus tôt
  await chargerMoi(); // récupère la session existante (cookie) au chargement
  brancherCote();
  window.addEventListener('hashchange', routeur);
  // Session expirée détectée par un appel API → on recharge l'identité et réaffiche.
  window.addEventListener('portail:401', async () => {
    await chargerMoi();
    routeur();
  });
  routeur();
}

demarrer();
