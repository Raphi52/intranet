/**
 * Cloche de notifications du portail (sidebar) : badge de non-lus + panneau déroulant,
 * rafraîchi à chaque navigation et par polling léger (30 s). Lit /api/notifications
 * (scopé à l'utilisateur courant), marque lu via /api/notifications/lu.
 */
import { requete } from './http.js';
import { moiCourant } from './identite.js';
import { echappe, formatHorodatage } from './ui.js';

let etat = { items: [], nonLus: 0 };
let ouvert = false;
let minuteur = null;

// Destination de navigation selon le type de notif.
function lienDe(n) {
  if (n.type === 'publication') return '#/';
  if (n.type === 'evenement') return '#/evenements/';
  return '#/ticketing/'; // assignation / commentaire / autre → board tickets
}
function iconeDe(n) {
  if (n.type === 'publication') return '📣';
  if (n.type === 'evenement') return '📅';
  return '🎫';
}

export async function rafraichirCloche() {
  const hote = document.getElementById('notif-cloche');
  if (!hote) return;
  if (!moiCourant()) {
    hote.innerHTML = '';
    return;
  }
  try {
    etat = await requete('/api/notifications');
  } catch {
    return; // 401 géré globalement ; on ne casse pas le shell
  }
  dessiner();
}

function dessiner() {
  const hote = document.getElementById('notif-cloche');
  if (!hote) return;
  const n = etat.nonLus || 0;
  hote.innerHTML = `
    <button class="cloche__btn ${n ? 'a-du-neuf' : ''}" id="cloche-btn" aria-label="Notifications" title="Notifications" aria-expanded="${ouvert}">
      <span class="cloche__icone" aria-hidden="true">🔔</span>
      <span class="cloche__txt">Notifications</span>
      ${n ? `<span class="cloche__badge">${n > 99 ? '99+' : n}</span>` : ''}
    </button>
    ${ouvert ? panneau() : ''}`;
  hote.querySelector('#cloche-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    basculer();
  });
  if (ouvert) {
    brancherPanneau(hote);
    positionnerPanneau(hote);
  }
}

function panneau() {
  const items = etat.items || [];
  const lignes = items.length
    ? items
        .map(
          (it) => `
        <button class="cloche-item ${it.lu ? '' : 'is-neuf'}" data-id="${it.id}" data-lien="${echappe(lienDe(it))}">
          <span class="cloche-item__ico" aria-hidden="true">${iconeDe(it)}</span>
          <span class="cloche-item__txt">
            <span class="cloche-item__msg">${echappe(it.message)}</span>
            <span class="cloche-item__date">${echappe(formatHorodatage(it.created_at))}</span>
          </span>
        </button>`,
        )
        .join('')
    : '<p class="cloche-vide">Aucune notification.</p>';
  const aDuNonLu = (etat.items || []).some((i) => !i.lu);
  return `
    <div class="cloche-panneau" id="cloche-panneau" role="menu">
      <div class="cloche-panneau__tete">
        <strong>Notifications</strong>
        ${aDuNonLu ? '<button class="cloche-lien" id="cloche-tout">Tout marquer lu</button>' : ''}
      </div>
      <div class="cloche-panneau__liste">${lignes}</div>
    </div>`;
}

// Ancre le panneau (position: fixed) au bord droit du bouton, quel que soit l'état replié/déplié.
function positionnerPanneau(hote) {
  const btn = hote.querySelector('#cloche-btn');
  const p = hote.querySelector('#cloche-panneau');
  if (!btn || !p) return;
  const r = btn.getBoundingClientRect();
  p.style.left = `${r.right + 10}px`;
  p.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - 440))}px`;
}

function brancherPanneau(hote) {
  hote.querySelector('#cloche-tout')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await requete('/api/notifications/lu', { method: 'POST', body: JSON.stringify({}) });
      etat = await requete('/api/notifications');
    } catch {
      /* silencieux */
    }
    dessiner();
  });
  hote.querySelectorAll('.cloche-item').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(b.dataset.id);
      try {
        await requete('/api/notifications/lu', { method: 'POST', body: JSON.stringify({ id }) });
      } catch {
        /* silencieux */
      }
      ouvert = false;
      location.hash = b.dataset.lien;
      await rafraichirCloche();
    }),
  );
}

function basculer() {
  ouvert = !ouvert;
  dessiner();
  if (ouvert) {
    setTimeout(() => document.addEventListener('click', fermerExterne, { once: true }), 0); // sleep-ok: defer 0 ms pour ne pas capter le clic d'ouverture courant (pas un sleep de test)
  }
}
function fermerExterne() {
  if (!ouvert) return;
  ouvert = false;
  dessiner();
}

// Polling léger tant qu'une session est active.
export function demarrerCloche() {
  if (minuteur) return;
  rafraichirCloche();
  minuteur = setInterval(() => {
    if (moiCourant()) rafraichirCloche();
  }, 30000); // sleep-ok: intervalle de polling UX (30 s), pas un sleep de test
}
