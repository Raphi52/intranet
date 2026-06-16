/** Vue "Fiche / Checklist" d'un collaborateur : identité, demandes, tâches. */

import { api } from '../api.js';
import { store } from '../store.js';
import { ouvrirModale, fermerModale } from '../modal.js';
import {
  echappe,
  initiales,
  nomComplet,
  couleurAvatar,
  toast,
  confettis,
  anneauSVG,
} from '../ui.js';

let fiche = null; // état courant de la fiche affichée
const RAYON = 40;
const CIRC = 2 * Math.PI * RAYON;

export async function renduChecklist(app, id) {
  fiche = await api.getFiche(id);
  if (!fiche) {
    app.innerHTML = `<p class="vide">Fiche introuvable. <a href="#/">Retour</a></p>`;
    return;
  }

  app.innerHTML = `
    <div class="fil">
      <a href="#/">← Tableau de bord</a>
    </div>
    ${heroHTML()}
    ${sectionIdentite()}
    ${sectionDemandes()}
    ${fiche.parties.map((p) => sectionPartie(p) + relaisHTML(p)).join('')}
  `;

  brancherEvenements(app);
}

/* ----------------------------- Hero -------------------------------------- */
function heroHTML() {
  const { pourcentage, faites, total } = fiche.progression;
  const complete = total > 0 && faites === total;
  const couleur = couleurAvatar(nomComplet(fiche));
  return `
    <div class="fiche-hero">
      <div class="avatar fiche-hero__avatar" style="background:${couleur}">
        ${echappe(initiales(fiche.prenom, fiche.nom))}
      </div>
      <div class="fiche-hero__info">
        <h1 id="hero-nom">${echappe(nomComplet(fiche))}</h1>
        <p id="hero-sous">${echappe(sousTitreHero())}</p>
      </div>
      <div id="hero-anneau">${anneauSVG(pourcentage, complete)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="bouton bouton--fantome bouton--sm" id="btn-imprimer">🖨️ Imprimer</button>
        <button class="bouton bouton--danger bouton--sm" id="btn-supprimer">🗑️ Supprimer</button>
      </div>
    </div>`;
}

function sousTitreHero() {
  const bouts = [
    fiche.intitule_poste,
    fiche.service,
    fiche.type_contrat,
    fiche.date_entree && `arrivée le ${formatDate(fiche.date_entree)}`,
  ].filter(Boolean);
  return bouts.length ? bouts.join(' · ') : 'Complétez la fiche identité ci-dessous';
}

/* --------------------------- Section identité ---------------------------- */
function sectionIdentite() {
  const meta = store.meta;
  const opts = (liste, val) =>
    ['<option value="">— Choisir —</option>']
      .concat(
        liste.map(
          (o) =>
            `<option value="${echappe(o)}" ${o === val ? 'selected' : ''}>${echappe(o)}</option>`,
        ),
      )
      .join('');

  return `
    <section class="section is-open" data-section="identite">
      <div class="section__entete" data-toggle>
        <div class="section__icone">🪪</div>
        <div class="section__titre"><h2>Fiche identité</h2><small>Le nouveau collaborateur</small></div>
        <span class="section__chevron">▸</span>
      </div>
      <div class="section__corps">
        <div class="champs">
          <div class="champ"><label>Prénom</label>
            <input data-identite="prenom" value="${echappe(fiche.prenom)}" /></div>
          <div class="champ"><label>Nom</label>
            <input data-identite="nom" value="${echappe(fiche.nom)}" /></div>
          <div class="champ"><label>Service</label>
            <select data-identite="service">${opts(meta.services, fiche.service)}</select></div>
          <div class="champ"><label>Intitulé du poste</label>
            <input data-identite="intitule_poste" value="${echappe(fiche.intitule_poste)}" /></div>
          <div class="champ"><label>Type de contrat</label>
            <select data-identite="type_contrat">${opts(meta.typesContrat, fiche.type_contrat)}</select></div>
          <div class="champ"><label>Date d'entrée</label>
            <input type="date" data-identite="date_entree" value="${echappe(fiche.date_entree)}" /></div>
          <div class="champ"><label>Date de sortie (si connue)</label>
            <input type="date" data-identite="date_sortie" value="${echappe(fiche.date_sortie)}" /></div>
        </div>
      </div>
    </section>`;
}

/* --------------------------- Section demandes ---------------------------- */
function sectionDemandes() {
  const actives = fiche.demandes.filter((d) => d.demande).length;
  const pastilles = fiche.demandes
    .map(
      (d) => `
      <label class="demande ${d.demande ? 'is-on' : ''}" data-demande="${d.id}">
        <span class="demande__check">${d.demande ? '✓' : '○'}</span>
        <span>${echappe(d.libelle)}</span>
      </label>`,
    )
    .join('');

  return `
    <section class="section is-open" data-section="demandes">
      <div class="section__entete" data-toggle>
        <div class="section__icone">🔑</div>
        <div class="section__titre"><h2>Demandes d'accès</h2><small>À anticiper</small></div>
        <span class="section__compteur" data-compteur-demandes>${actives} / ${fiche.demandes.length}</span>
        <span class="section__chevron">▸</span>
      </div>
      <div class="section__corps">
        <div class="demandes">${pastilles}</div>
      </div>
    </section>`;
}

/* ---------------------------- Section partie ----------------------------- */
function sectionPartie(p) {
  const ouvert = !p.complete; // les parties terminées sont repliées
  const taches = p.taches.map(tacheHTML).join('');
  return `
    <section class="section ${ouvert ? 'is-open' : ''} ${p.complete ? 'is-complete' : ''}"
             data-partie="${p.cle}">
      <div class="section__entete" data-toggle>
        <div class="section__icone">${p.icone}</div>
        <div class="section__titre"><h2>${echappe(p.titre)}</h2><small>${echappe(p.sousTitre)}</small></div>
        <span class="section__mini-barre barre">
          <span class="barre__remplissage ${p.complete ? 'is-complete' : ''}"
                style="width:${pct(p.faites, p.total)}%"></span>
        </span>
        <span class="section__compteur" data-compteur>${p.faites} / ${p.total}</span>
        <span class="section__chevron">▸</span>
      </div>
      <div class="section__corps">
        <div class="taches">${taches}</div>
      </div>
    </section>`;
}

function tacheHTML(t) {
  const tags = [
    t.responsable && `<span class="tag tag--resp">👤 ${echappe(t.responsable)}</span>`,
    t.type_profil && `<span class="tag tag--profil">${echappe(t.type_profil)}</span>`,
  ]
    .filter(Boolean)
    .join('');

  return `
    <div class="tache ${t.fait ? 'is-done' : ''}" data-tache="${t.id}">
      <input type="checkbox" class="coche" data-coche ${t.fait ? 'checked' : ''}
             aria-label="Tâche faite" />
      <div class="tache__corps">
        <p class="tache__libelle">${echappe(t.libelle)}</p>
        ${t.details ? `<p class="tache__details">${echappe(t.details)}</p>` : ''}
        <div class="tache__tags">${tags}</div>
        <textarea class="tache__comm" data-comm rows="1"
          placeholder="Commentaire…">${echappe(t.commentaire)}</textarea>
      </div>
    </div>`;
}

/* ----------------------------- Relais ------------------------------------ */
function relaisHTML(p) {
  if (!p.relais) return '';
  return `
    <div class="relais ${p.complete ? 'is-active' : ''}" data-relais="${p.cle}">
      <span class="relais__icone">${p.complete ? '📣' : '⏳'}</span>
      <span>${echappe(p.relais)}</span>
    </div>`;
}

/* --------------------------- Événements ---------------------------------- */
function brancherEvenements(app) {
  // Replier / déplier les sections
  app.querySelectorAll('[data-toggle]').forEach((entete) => {
    entete.addEventListener('click', () => entete.closest('.section').classList.toggle('is-open'));
  });

  // Identité : sauvegarde au changement
  app.querySelectorAll('[data-identite]').forEach((el) => {
    el.addEventListener('change', async () => {
      const champ = el.dataset.identite;
      try {
        fiche = await api.majIdentite(fiche.id, { [champ]: el.value });
        majHero();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  });

  // Demandes d'accès : bascule
  app.querySelectorAll('[data-demande]').forEach((label) => {
    label.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = Number(label.dataset.demande);
      const d = fiche.demandes.find((x) => x.id === id);
      const nouvelle = !d.demande;
      try {
        await api.majDemande(id, { demande: nouvelle });
        d.demande = nouvelle;
        label.classList.toggle('is-on', nouvelle);
        label.querySelector('.demande__check').textContent = nouvelle ? '✓' : '○';
        majCompteurDemandes(app);
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });

  // Tâches : case à cocher
  app.querySelectorAll('[data-tache]').forEach((bloc) => {
    const id = Number(bloc.dataset.tache);
    const coche = bloc.querySelector('[data-coche]');
    const comm = bloc.querySelector('[data-comm]');

    coche.addEventListener('change', async () => {
      const tache = trouverTache(id);
      try {
        await api.majTache(id, { fait: coche.checked });
        tache.fait = coche.checked;
        bloc.classList.toggle('is-done', coche.checked);
        recalculer(app);
      } catch (e) {
        coche.checked = !coche.checked; // rollback visuel
        toast(e.message, 'err');
      }
    });

    // Commentaire : sauvegarde à la perte de focus
    comm.addEventListener('blur', async () => {
      const tache = trouverTache(id);
      if (comm.value === tache.commentaire) return;
      try {
        await api.majTache(id, { commentaire: comm.value });
        tache.commentaire = comm.value;
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  });

  app.querySelector('#btn-imprimer')?.addEventListener('click', () => window.print());
  app.querySelector('#btn-supprimer')?.addEventListener('click', confirmerSuppression);
}

/* --------------------------- Recalcul / MAJ ------------------------------ */
function recalculer(app) {
  const avant = fiche.progression.pourcentage;

  let totalFaites = 0;
  let total = 0;
  for (const p of fiche.parties) {
    p.faites = p.taches.filter((t) => t.fait).length;
    p.total = p.taches.length;
    p.complete = p.total > 0 && p.faites === p.total;
    totalFaites += p.faites;
    total += p.total;

    // Compteur + mini-barre de la section
    const section = app.querySelector(`[data-partie="${p.cle}"]`);
    if (section) {
      section.querySelector('[data-compteur]').textContent = `${p.faites} / ${p.total}`;
      const remp = section.querySelector('.section__mini-barre .barre__remplissage');
      remp.style.width = `${pct(p.faites, p.total)}%`;
      remp.classList.toggle('is-complete', p.complete);
      section.classList.toggle('is-complete', p.complete);
    }

    // Bannière de relais
    const relais = app.querySelector(`[data-relais="${p.cle}"]`);
    if (relais) {
      relais.classList.toggle('is-active', p.complete);
      relais.querySelector('.relais__icone').textContent = p.complete ? '📣' : '⏳';
    }
  }

  fiche.progression = {
    total,
    faites: totalFaites,
    pourcentage: total ? Math.round((totalFaites / total) * 100) : 0,
  };

  majAnneau(app, fiche.progression.pourcentage);

  // Célébration au passage à 100%
  if (fiche.progression.pourcentage === 100 && avant < 100) {
    confettis();
    toast('Onboarding terminé ! Bienvenue à bord 🎉', 'ok');
  }
}

function majAnneau(app, pourcentage) {
  const complete = pourcentage === 100;
  const cont = app.querySelector('#hero-anneau');
  const valeur = cont.querySelector('.anneau__valeur');
  const txt = cont.querySelector('.anneau__txt');
  valeur.style.strokeDashoffset = CIRC * (1 - pourcentage / 100);
  valeur.classList.toggle('is-complete', complete);
  txt.textContent = `${pourcentage}%`;
}

function majCompteurDemandes(app) {
  const actives = fiche.demandes.filter((d) => d.demande).length;
  app.querySelector('[data-compteur-demandes]').textContent = `${actives} / ${fiche.demandes.length}`;
}

function majHero() {
  document.getElementById('hero-nom').textContent = nomComplet(fiche);
  document.getElementById('hero-sous').textContent = sousTitreHero();
  const av = document.querySelector('.fiche-hero__avatar');
  av.textContent = initiales(fiche.prenom, fiche.nom);
  av.style.background = couleurAvatar(nomComplet(fiche));
}

/* --------------------------- Suppression --------------------------------- */
function confirmerSuppression() {
  ouvrirModale({
    titre: 'Supprimer la fiche ?',
    corpsHTML: `<p>La fiche de <strong>${echappe(nomComplet(fiche))}</strong> et toute sa progression seront définitivement supprimées.</p>`,
    piedHTML: `
      <button class="bouton bouton--fantome" data-fermer>Annuler</button>
      <button class="bouton" id="confirmer-suppr" style="background:var(--rouge)">Supprimer</button>`,
    onMonte: (fond) => {
      fond.querySelector('#confirmer-suppr').addEventListener('click', async () => {
        try {
          await api.supprimerCollaborateur(fiche.id);
          fermerModale();
          toast('Fiche supprimée.', 'ok');
          location.hash = '#/';
        } catch (e) {
          toast(e.message, 'err');
        }
      });
    },
  });
}

/* ----------------------------- Utilitaires ------------------------------- */
function trouverTache(id) {
  for (const p of fiche.parties) {
    const t = p.taches.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

function pct(faites, total) {
  return total ? Math.round((faites / total) * 100) : 0;
}

function formatDate(iso) {
  if (!iso) return '';
  const [a, m, j] = iso.split('-');
  return j && m && a ? `${j}/${m}/${a}` : iso;
}
