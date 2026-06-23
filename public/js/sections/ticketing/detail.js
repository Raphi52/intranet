/** Section TICKETING — détail d'un ticket (édition, commentaires, historique). */

import { api } from './api.js';
import { store, PRIO_LABEL } from './store.js';
import { ouvrirModale, fermerModale } from '../../core/modal.js';
import { echappe, toast, formatHorodatage } from '../../core/ui.js';

// Échéances : stockées en UTC ('YYYY-MM-DD HH:MM:SS') <-> input datetime-local (heure LOCALE du navigateur).
const pad2 = (n) => String(n).padStart(2, '0');
function utcVersInputLocal(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function inputLocalVersUtc(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

export async function renduDetail(app, id) {
  let t, projet;
  try {
    t = await api.getTicket(id);
    projet = await api.getProjet(t.project_id);
  } catch {
    app.innerHTML = '<p class="vide">Ticket introuvable. <a href="#/ticketing/">Retour</a></p>';
    return;
  }
  dessiner(app, t, projet);
}

function selOptions(items, val) {
  return items.map((x) => `<option value="${echappe(x.v)}" ${x.v === val ? 'selected' : ''}>${echappe(x.l)}</option>`).join('');
}

function dessiner(app, t, projet) {
  const m = store.meta;
  const statuts = projet.statuts.map((s) => ({ v: s.cle, l: s.label }));
  const personnes = [{ v: '', l: '— Non assigné —' }].concat(
    store.personnes.filter((p) => p.actif).map((p) => ({ v: String(p.id), l: p.nom })),
  );

  const commentaires = t.commentaires
    .map((c) => `<div class="tk-com"><div class="tk-com__tete"><strong>${echappe(c.auteur || '—')}</strong><span>${formatHorodatage(c.created_at)}</span></div><p>${echappe(c.corps)}</p></div>`)
    .join('') || '<p class="tk-col__vide">Aucun commentaire.</p>';

  const historique = t.historique
    .map((h) => `<li><span>${formatHorodatage(h.created_at)}</span> ${echappe(h.auteur || '—')} a changé <strong>${echappe(h.champ)}</strong> : « ${echappe(h.ancienne || '∅')} » → « ${echappe(h.nouvelle || '∅')} »</li>`)
    .join('') || '<li class="tk-col__vide">Aucun changement enregistré.</li>';

  app.innerHTML = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre"><span class="tk-cle">${echappe(t.cle)}</span> ${echappe(t.titre)}</h1>
        <p class="tdb__sous"><a href="#/ticketing/p/${t.project_id}">← ${echappe(t.projet_nom)}</a> ${t.en_retard ? '· <span class="puce puce--retard">⏰ en retard</span>' : ''}</p>
      </div>
      <div class="tk-actions">
        <button class="bouton bouton--fantome" id="btn-editer">✎ Éditer</button>
        <button class="bouton bouton--danger" id="btn-supprimer">Supprimer</button>
      </div>
    </div>
    <div class="tk-detail">
      <section class="tk-detail__corps">
        <h3>Description</h3>
        <p class="tk-desc">${echappe(t.description) || '<em>Pas de description.</em>'}</p>
        <h3>Commentaires</h3>
        <div class="tk-coms">${commentaires}</div>
        <form id="form-com" class="tk-com-form">
          <textarea id="c-corps" rows="2" placeholder="Ajouter un commentaire…"></textarea>
          <button class="bouton" id="c-envoyer">Commenter</button>
        </form>
        <h3>Historique</h3>
        <ul class="tk-histo">${historique}</ul>
      </section>
      <aside class="tk-detail__cote">
        <label class="tk-prop"><span>Statut</span><select id="f-statut">${selOptions(statuts, t.statut)}</select></label>
        <label class="tk-prop"><span>Priorité</span><select id="f-prio">${selOptions(m.priorites.map((p) => ({ v: p, l: PRIO_LABEL[p] || p })), t.priorite)}</select></label>
        <label class="tk-prop"><span>Type</span><select id="f-type">${selOptions(m.types.map((x) => ({ v: x, l: x })), t.type)}</select></label>
        <label class="tk-prop"><span>Assigné</span><select id="f-assignee">${selOptions(personnes, t.assignee ? String(t.assignee.id) : '')}</select></label>
        <label class="tk-prop"><span>Échéance</span><input id="f-echeance" type="datetime-local" value="${echappe(utcVersInputLocal(t.echeance))}" /></label>
        <div class="tk-prop tk-prop--info"><span>Demandeur</span><strong>${echappe(t.demandeur || '—')}</strong></div>
        <div class="tk-prop tk-prop--info"><span>Créé</span><strong>${formatHorodatage(t.created_at)}</strong></div>
      </aside>
    </div>`;

  const patch = async (data) => {
    try {
      const maj = await api.majTicket(t.id, data);
      Object.assign(t, maj);
      toast('Mis à jour', 'ok');
      dessiner(app, t, projet);
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  app.querySelector('#f-statut').addEventListener('change', (e) => patch({ statut: e.target.value }));
  app.querySelector('#f-prio').addEventListener('change', (e) => patch({ priorite: e.target.value }));
  app.querySelector('#f-type').addEventListener('change', (e) => patch({ type: e.target.value }));
  app.querySelector('#f-assignee').addEventListener('change', (e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null }));
  app.querySelector('#f-echeance').addEventListener('change', (e) => patch({ echeance: inputLocalVersUtc(e.target.value) }));

  const form = app.querySelector('#form-com');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const corps = app.querySelector('#c-corps').value.trim();
    if (!corps) return;
    try {
      const maj = await api.commenter(t.id, corps);
      Object.assign(t, maj);
      dessiner(app, t, projet);
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  app.querySelector('#btn-supprimer').addEventListener('click', () => {
    ouvrirModale({
      titre: 'Supprimer ce ticket ?',
      corpsHTML: `<p>Le ticket <strong>${echappe(t.cle)}</strong> et ses commentaires seront définitivement supprimés.</p>`,
      piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton bouton--danger" id="sup-ok">Supprimer</button>`,
      onMonte: (fond) =>
        fond.querySelector('#sup-ok').addEventListener('click', async () => {
          await api.supprimerTicket(t.id);
          fermerModale();
          toast('Ticket supprimé', 'ok');
          location.hash = `#/ticketing/p/${t.project_id}`;
        }),
    });
  });

  app.querySelector('#btn-editer').addEventListener('click', () => {
    ouvrirModale({
      titre: `Éditer ${t.cle}`,
      corpsHTML: `<form id="form-edit"><div class="champs" style="padding-top:0">
        <div class="champ champ--large"><label for="e-titre">Titre</label><input id="e-titre" value="${echappe(t.titre)}" /></div>
        <div class="champ champ--large"><label for="e-desc">Description</label><textarea id="e-desc" rows="5">${echappe(t.description)}</textarea></div>
      </div></form>`,
      piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="e-ok">Enregistrer</button>`,
      onMonte: (fond) =>
        fond.querySelector('#e-ok').addEventListener('click', async () => {
          const titre = fond.querySelector('#e-titre').value.trim();
          const description = fond.querySelector('#e-desc').value;
          fermerModale();
          await patch({ titre, description });
        }),
    });
  });
}
