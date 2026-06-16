/** Modale simple : ouvre/ferme une boîte de dialogue centrée. */
// fix-ok: a11y audit (cause connue = pas de focus-trap ni de restauration de focus, titre non échappé)
import { echappe } from './ui.js';

let courante = null;
let declencheur = null; // élément à re-focaliser à la fermeture

const SELECTEUR_FOCUS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ouvrirModale({ titre, corpsHTML, piedHTML, onMonte }) {
  fermerModale();
  declencheur = document.activeElement; // mémorise le focus courant

  const fond = document.createElement('div');
  fond.className = 'modale-fond';
  fond.innerHTML = `
    <div class="modale" role="dialog" aria-modal="true" aria-label="${echappe(titre)}">
      <div class="modale__entete">
        <h2>${echappe(titre)}</h2>
        <button class="modale__fermer" aria-label="Fermer" data-fermer>&times;</button>
      </div>
      <div class="modale__corps">${corpsHTML}</div>
      ${piedHTML ? `<div class="modale__pied">${piedHTML}</div>` : ''}
    </div>`;

  document.body.appendChild(fond);
  courante = fond;

  fond.addEventListener('click', (e) => {
    if (e.target === fond || e.target.hasAttribute('data-fermer')) fermerModale();
  });
  document.addEventListener('keydown', surClavier);

  if (onMonte) onMonte(fond);
  const premier = fond.querySelector(SELECTEUR_FOCUS);
  premier?.focus();

  return fond;
}

export function fermerModale() {
  if (!courante) return;
  document.removeEventListener('keydown', surClavier);
  courante.remove();
  courante = null;
  // Rend le focus à l'élément qui a ouvert la modale.
  if (declencheur && typeof declencheur.focus === 'function') declencheur.focus();
  declencheur = null;
}

function surClavier(e) {
  if (e.key === 'Escape') {
    fermerModale();
    return;
  }
  // Focus-trap : Tab/Shift+Tab bouclent à l'intérieur de la modale.
  if (e.key === 'Tab' && courante) {
    const focusables = Array.from(courante.querySelectorAll(SELECTEUR_FOCUS)).filter(
      (el) => el.offsetParent !== null,
    );
    if (focusables.length === 0) return;
    const premier = focusables[0];
    const dernier = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  }
}
