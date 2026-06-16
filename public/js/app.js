/** Point d'entrée : chargement des métadonnées + routeur (par hash). */

import { chargerMeta } from './store.js';
import { renduDashboard } from './views/dashboard.js';
import { renduChecklist } from './views/checklist.js';
import { toast } from './ui.js';

const app = document.getElementById('app');

async function routeur() {
  const hash = location.hash || '#/';
  app.innerHTML = '<div class="chargement">Chargement…</div>';
  window.scrollTo(0, 0);

  try {
    const m = hash.match(/^#\/c\/(\d+)/);
    if (m) {
      await renduChecklist(app, Number(m[1]));
    } else {
      await renduDashboard(app);
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="vide">
      <div class="vide__emoji">😕</div>
      <h3>Oups…</h3><p>${e.message}</p>
      <a class="bouton" href="#/">Retour au tableau de bord</a>
    </div>`;
    toast(e.message, 'err');
  }
}

async function demarrer() {
  try {
    await chargerMeta();
  } catch {
    toast('Impossible de joindre le serveur.', 'err');
  }
  window.addEventListener('hashchange', routeur);
  routeur();
}

demarrer();
