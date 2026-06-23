/**
 * Section ADMIN — gestion des comptes (réservée au rôle admin).
 *
 * Le registre des personnes EST la table des comptes : créer un compte ici, c'est
 * alimenter le registre (assignation ticketing). API : /api/auth/* (auth core).
 */

import { requete } from '../../core/http.js';
import { ouvrirModale, fermerModale } from '../../core/modal.js';
import { echappe, toast } from '../../core/ui.js';

let META = { services: [], roles: ['admin', 'membre'] };

export default {
  id: 'admin',
  label: 'Comptes',
  icon: '👥',
  description: 'Gestion des comptes (administration).',
  adminSeul: true,
  async render(conteneur) {
    META = await requete('/api/auth/services').catch(() => META);
    await dessiner(conteneur);
  },
};

async function dessiner(conteneur) {
  const users = await requete('/api/auth/users');
  const lignes = users
    .map(
      (u) => `
      <tr class="${u.actif ? '' : 'tk-inactif'}">
        <td>${echappe(u.nom)}</td>
        <td>${echappe(u.email)}</td>
        <td>${echappe(u.service) || '<em>—</em>'}</td>
        <td><span class="puce ${u.role === 'admin' ? 'puce--ok' : ''}">${echappe(u.role)}</span></td>
        <td>${u.actif ? 'Actif' : 'Inactif'}${u.must_change ? ' <span class="puce">mdp à changer</span>' : ''}</td>
        <td class="tk-tbl__actions">
          <button class="tk-lien" data-editer="${u.id}">éditer</button>
          <button class="tk-lien" data-mdp="${u.id}">mot de passe</button>
        </td>
      </tr>`,
    )
    .join('');

  conteneur.innerHTML = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">Comptes</h1>
        <p class="tdb__sous">Créez les comptes (login + mot de passe). Ils alimentent le registre des personnes.</p>
      </div>
      <button class="bouton" id="btn-new-compte">＋ Nouveau compte</button>
    </div>
    <table class="tk-tbl">
      <thead><tr><th>Nom</th><th>E-mail</th><th>Service</th><th>Rôle</th><th>Statut</th><th></th></tr></thead>
      <tbody>${lignes}</tbody>
    </table>`;

  conteneur.querySelector('#btn-new-compte').addEventListener('click', () => formulaireCompte(conteneur));
  conteneur.querySelectorAll('[data-editer]').forEach((b) =>
    b.addEventListener('click', () => formulaireCompte(conteneur, users.find((u) => u.id === Number(b.dataset.editer)))),
  );
  conteneur.querySelectorAll('[data-mdp]').forEach((b) =>
    b.addEventListener('click', () => formulaireMotDePasse(conteneur, Number(b.dataset.mdp))),
  );
}

function optionsServices(sel) {
  return ['<option value="">— Service —</option>']
    .concat(META.services.map((s) => `<option value="${echappe(s)}" ${s === sel ? 'selected' : ''}>${echappe(s)}</option>`))
    .join('');
}
function optionsRoles(sel) {
  return META.roles.map((r) => `<option value="${r}" ${r === sel ? 'selected' : ''}>${r}</option>`).join('');
}

function formulaireCompte(conteneur, u) {
  const edition = !!u;
  ouvrirModale({
    titre: edition ? 'Éditer le compte' : 'Nouveau compte',
    corpsHTML: `
      <form id="form-compte"><div class="champs" style="padding-top:0">
        <div class="champ"><label for="c-nom">Nom complet</label><input id="c-nom" value="${edition ? echappe(u.nom) : ''}" autocomplete="off" /></div>
        <div class="champ"><label for="c-email">E-mail (identifiant)</label><input id="c-email" type="email" value="${edition ? echappe(u.email) : ''}" ${edition ? 'disabled' : ''} autocomplete="off" /></div>
        ${edition ? '' : '<div class="champ"><label for="c-mdp">Mot de passe initial</label><input id="c-mdp" type="text" autocomplete="off" /></div>'}
        <div class="champ"><label for="c-service">Service</label><select id="c-service">${optionsServices(edition ? u.service : '')}</select></div>
        <div class="champ"><label for="c-role">Rôle</label><select id="c-role">${optionsRoles(edition ? u.role : 'membre')}</select></div>
        ${edition ? `<div class="champ"><label class="tk-check"><input type="checkbox" id="c-actif" ${u.actif ? 'checked' : ''} /> Actif</label></div>` : ''}
      </div></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="c-ok">${edition ? 'Enregistrer' : 'Créer'}</button>`,
    onMonte: (fond) => {
      const valider = async () => {
        const nom = fond.querySelector('#c-nom').value.trim();
        const service = fond.querySelector('#c-service').value;
        const role = fond.querySelector('#c-role').value;
        if (!nom) return toast('Le nom est requis.', 'err');
        try {
          if (edition) {
            await requete(`/api/auth/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ nom, service, role, actif: fond.querySelector('#c-actif').checked }) });
          } else {
            const email = fond.querySelector('#c-email').value.trim();
            const motDePasse = fond.querySelector('#c-mdp').value;
            await requete('/api/auth/users', { method: 'POST', body: JSON.stringify({ nom, email, motDePasse, service, role }) });
          }
          fermerModale();
          toast('Enregistré', 'ok');
          dessiner(conteneur);
        } catch (e) {
          toast(e.message, 'err');
        }
      };
      fond.querySelector('#c-ok').addEventListener('click', valider);
      fond.querySelector('#form-compte').addEventListener('submit', (e) => { e.preventDefault(); valider(); });
    },
  });
}

function formulaireMotDePasse(conteneur, id) {
  ouvrirModale({
    titre: 'Réinitialiser le mot de passe',
    corpsHTML: `<form id="form-mdp"><div class="champs" style="padding-top:0">
      <div class="champ"><label for="m-mdp">Nouveau mot de passe</label><input id="m-mdp" type="text" autocomplete="off" /></div>
    </div><p class="tk-col__vide">Les sessions en cours de ce compte seront déconnectées.</p></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="m-ok">Réinitialiser</button>`,
    onMonte: (fond) => {
      fond.querySelector('#m-ok').addEventListener('click', async () => {
        const motDePasse = fond.querySelector('#m-mdp').value;
        if (!motDePasse || motDePasse.length < 6) return toast('Mot de passe trop court (≥ 6).', 'err');
        try {
          await requete(`/api/auth/users/${id}/password`, { method: 'POST', body: JSON.stringify({ motDePasse }) });
          fermerModale();
          toast('Mot de passe réinitialisé', 'ok');
        } catch (e) {
          toast(e.message, 'err');
        }
      });
    },
  });
}
