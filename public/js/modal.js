/** Modale simple : ouvre/ferme une boîte de dialogue centrée. */

let courante = null;

export function ouvrirModale({ titre, corpsHTML, piedHTML, onMonte }) {
  fermerModale();

  const fond = document.createElement('div');
  fond.className = 'modale-fond';
  fond.innerHTML = `
    <div class="modale" role="dialog" aria-modal="true" aria-label="${titre}">
      <div class="modale__entete">
        <h2>${titre}</h2>
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
  document.addEventListener('keydown', surEchap);

  if (onMonte) onMonte(fond);
  const premier = fond.querySelector('input, select, textarea, button');
  premier?.focus();

  return fond;
}

export function fermerModale() {
  if (!courante) return;
  document.removeEventListener('keydown', surEchap);
  courante.remove();
  courante = null;
}

function surEchap(e) {
  if (e.key === 'Escape') fermerModale();
}
