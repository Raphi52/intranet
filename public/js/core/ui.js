/** Helpers d'interface : échappement HTML, toasts, initiales, confettis. */

// Géométrie de l'anneau de progression — source unique (utilisée par anneauSVG ET checklist.js).
export const RAYON_ANNEAU = 40;
export const CIRC_ANNEAU = 2 * Math.PI * RAYON_ANNEAU;

/** Formate une date ISO (AAAA-MM-JJ) en JJ/MM/AAAA. Source unique (dashboard + checklist). */
export function formatDate(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return j && m && a ? `${j}/${m}/${a}` : iso;
}

export function echappe(valeur) {
  if (valeur === null || valeur === undefined) return '';
  return String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initiales(prenom = '', nom = '') {
  const p = (prenom.trim()[0] || '').toUpperCase();
  const n = (nom.trim()[0] || '').toUpperCase();
  return (p + n) || '👤';
}

/**
 * Badge de signature : prénom COMPLET + initiale du nom suivie d'un point
 * (ex. « Raphaël V. »). Distinct de `initiales()` (qui donne « RV »).
 */
export function badgeNom(prenom = '', nom = '') {
  const p = (prenom || '').trim();
  const n = (nom || '').trim();
  const ini = n ? `${n[0].toUpperCase()}.` : '';
  return [p, ini].filter(Boolean).join(' ') || '?';
}

/**
 * Formate un horodatage SQLite (« AAAA-MM-JJ HH:MM:SS », UTC) en « JJ/MM HH:MM ».
 * Renvoie la valeur brute si le format est inattendu.
 */
export function formatHorodatage(s) {
  if (!s) return '';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(s);
  const [, , mo, j, h, mi] = m;
  return `${j}/${mo} ${h}:${mi}`;
}

export function nomComplet(c) {
  const nc = `${c.prenom || ''} ${c.nom || ''}`.trim();
  return nc || 'Nouveau collaborateur';
}

/** Couleur d'avatar stable dérivée du nom. */
export function couleurAvatar(texte = '') {
  const palette = ['#C0392B', '#363B45', '#2C7BE5', '#8E44AD', '#16A085', '#D68910', '#1F8AAD'];
  let somme = 0;
  for (const ch of texte) somme += ch.charCodeAt(0);
  return palette[somme % palette.length];
}

// --- Toasts ----------------------------------------------------------------
export function toast(message, type = 'ok') {
  const conteneur = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  conteneur.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

// --- Confettis (célébration 100%) -----------------------------------------
let confettiActif = false;
export function confettis(duree = 2600) {
  if (confettiActif) return;
  const canvas = document.getElementById('confetti');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const L = (canvas.width = window.innerWidth * dpr);
  const H = (canvas.height = window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';

  const couleurs = ['#C0392B', '#363B45', '#27AE60', '#F39C12', '#2C7BE5', '#FFFFFF'];
  const particules = Array.from({ length: 160 }, () => ({
    x: Math.random() * L,
    y: -Math.random() * H * 0.4,
    r: (Math.random() * 6 + 4) * dpr,
    c: couleurs[(Math.random() * couleurs.length) | 0],
    vx: (Math.random() - 0.5) * 3 * dpr,
    vy: (Math.random() * 3 + 2) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
  }));

  confettiActif = true;
  const debut = performance.now();

  function frame(t) {
    ctx.clearRect(0, 0, L, H);
    for (const p of particules) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05 * dpr;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
      ctx.restore();
    }
    if (t - debut < duree) {
      requestAnimationFrame(frame);
    } else {
      ctx.clearRect(0, 0, L, H);
      confettiActif = false;
    }
  }
  requestAnimationFrame(frame);
}

// --- Anneau de progression (SVG) ------------------------------------------
export function anneauSVG(pourcentage, complete = false) {
  const r = RAYON_ANNEAU;
  const c = CIRC_ANNEAU;
  const offset = c * (1 - pourcentage / 100);
  return `
    <div class="anneau">
      <svg width="92" height="92" viewBox="0 0 92 92">
        <circle class="anneau__piste" cx="46" cy="46" r="${r}" />
        <circle class="anneau__valeur ${complete ? 'is-complete' : ''}"
          cx="46" cy="46" r="${r}"
          stroke-dasharray="${c}" stroke-dashoffset="${offset}" />
      </svg>
      <div class="anneau__txt">${pourcentage}%</div>
    </div>`;
}
