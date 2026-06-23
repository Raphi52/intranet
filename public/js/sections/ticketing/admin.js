/** Section TICKETING — registre des personnes (nom + e-mail, socle assignation/notifs). */

import { api } from './api.js';
import { store, rafraichir } from './store.js';
import { ouvrirModale, fermerModale } from '../../core/modal.js';
import { echappe, toast } from '../../core/ui.js';

export async function renduPersonnes(app) {
  await rafraichir();
  const gens = store.personnes;

  const lignes = gens
    .map(
      (p) => `
      <tr class="${p.actif ? '' : 'tk-inactif'}">
        <td>${echappe(p.nom)}</td>
        <td>${echappe(p.email) || '<em>—</em>'}</td>
        <td>${p.actif ? 'Actif' : 'Inactif'}</td>
        <td class="tk-tbl__actions">
          <button class="tk-lien" data-editer="${p.id}">éditer</button>
          <button class="tk-lien tk-lien--danger" data-suppr="${p.id}">supprimer</button>
        </td>
      </tr>`,
    )
    .join('');

  app.innerHTML = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">Registre des personnes</h1>
        <p class="tdb__sous"><a href="#/ticketing/">← Projets</a> · destinataires d'assignation et de notifications.</p>
      </div>
      <button class="bouton" id="btn-new-pers">＋ Ajouter une personne</button>
    </div>
    ${gens.length === 0
      ? '<div class="vide"><div class="vide__emoji">👤</div><h3>Registre vide</h3><p>Ajoutez les personnes susceptibles de traiter des tickets.</p></div>'
      : `<table class="tk-tbl"><thead><tr><th>Nom</th><th>E-mail</th><th>Statut</th><th></th></tr></thead><tbody>${lignes}</tbody></table>`}`;

  app.querySelector('#btn-new-pers').addEventListener('click', () => formulairePersonne());
  app.querySelectorAll('[data-editer]').forEach((b) =>
    b.addEventListener('click', () => formulairePersonne(gens.find((p) => p.id === Number(b.dataset.editer)))),
  );
  app.querySelectorAll('[data-suppr]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api.supprimerPersonne(Number(b.dataset.suppr));
        toast('Personne supprimée', 'ok');
        renduPersonnes(app);
      } catch (e) {
        toast(e.message, 'err');
      }
    }),
  );
}

function formulairePersonne(p) {
  const edition = !!p;
  ouvrirModale({
    titre: edition ? 'Éditer la personne' : 'Nouvelle personne',
    corpsHTML: `
      <form id="form-pers"><div class="champs" style="padding-top:0">
        <div class="champ"><label for="pe-nom">Nom complet</label><input id="pe-nom" value="${edition ? echappe(p.nom) : ''}" autocomplete="off" /></div>
        <div class="champ"><label for="pe-email">E-mail</label><input id="pe-email" type="email" value="${edition ? echappe(p.email) : ''}" autocomplete="off" /></div>
        ${edition ? `<div class="champ"><label class="tk-check"><input type="checkbox" id="pe-actif" ${p.actif ? 'checked' : ''} /> Actif</label></div>` : ''}
      </div></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="pe-ok">${edition ? 'Enregistrer' : 'Ajouter'}</button>`,
    onMonte: (fond) => {
      const valider = async () => {
        const nom = fond.querySelector('#pe-nom').value.trim();
        const email = fond.querySelector('#pe-email').value.trim();
        if (!nom) return toast('Le nom est requis.', 'err');
        try {
          if (edition) await api.majPersonne(p.id, { nom, email, actif: fond.querySelector('#pe-actif').checked });
          else await api.creerPersonne({ nom, email });
          fermerModale();
          toast('Enregistré', 'ok');
          renduPersonnes(document.getElementById('app'));
        } catch (e) {
          toast(e.message, 'err');
        }
      };
      fond.querySelector('#pe-ok').addEventListener('click', valider);
      fond.querySelector('#form-pers').addEventListener('submit', (e) => { e.preventDefault(); valider(); });
    },
  });
}
