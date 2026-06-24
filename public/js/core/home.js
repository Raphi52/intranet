/** Accueil du portail : menu des sections + mur de PUBLICATIONS (annonces internes). */

import { echappe, toast, formatHorodatage } from './ui.js';
import { requete } from './http.js';
import { moiCourant, estAdmin } from './identite.js';
import { ouvrirModale, fermerModale } from './modal.js';

export async function renduAccueil(app, sections) {
  const entete = `
    <div class="tdb__entete">
      <div>
        <h1 class="tdb__titre">Portail <span>amitel</span></h1>
        <p class="tdb__sous">Choisissez une section pour commencer.</p>
      </div>
    </div>`;

  const cartes = sections
    .map(
      (s) => `
      <a class="carte-section" href="#/${s.id}/">
        <div class="carte-section__icone" aria-hidden="true">${s.icon}</div>
        <div>
          <h3 class="carte-section__titre">${echappe(s.label)}</h3>
          <p class="carte-section__desc">${echappe(s.description || '')}</p>
        </div>
      </a>`,
    )
    .join('');

  app.innerHTML =
    entete +
    `<div class="grille-sections">${cartes}</div>` +
    `<section class="fil-pub" aria-label="Publications">
       <h2 class="fil-pub__titre">📣 Publications</h2>
       <form id="pub-form" class="pub-form">
         <input id="pub-titre" maxlength="150" autocomplete="off" placeholder="Titre de la publication" />
         <textarea id="pub-corps" rows="2" placeholder="Partagez une annonce, une info…"></textarea>
         <button class="bouton" type="submit">Publier</button>
       </form>
       <div id="pub-liste" class="pub-liste"><p class="tk-col__vide">Chargement…</p></div>
     </section>`;

  const form = app.querySelector('#pub-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const titre = app.querySelector('#pub-titre').value.trim();
    const corps = app.querySelector('#pub-corps').value;
    if (!titre) return toast('Le titre est requis.', 'err');
    try {
      await requete('/api/publications', { method: 'POST', body: JSON.stringify({ titre, corps }) });
      app.querySelector('#pub-titre').value = '';
      app.querySelector('#pub-corps').value = '';
      toast('Publié 📣', 'ok');
      await dessinerFil(app);
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  await dessinerFil(app);
}

async function dessinerFil(app) {
  const liste = app.querySelector('#pub-liste');
  if (!liste) return;
  let pubs;
  try {
    pubs = await requete('/api/publications');
  } catch {
    liste.innerHTML = '<p class="tk-col__vide">Publications indisponibles.</p>';
    return;
  }
  const moi = moiCourant();
  const admin = estAdmin();
  if (!pubs.length) {
    liste.innerHTML = '<p class="tk-col__vide">Aucune publication pour le moment. Soyez le premier !</p>';
    return;
  }
  liste.innerHTML = pubs.map((p) => cartePub(p, moi, admin)).join('');

  liste.querySelectorAll('[data-suppr]').forEach((b) =>
    b.addEventListener('click', () => confirmerSuppression(app, Number(b.dataset.suppr))),
  );
  liste.querySelectorAll('[data-editer]').forEach((b) =>
    b.addEventListener('click', () => formulaireEdition(app, pubs.find((p) => p.id === Number(b.dataset.editer)))),
  );
  liste.querySelectorAll('[data-epingle]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await requete(`/api/publications/${b.dataset.epingle}/epingle`, { method: 'PATCH', body: JSON.stringify({ epingle: b.dataset.etat === '0' }) });
        await dessinerFil(app);
      } catch (err) {
        toast(err.message, 'err');
      }
    }),
  );
}

function cartePub(p, moi, admin) {
  const peut = admin || (moi && p.auteur_id === moi.id);
  const actions = [
    peut ? `<button class="tk-lien" data-editer="${p.id}">éditer</button>` : '',
    admin ? `<button class="tk-lien" data-epingle="${p.id}" data-etat="${p.epingle ? 1 : 0}">${p.epingle ? 'désépingler' : 'épingler'}</button>` : '',
    peut ? `<button class="tk-lien tk-lien--danger" data-suppr="${p.id}">supprimer</button>` : '',
  ].filter(Boolean).join(' ');
  return `
    <article class="pub ${p.epingle ? 'is-epingle' : ''}">
      <div class="pub__tete">
        <h3 class="pub__titre">${p.epingle ? '📌 ' : ''}${echappe(p.titre)}</h3>
        <div class="pub__actions">${actions}</div>
      </div>
      ${p.corps ? `<p class="pub__corps">${echappe(p.corps)}</p>` : ''}
      <div class="pub__meta">${echappe(p.auteur_nom || '—')} · ${formatHorodatage(p.created_at)}</div>
    </article>`;
}

function formulaireEdition(app, p) {
  if (!p) return;
  ouvrirModale({
    titre: 'Éditer la publication',
    corpsHTML: `<form id="pub-edit"><div class="champs" style="padding-top:0">
      <div class="champ champ--large"><label for="pe-titre">Titre</label><input id="pe-titre" maxlength="150" value="${echappe(p.titre)}" /></div>
      <div class="champ champ--large"><label for="pe-corps">Message</label><textarea id="pe-corps" rows="5">${echappe(p.corps)}</textarea></div>
    </div></form>`,
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton" id="pe-ok">Enregistrer</button>`,
    onMonte: (fond) =>
      fond.querySelector('#pe-ok').addEventListener('click', async () => {
        const titre = fond.querySelector('#pe-titre').value.trim();
        if (!titre) return toast('Le titre est requis.', 'err');
        try {
          await requete(`/api/publications/${p.id}`, { method: 'PUT', body: JSON.stringify({ titre, corps: fond.querySelector('#pe-corps').value }) });
          fermerModale();
          toast('Modifié', 'ok');
          await dessinerFil(app);
        } catch (err) {
          toast(err.message, 'err');
        }
      }),
  });
}

function confirmerSuppression(app, id) {
  ouvrirModale({
    titre: 'Supprimer la publication ?',
    corpsHTML: '<p>Cette publication sera définitivement supprimée.</p>',
    piedHTML: `<button class="bouton bouton--fantome" data-fermer>Annuler</button><button class="bouton bouton--danger" id="sup-ok">Supprimer</button>`,
    onMonte: (fond) =>
      fond.querySelector('#sup-ok').addEventListener('click', async () => {
        try {
          await requete(`/api/publications/${id}`, { method: 'DELETE' });
          fermerModale();
          toast('Supprimé', 'ok');
          await dessinerFil(app);
        } catch (err) {
          toast(err.message, 'err');
        }
      }),
  });
}
