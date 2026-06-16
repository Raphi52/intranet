/** Helpers d'interface : échappement HTML, toasts, initiales, confettis. */

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
  const r = 40;
  const c = 2 * Math.PI * r;
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
