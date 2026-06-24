/**
 * Section ÉVÉNEMENTS — manifeste front.
 *
 * Liste des événements (à venir d'abord) + création + inscription/désinscription
 * (compteur + liste des participants). Dates : stockées UTC, affichées en heure locale.
 */

import { requete } from '../../core/http.js';
import { moiCourant, estAdmin } from '../../core/identite.js';
import { echappe, toast } from '../../core/ui.js';
import { ouvrirModale, fermerModale } from '../../core/modal.js';

const pad = (n) => String(n).padStart(2, '0');
const nowUtc = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
// UTC ('YYYY-MM-DD HH:MM') <-> valeur d'un <input type="datetime-local"> (heure locale).
function utcVersInputLocal(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function inputLocalVersUtc(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
function formatDateLocal(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

export default {
  id: 'evenements',
  label: 'Événements',
  icon: '📅',
  description: 'Créez des événements et inscrivez-vous (compteur de participants).',
  async render(conteneur) {
    await dessiner(conteneur);
  },
};

async function dessiner(app) {
  let events;
  try {
    events = await requete('/api/evenements');
  } catch {
    app.innerHTML = '<p class="vide">Événements indisponibles.</p>';
    return;
  }
  const moi = moiCourant();
  const admin = estAdmin();
  app.innerHTML = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">Événements 📅</h1>
        <p class="tdb__sous">Créez un événement et inscrivez-vous en un clic.</p>
      </div>
      <button class="bouton" id="evt-nouveau">＋ Nouvel événement</button>
    </div>
    <div class="evt-liste">
      ${events.length ? events.map((e) => carte(e, moi, admin)).join('') : '<div class="vide"><div class="vide__emoji">📅</div><h3>Aucun événement</h3><p>Créez le premier !</p></div>'}
    </div>`;

  app.querySelector('#evt-nouveau').addEventListener('click', () => formulaire(app));
  app.querySelectorAll('[data-part]').forEach((b) =>
    b.addEventListener('click', async () => {
      const inscrit = b.dataset.etat === '1';
      try {
        await requete(`/api/evenements/${b.dataset.part}/participation`, { method: inscrit ? 'DELETE' : 'POST' });
        await dessiner(app);
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
  app.querySelectorAll('[data-editer]').forEach((b) =>
    b.addEventListener('click', () => formulaire(app, events.find((e) => e.id === Number(b.dataset.editer)))),
  );
  app.querySelectorAll('[data-suppr]').forEach((b) =>
    b.addEventListener('click', () => confirmerSuppression(app, Number(b.dataset.suppr))),
  );
}

function carte(e, moi, admin) {
  const passe = e.date_event && e.date_event < nowUtc();
  const peut = admin || (moi && e.createur_id === moi.id);
  const actions = peut
    ? `<button class="tk-lien" data-editer="${e.id}">éditer</button> <button class="tk-lien tk-lien--danger" data-suppr="${e.id}">supprimer</button>`
    : '';
  const noms = e.participants.length
    ? e.participants.map((p) => `<span class="puce">${echappe(p.nom || '—')}</span>`).join(' ')
    : '<span class="evt__vide">Personne pour l’instant</span>';
  return `
    <article class="evt ${passe ? 'is-passe' : ''}">
      <div class="evt__tete">
        <h3 class="evt__titre">${echappe(e.titre)} ${passe ? '<span class="puce">passé</span>' : ''}</h3>
        <div class="evt__actions">${actions}</div>
      </div>
      <div class="evt__infos">📅 ${echappe(formatDateLocal(e.date_event))}${e.lieu ? ` · 📍 ${echappe(e.lieu)}` : ''}</div>
      ${e.description ? `<p class="evt__desc">${echappe(e.description)}</p>` : ''}
      <div class="evt__pied">
        <button class="bouton ${e.je_participe ? 'bouton--fantome' : ''} bouton--sm" data-part="${e.id}" data-etat="${e.je_participe ? 1 : 0}">
          ${e.je_participe ? '✓ Inscrit — se désinscrire' : 'Je participe'}
        </button>
        <span class="evt__compteur"><strong>${e.nb_participants}</strong> participant${e.nb_participants > 1 ? 's' : ''}</span>
      </div>
      <div class="evt__participants">${noms}</div>
      <div class="evt__meta">Créé par ${echappe(e.createur_nom || '—')}</div>
    </article>`;
}

function formulaire(app, e) {
  const edition = !!e;
  ouvrirModale({
    titre: edition ? 'Éditer l’événement' : 'Nouvel événement',
    corpsHTML: `<form id="evt-form"><div class="champs" style="padding-top:0">
      <div class="champ champ--large"><label for="e-titre">Titre</label><input id="e-titre" maxlength="150" value="${edition ? echappe(e.titre) : ''}" /></div>
      <div class="champ"><label for="e-date">Date et heure</label><input id="e-date" type="datetime-local" value="${edition ? echappe(utcVersInputLocal(e.date_event)) : ''}" /></div>
      <div class="champ"><label for="e-lieu">Lieu</label><input id="e-lieu" maxlength="200" value="${edition ? echappe(e.lieu) : ''}" /></div>
      <div class="champ champ--large"><label for="e-desc">Description</label><textarea id="e-desc" rows="4">${edition ? echappe(e.description) : ''}</textarea></div>
    </div></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="e-ok">${edition ? 'Enregistrer' : 'Créer'}</button>`,
    onMonte: (fond) => {
      const valider = async () => {
        const titre = fond.querySelector('#e-titre').value.trim();
        const dateLocale = fond.querySelector('#e-date').value;
        if (!titre) return toast('Le titre est requis.', 'err');
        if (!dateLocale) return toast('La date est requise.', 'err');
        const body = {
          titre,
          date_event: inputLocalVersUtc(dateLocale),
          lieu: fond.querySelector('#e-lieu').value,
          description: fond.querySelector('#e-desc').value,
        };
        try {
          if (edition) await requete(`/api/evenements/${e.id}`, { method: 'PUT', body: JSON.stringify(body) });
          else await requete('/api/evenements', { method: 'POST', body: JSON.stringify(body) });
          fermerModale();
          toast('Enregistré 📅', 'ok');
          await dessiner(app);
        } catch (err) {
          toast(err.message, 'err');
        }
      };
      fond.querySelector('#e-ok').addEventListener('click', valider);
      fond.querySelector('#evt-form').addEventListener('submit', (ev) => { ev.preventDefault(); valider(); });
    },
  });
}

function confirmerSuppression(app, id) {
  ouvrirModale({
    titre: 'Supprimer l’événement ?',
    corpsHTML: '<p>L’événement et ses inscriptions seront supprimés.</p>',
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton bouton--danger" id="sup-ok">Supprimer</button>`,
    onMonte: (fond) =>
      fond.querySelector('#sup-ok').addEventListener('click', async () => {
        try {
          await requete(`/api/evenements/${id}`, { method: 'DELETE' });
          fermerModale();
          toast('Supprimé', 'ok');
          await dessiner(app);
        } catch (err) {
          toast(err.message, 'err');
        }
      }),
  });
}
