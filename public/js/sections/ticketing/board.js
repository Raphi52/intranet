/** Section TICKETING — accueil (projets + stats) et board Kanban (drag-drop). */

import { api } from './api.js';
import { store, rafraichir, PRIO_LABEL } from './store.js';
import { ouvrirModale, fermerModale } from '../../core/modal.js';
import { echappe, toast, formatHorodatage } from '../../core/ui.js';
import { moiCourant } from '../../core/identite.js';

// ===================== Accueil : stats + cartes projets =====================
export async function renduAccueil(app) {
  const [stats] = await Promise.all([api.stats(), rafraichir()]);
  const projets = store.projets;

  const entete = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">Tickets <span>amitel</span> 🎫</h1>
        <p class="tdb__sous">Suivi des demandes, incidents et tâches par projet.</p>
      </div>
      <div class="tk-actions">
        <a class="bouton bouton--fantome" href="#/ticketing/personnes">👤 Registre</a>
        <button class="bouton" id="btn-nouveau-projet">＋ Nouveau projet</button>
      </div>
    </div>
    <div class="tk-stats">
      <div class="tk-stat"><strong>${stats.total}</strong><span>tickets</span></div>
      <div class="tk-stat tk-stat--retard"><strong>${stats.enRetard}</strong><span>en retard</span></div>
      <div class="tk-stat"><strong>${projets.length}</strong><span>projets</span></div>
    </div>`;

  let corps;
  if (projets.length === 0) {
    corps = `
      <div class="vide">
        <div class="vide__emoji">🎫</div>
        <h3>Aucun projet pour le moment</h3>
        <p>Créez un premier espace (IT, RH, Compta…) pour ouvrir des tickets.</p>
        <button class="bouton" id="btn-nouveau-projet-vide">Créer un projet</button>
      </div>`;
  } else {
    corps = `<div class="grille">${projets.map(carteProjet).join('')}</div>`;
  }

  app.innerHTML = entete + corps;
  app.querySelector('#btn-nouveau-projet')?.addEventListener('click', formulaireProjet);
  app.querySelector('#btn-nouveau-projet-vide')?.addEventListener('click', formulaireProjet);
  app.querySelectorAll('[data-projet]').forEach((c) =>
    c.addEventListener('click', () => (location.hash = `#/ticketing/p/${c.dataset.projet}`)),
  );
}

function carteProjet(p) {
  return `
    <article class="carte-collab" data-projet="${p.id}" tabindex="0">
      <div class="carte-collab__haut">
        <div class="avatar" style="background:${echappe(p.couleur)}">${echappe(p.cle.slice(0, 2))}</div>
        <div>
          <h3 class="carte-collab__nom">${echappe(p.nom)} ${p.prive ? '<span class="puce">🔒 privé</span>' : ''}</h3>
          <p class="carte-collab__poste">${echappe(p.cle)} · ${p.membres.length} membre(s)</p>
        </div>
      </div>
      <div class="carte-collab__meta">${echappe(p.description || 'Pas de description')}</div>
    </article>`;
}

// ===================== Board Kanban d'un projet =============================
export async function renduBoard(app, projetId) {
  let projet;
  try {
    projet = await api.getProjet(projetId);
  } catch {
    app.innerHTML = '<p class="vide">Projet introuvable. <a href="#/ticketing/">Retour</a></p>';
    return;
  }
  app.dataset.projet = projetId;
  await dessinerBoard(app, projet);
}

async function dessinerBoard(app, projet) {
  const tickets = await api.listerTickets({ project_id: projet.id });
  const parStatut = (cle) => tickets.filter((t) => t.statut === cle);

  const colonnes = projet.statuts
    .map(
      (s) => `
      <div class="tk-col" data-statut="${echappe(s.cle)}">
        <div class="tk-col__tete">${echappe(s.label)} <span class="tk-col__n">${parStatut(s.cle).length}</span></div>
        <div class="tk-col__liste" data-statut="${echappe(s.cle)}">
          ${parStatut(s.cle).map(carteTicket).join('') || '<p class="tk-col__vide">—</p>'}
        </div>
      </div>`,
    )
    .join('');

  app.innerHTML = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">${echappe(projet.nom)} ${projet.prive ? '🔒' : ''}</h1>
        <p class="tdb__sous"><a href="#/ticketing/">← Tous les projets</a> · ${echappe(projet.cle)}</p>
      </div>
      <div class="tk-actions">
        <button class="bouton bouton--fantome" id="btn-projet-membres">👥 Membres</button>
        <button class="bouton" id="btn-nouveau-ticket">＋ Nouveau ticket</button>
      </div>
    </div>
    <div class="tk-board">${colonnes}</div>`;

  app.querySelector('#btn-nouveau-ticket').addEventListener('click', () => formulaireTicket(projet, () => dessinerBoard(app, projet)));
  app.querySelector('#btn-projet-membres').addEventListener('click', () => gererMembres(projet, () => dessinerBoard(app, projet)));

  // Cartes : clic = détail ; drag = déplacer de colonne
  app.querySelectorAll('[data-ticket]').forEach((carte) => {
    carte.addEventListener('click', () => (location.hash = `#/ticketing/t/${carte.dataset.ticket}`));
    carte.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', carte.dataset.ticket);
      carte.classList.add('is-drag');
    });
    carte.addEventListener('dragend', () => carte.classList.remove('is-drag'));
  });

  // Colonnes : zones de dépôt
  app.querySelectorAll('.tk-col__liste').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-survol');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-survol'));
    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('is-survol');
      const id = Number(e.dataTransfer.getData('text/plain'));
      const statut = zone.dataset.statut;
      const ticket = tickets.find((t) => t.id === id);
      if (!ticket || ticket.statut === statut) return;
      // On ne déplace que son propre ticket ou un ticket libre (qu'on s'attribue). Admin exempté.
      const moi = moiCourant();
      if (ticket.assignee && moi && ticket.assignee.id !== moi.id && moi.role !== 'admin') {
        toast(`Assigné à ${ticket.assignee.nom} — réassignez-le d'abord pour le déplacer.`, 'err');
        return;
      }
      try {
        const maj = await api.majTicket(id, { statut });
        toast(maj?.assignee?.id === moi?.id && !ticket.assignee ? 'Ticket pris en charge' : 'Ticket déplacé', 'ok');
        await dessinerBoard(app, projet);
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });
}

function carteTicket(t) {
  return `
    <article class="tk-carte ${t.en_retard ? 'is-retard' : ''}" data-ticket="${t.id}" draggable="true" tabindex="0">
      <div class="tk-carte__tete">
        <span class="tk-cle">${echappe(t.cle)}</span>
        <span class="tk-prio tk-prio--${echappe(t.priorite)}">${echappe(PRIO_LABEL[t.priorite] || t.priorite)}</span>
      </div>
      <p class="tk-carte__titre">${echappe(t.titre)}</p>
      <div class="tk-carte__pied">
        <span class="puce">${echappe(t.type)}</span>
        ${t.assignee ? `<span class="tk-assignee">${echappe(t.assignee.nom)}</span>` : '<span class="tk-assignee tk-assignee--vide">Non assigné</span>'}
        ${t.en_retard ? '<span class="puce puce--retard">⏰ en retard</span>' : ''}
      </div>
    </article>`;
}

// ===================== Formulaires (modales) ================================
function optionsPersonnes(selId) {
  return ['<option value="">— Personne —</option>']
    .concat(store.personnes.filter((p) => p.actif).map((p) => `<option value="${p.id}" ${p.id === selId ? 'selected' : ''}>${echappe(p.nom)}</option>`))
    .join('');
}

export function formulaireTicket(projet, apresCreation) {
  const m = store.meta;
  ouvrirModale({
    titre: `Nouveau ticket · ${projet.cle}`,
    corpsHTML: `
      <form id="form-ticket"><div class="champs" style="padding-top:0">
        <div class="champ"><label for="t-titre">Titre</label><input id="t-titre" name="titre" autocomplete="off" /></div>
        <div class="champ"><label for="t-type">Type</label><select id="t-type" name="type">${m.types.map((x) => `<option value="${x}">${x}</option>`).join('')}</select></div>
        <div class="champ"><label for="t-prio">Priorité</label><select id="t-prio" name="priorite">${m.priorites.map((x) => `<option value="${x}" ${x === 'normale' ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="champ"><label for="t-assignee">Assigné à</label><select id="t-assignee" name="assignee_id">${optionsPersonnes()}</select></div>
        <div class="champ champ--large"><label for="t-desc">Description</label><textarea id="t-desc" name="description" rows="4"></textarea></div>
      </div></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="t-valider">Créer le ticket</button>`,
    onMonte: (fond) => {
      const form = fond.querySelector('#form-ticket');
      const valider = async () => {
        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.titre?.trim()) return toast('Le titre est requis.', 'err');
        if (data.assignee_id) data.assignee_id = Number(data.assignee_id);
        else delete data.assignee_id;
        try {
          await api.creerTicket(projet.id, data);
          fermerModale();
          toast('Ticket créé 🎫', 'ok');
          apresCreation?.();
        } catch (e) {
          toast(e.message, 'err');
        }
      };
      fond.querySelector('#t-valider').addEventListener('click', valider);
      form.addEventListener('submit', (e) => { e.preventDefault(); valider(); });
    },
  });
}

export function formulaireProjet() {
  const cases = store.personnes
    .map((p) => `<label class="tk-check"><input type="checkbox" value="${p.id}" /> ${echappe(p.nom)}</label>`)
    .join('') || '<p class="tk-col__vide">Aucune personne dans le registre.</p>';
  ouvrirModale({
    titre: 'Nouveau projet',
    corpsHTML: `
      <form id="form-projet"><div class="champs" style="padding-top:0">
        <div class="champ"><label for="p-cle">Clé (préfixe ticket, ex. IT)</label><input id="p-cle" name="cle" maxlength="12" autocomplete="off" /></div>
        <div class="champ"><label for="p-nom">Nom</label><input id="p-nom" name="nom" autocomplete="off" /></div>
        <div class="champ"><label for="p-couleur">Couleur</label><input id="p-couleur" name="couleur" type="color" value="#C0392B" /></div>
        <div class="champ"><label class="tk-check"><input type="checkbox" id="p-prive" /> Projet privé (visible des seuls membres)</label></div>
        <div class="champ champ--large"><label for="p-desc">Description</label><textarea id="p-desc" name="description" rows="2"></textarea></div>
        <div class="champ champ--large"><label>Membres</label><div class="tk-checks">${cases}</div></div>
      </div></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="p-valider">Créer le projet</button>`,
    onMonte: (fond) => {
      const form = fond.querySelector('#form-projet');
      const valider = async () => {
        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.cle?.trim()) return toast('La clé est requise.', 'err');
        if (!data.nom?.trim()) return toast('Le nom est requis.', 'err');
        data.prive = fond.querySelector('#p-prive').checked;
        data.membres = Array.from(fond.querySelectorAll('.tk-checks input:checked')).map((c) => Number(c.value));
        try {
          const projet = await api.creerProjet(data);
          fermerModale();
          toast('Projet créé 🎉', 'ok');
          location.hash = `#/ticketing/p/${projet.id}`;
        } catch (e) {
          toast(e.message, 'err');
        }
      };
      fond.querySelector('#p-valider').addEventListener('click', valider);
      form.addEventListener('submit', (e) => { e.preventDefault(); valider(); });
    },
  });
}

function gererMembres(projet, apres) {
  const liste = projet.membres
    .map((m) => `<li>${echappe(m.nom)} <span class="puce">${echappe(m.role)}</span> <button class="tk-lien" data-retirer="${m.person_id}">retirer</button></li>`)
    .join('') || '<li class="tk-col__vide">Aucun membre.</li>';
  ouvrirModale({
    titre: `Membres · ${projet.cle}`,
    corpsHTML: `
      <ul class="tk-membres">${liste}</ul>
      <form id="form-membre"><div class="champs" style="padding-top:0">
        <div class="champ"><label for="m-pers">Ajouter</label><select id="m-pers">${optionsPersonnes()}</select></div>
      </div></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Fermer</button><button class="bouton" id="m-ajouter">Ajouter</button>`,
    onMonte: (fond) => {
      fond.querySelectorAll('[data-retirer]').forEach((b) =>
        b.addEventListener('click', async () => {
          await api.retirerMembre(projet.id, Number(b.dataset.retirer));
          fermerModale();
          await rafraichir();
          apres?.();
        }),
      );
      fond.querySelector('#m-ajouter').addEventListener('click', async () => {
        const pid = Number(fond.querySelector('#m-pers').value);
        if (!pid) return;
        await api.ajouterMembre(projet.id, { person_id: pid, role: 'membre' });
        fermerModale();
        await rafraichir();
        apres?.();
      });
    },
  });
}
