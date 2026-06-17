/** Vue "Tableau de bord" : liste des collaborateurs + création d'une fiche. */

import { api } from './api.js';
import { store } from './store.js';
import { ouvrirModale, fermerModale } from '../../core/modal.js';
import {
  echappe,
  initiales,
  nomComplet,
  couleurAvatar,
  toast,
  formatDate,
} from '../../core/ui.js';

export async function renduDashboard(app) {
  const collabs = await api.listerCollaborateurs();

  const entete = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">Bienvenue chez <span>amitel</span> 👋</h1>
        <p class="tdb__sous">Suivez l'intégration de chaque nouveau collaborateur, étape par étape.</p>
      </div>
      <button class="bouton" id="btn-nouveau">＋ Nouveau collaborateur</button>
    </div>`;

  let corps;
  if (collabs.length === 0) {
    corps = `
      <div class="vide">
        <div class="vide__emoji">🚀</div>
        <h3>Aucune fiche pour le moment</h3>
        <p>Créez la première fiche d'onboarding pour démarrer l'aventure.</p>
        <button class="bouton" id="btn-nouveau-vide">Créer une fiche</button>
      </div>`;
  } else {
    corps = `<div class="grille">${collabs.map(carteCollab).join('')}</div>`;
  }

  app.innerHTML = entete + corps;

  app.querySelector('#btn-nouveau')?.addEventListener('click', () => formulaireCreation());
  app.querySelector('#btn-nouveau-vide')?.addEventListener('click', () => formulaireCreation());

  app.querySelectorAll('[data-collab]').forEach((carte) => {
    const ouvrir = () => {
      location.hash = `#/onboarding/c/${carte.dataset.collab}`;
    };
    carte.addEventListener('click', ouvrir);
    // Accessibilité clavier : la carte est focusable (tabindex=0), Entrée/Espace l'activent.
    carte.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        ouvrir();
      }
    });
  });
}

function carteCollab(c) {
  const { pourcentage, faites, total } = c.progression;
  const complete = total > 0 && faites === total;
  const couleur = couleurAvatar(nomComplet(c));
  const metas = [c.service, c.type_contrat, c.date_entree && `Arrivée ${formatDate(c.date_entree)}`]
    .filter(Boolean)
    .map((m) => `<span class="puce">${echappe(m)}</span>`)
    .join('');

  return `
    <article class="carte-collab ${complete ? 'is-complete' : ''}" data-collab="${c.id}" tabindex="0">
      ${complete ? '<span class="puce puce--ok puce--badge">✓ Terminé</span>' : ''}
      <div class="carte-collab__haut">
        <div class="avatar" style="background:${couleur}">${echappe(initiales(c.prenom, c.nom))}</div>
        <div>
          <h3 class="carte-collab__nom">${echappe(nomComplet(c))}</h3>
          <p class="carte-collab__poste">${echappe(c.intitule_poste || 'Poste à préciser')}</p>
        </div>
      </div>
      <div class="carte-collab__meta">${metas || '<span class="puce">À compléter</span>'}</div>
      <div class="barre">
        <div class="barre__remplissage ${complete ? 'is-complete' : ''}" style="width:${pourcentage}%"></div>
      </div>
      <div class="barre-legende">
        <span>${faites} / ${total} tâches</span>
        <strong>${pourcentage}%</strong>
      </div>
    </article>`;
}

function formulaireCreation() {
  const meta = store.meta;
  const optionsServices = ['<option value="">— Choisir —</option>']
    .concat(meta.services.map((s) => `<option value="${echappe(s)}">${echappe(s)}</option>`))
    .join('');
  const optionsContrats = ['<option value="">— Choisir —</option>']
    .concat(meta.typesContrat.map((t) => `<option value="${echappe(t)}">${echappe(t)}</option>`))
    .join('');

  ouvrirModale({
    titre: 'Nouveau collaborateur',
    corpsHTML: `
      <form id="form-collab">
        <div class="champs" style="padding-top:0">
          <div class="champ">
            <label for="f-prenom">Prénom</label>
            <input id="f-prenom" name="prenom" autocomplete="off" />
          </div>
          <div class="champ">
            <label for="f-nom">Nom</label>
            <input id="f-nom" name="nom" autocomplete="off" />
          </div>
          <div class="champ">
            <label for="f-service">Service</label>
            <select id="f-service" name="service">${optionsServices}</select>
          </div>
          <div class="champ">
            <label for="f-poste">Intitulé du poste</label>
            <input id="f-poste" name="intitule_poste" autocomplete="off" />
          </div>
          <div class="champ">
            <label for="f-contrat">Type de contrat</label>
            <select id="f-contrat" name="type_contrat">${optionsContrats}</select>
          </div>
          <div class="champ">
            <label for="f-entree">Date d'entrée</label>
            <input id="f-entree" name="date_entree" type="date" />
          </div>
        </div>
      </form>`,
    piedHTML: `
      <button class="bouton bouton--fantome" data-fermer>Annuler</button>
      <button class="bouton" id="f-valider">Créer la fiche</button>`,
    onMonte: (fond) => {
      const form = fond.querySelector('#form-collab');
      const valider = async () => {
        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.nom?.trim() && !data.prenom?.trim()) {
          toast('Indiquez au moins un nom ou un prénom.', 'err');
          return;
        }
        try {
          const fiche = await api.creerCollaborateur(data);
          fermerModale();
          toast('Fiche créée 🎉', 'ok');
          location.hash = `#/onboarding/c/${fiche.id}`;
        } catch (e) {
          toast(e.message, 'err');
        }
      };
      fond.querySelector('#f-valider').addEventListener('click', valider);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        valider();
      });
    },
  });
}
