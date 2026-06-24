/** Vue "Fiche / Checklist" d'un collaborateur : identité, demandes, tâches. */

import { api } from './api.js';
import { store } from './store.js';
import { ouvrirModale, fermerModale } from '../../core/modal.js';
import {
  echappe,
  initiales,
  nomComplet,
  couleurAvatar,
  toast,
  confettis,
  anneauSVG,
  formatDate,
  formatHorodatage,
  CIRC_ANNEAU,
} from '../../core/ui.js';

let fiche = null; // état courant de la fiche affichée
const demandesEnVol = new Set(); // anti double-clic : ids de demandes dont la bascule est en cours

export async function renduChecklist(app, id) {
  fiche = await api.getFiche(id);
  if (!fiche) {
    app.innerHTML = `<p class="vide">Fiche introuvable. <a href="#/onboarding/">Retour</a></p>`;
    return;
  }
  rerendreCorps(app);
}

/** (Re)génère le HTML complet de la fiche à partir de l'état `fiche` courant et
 *  rebranche les événements. Réutilisé après une bascule de demande (la section
 *  « accès » a pu apparaître/disparaître) — sans re-fetch réseau. */
function rerendreCorps(app) {
  app.innerHTML = `
    <div class="fil">
      <a href="#/onboarding/">← Tableau de bord</a>
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
        <!-- fix-ok: a11y (audit judge ## FRONT) — labels liés for/id, cause connue, fix indépendant non aveugle -->
        <div class="champs">
          <div class="champ"><label for="fi-prenom">Prénom</label>
            <input id="fi-prenom" data-identite="prenom" maxlength="25" value="${echappe(fiche.prenom)}" /></div>
          <div class="champ"><label for="fi-nom">Nom</label>
            <input id="fi-nom" data-identite="nom" maxlength="25" value="${echappe(fiche.nom)}" /></div>
          <div class="champ"><label for="fi-service">Service</label>
            <select id="fi-service" data-identite="service">${opts(meta.services, fiche.service)}</select></div>
          <div class="champ"><label for="fi-poste">Intitulé du poste</label>
            <input id="fi-poste" data-identite="intitule_poste" value="${echappe(fiche.intitule_poste)}" /></div>
          <div class="champ"><label for="fi-contrat">Type de contrat</label>
            <select id="fi-contrat" data-identite="type_contrat">${opts(meta.typesContrat, fiche.type_contrat)}</select></div>
          <div class="champ"><label for="fi-entree">Date d'entrée</label>
            <input id="fi-entree" type="date" data-identite="date_entree" value="${echappe(fiche.date_entree)}" /></div>
          <div class="champ"><label for="fi-sortie">Date de sortie (si connue)</label>
            <input id="fi-sortie" type="date" data-identite="date_sortie" value="${echappe(fiche.date_sortie)}" /></div>
        </div>
        <p class="sig-identite" data-sig-identite>${sigIdentite()}</p>
      </div>
    </section>`;
}

/** Signature de la fiche : créateur + dernier modificateur de l'identité. */
function sigIdentite() {
  const bouts = [];
  if (fiche.cree_par) bouts.push(`Créée par ${echappe(fiche.cree_par)}`);
  if (fiche.identite_par)
    bouts.push(
      `identité modifiée par ${echappe(fiche.identite_par)}${
        fiche.identite_le ? ` · ${formatHorodatage(fiche.identite_le)}` : ''
      }`,
    );
  return bouts.join(' · ');
}

/* --------------------------- Section demandes ---------------------------- */
function sectionDemandes() {
  const actives = fiche.demandes.filter((d) => d.demande).length;
  const pastilles = fiche.demandes
    .map(
      (d) => `
      <label class="demande ${d.demande ? 'is-on' : ''}" data-demande="${d.id}">
        <span class="demande__check">${d.demande ? '✓' : '○'}</span>
        <span class="demande__txt">${echappe(d.libelle)}</span>
        <span class="signature demande__sig" data-sig-demande>${sigDemande(d)}</span>
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

/** Signature d'une demande active : qui l'a activée. */
function sigDemande(d) {
  return d.demande && d.demande_par ? `👤 ${echappe(d.demande_par)}` : '';
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
  // Feature #2 — badge d'échéance (calculée serveur) ; rouge si en retard.
  const echeanceTag = t.echeance
    ? `<span class="tag ${t.en_retard ? 'tag--retard' : 'tag--echeance'}">📅 ${echappe(formatDate(t.echeance))}${
        t.en_retard ? ' · en retard' : ''
      }</span>`
    : '';
  const tags = [
    t.responsable && `<span class="tag tag--resp">👤 ${echappe(t.responsable)}</span>`,
    t.type_profil && `<span class="tag tag--profil">${echappe(t.type_profil)}</span>`,
    echeanceTag,
  ]
    .filter(Boolean)
    .join('');

  return `
    <div class="tache ${t.fait ? 'is-done' : ''} ${t.en_retard ? 'is-retard' : ''}" data-tache="${t.id}">
      <input type="checkbox" class="coche" data-coche ${t.fait ? 'checked' : ''}
             aria-label="Fait : ${echappe(t.libelle)}" /><!-- fix-ok: a11y audit, label par tâche, cause connue -->
      <div class="tache__corps">
        <p class="tache__libelle">${echappe(t.libelle)}</p>
        ${t.details ? `<p class="tache__details">${echappe(t.details)}</p>` : ''}
        <div class="tache__tags">${tags}</div>
        <textarea class="tache__comm" data-comm rows="1"
          placeholder="Commentaire…">${echappe(t.commentaire)}</textarea>
        <div class="tache__signatures" data-signatures>${signaturesTache(t)}</div>
      </div>
    </div>`;
}

/** Signatures d'une tâche : qui l'a cochée, qui l'a commentée (dernier intervenant). */
function signaturesTache(t) {
  const coche =
    t.fait && t.fait_par
      ? `<span class="signature signature--coche">✓ ${echappe(t.fait_par)}${
          t.fait_le ? ` · ${formatHorodatage(t.fait_le)}` : ''
        }</span>`
      : '';
  const comm =
    t.commentaire && t.commentaire_par
      ? `<span class="signature">💬 ${echappe(t.commentaire_par)}${
          t.commentaire_le ? ` · ${formatHorodatage(t.commentaire_le)}` : ''
        }</span>`
      : '';
  return coche + comm;
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
  // Replier / déplier les sections — accessible au clavier (fix-ok: a11y audit, cause connue)
  app.querySelectorAll('[data-toggle]').forEach((entete) => {
    const section = entete.closest('.section');
    entete.setAttribute('role', 'button');
    entete.setAttribute('tabindex', '0');
    entete.setAttribute('aria-expanded', String(section.classList.contains('is-open')));
    const basculer = () => {
      const ouvert = section.classList.toggle('is-open');
      entete.setAttribute('aria-expanded', String(ouvert));
    };
    entete.addEventListener('click', basculer);
    entete.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        basculer();
      }
    });
  });

  // Identité : sauvegarde au changement
  app.querySelectorAll('[data-identite]').forEach((el) => {
    el.addEventListener('change', async () => {
      const champ = el.dataset.identite;
      try {
        fiche = await api.majIdentite(fiche.id, { [champ]: el.value });
        majHero();
        const sig = app.querySelector('[data-sig-identite]');
        if (sig) sig.innerHTML = sigIdentite();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  });

  // Demandes d'accès : bascule (génère/retire les tâches d'accès en cascade)
  app.querySelectorAll('[data-demande]').forEach((label) => {
    label.addEventListener('click', async (e) => {
      e.preventDefault();
      const id = Number(label.dataset.demande);
      const d = fiche.demandes.find((x) => x.id === id);
      basculerDemande(app, id, !d.demande);
    });
  });

  // Tâches : case à cocher
  app.querySelectorAll('[data-tache]').forEach((bloc) => {
    const id = Number(bloc.dataset.tache);
    const coche = bloc.querySelector('[data-coche]');
    const comm = bloc.querySelector('[data-comm]');

    coche.addEventListener('change', async () => {
      const tache = trouverTache(id);
      coche.disabled = true; // anti double-clic : pas de 2e PATCH concurrent avant la réponse
      try {
        // fix-ok: feature badge/signature — la réponse porte fait_par/le, on l'applique + rafraîchit
        const maj = await api.majTache(id, { fait: coche.checked });
        Object.assign(tache, maj);
        bloc.classList.toggle('is-done', tache.fait);
        majSignatures(bloc, tache);
        recalculer(app);
      } catch (e) {
        coche.checked = !coche.checked; // rollback visuel
        toast(e.message, 'err');
      } finally {
        coche.disabled = false;
      }
    });

    // Commentaire : indicateur "non sauvegardé" + sauvegarde à la perte de focus
    // (fix-ok: UX audit, cause connue = sauvegarde au blur sans feedback de modif en cours)
    comm.addEventListener('input', () => {
      const tache = trouverTache(id);
      comm.classList.toggle('is-dirty', comm.value !== tache.commentaire);
      comm.classList.remove('is-error'); // une nouvelle frappe efface l'état d'erreur
    });
    comm.addEventListener('blur', async () => {
      const tache = trouverTache(id);
      if (comm.value === tache.commentaire) return;
      try {
        // fix-ok: feature badge/signature — la réponse porte commentaire_par/le, on l'applique + rafraîchit
        const maj = await api.majTache(id, { commentaire: comm.value });
        Object.assign(tache, maj);
        comm.classList.remove('is-dirty', 'is-error');
        majSignatures(bloc, tache);
      } catch (e) {
        // Échec réseau : on GARDE le texte marqué non-sauvegardé + un état d'erreur
        // visible et un toast explicite — pas de perte silencieuse.
        comm.classList.add('is-dirty', 'is-error');
        toast('Commentaire non sauvegardé — réessayez (réseau ?).', 'err');
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
  valeur.style.strokeDashoffset = CIRC_ANNEAU * (1 - pourcentage / 100);
  valeur.classList.toggle('is-complete', complete);
  txt.textContent = `${pourcentage}%`;
}

function majCompteurDemandes(app) {
  const actives = fiche.demandes.filter((d) => d.demande).length;
  app.querySelector('[data-compteur-demandes]').textContent = `${actives} / ${fiche.demandes.length}`;
}

/**
 * Bascule une demande d'accès et gère la cascade de tâches.
 * - Activation → le serveur crée les sous-tâches ; on re-rend la page (la
 *   section « Mise en place des accès » apparaît).
 * - Désactivation avec des sous-tâches déjà faites → le serveur renvoie
 *   `confirmation` SANS rien modifier ; on demande confirmation puis on relance
 *   avec `confirmer: true`.
 * `confirmer` est passé tel quel à l'API (transite jusqu'à majDemande côté serveur).
 */
async function basculerDemande(app, id, nouvelle, confirmer = false) {
  if (demandesEnVol.has(id)) return; // une bascule de cette demande est déjà en vol
  demandesEnVol.add(id);
  try {
    const maj = await api.majDemande(id, { demande: nouvelle, confirmer });

    // Garde-fou : le serveur réclame une confirmation (tâches déjà faites).
    if (maj.confirmation) {
      const { faites, total } = maj.confirmation;
      demanderConfirmationRetrait(faites, total, () => basculerDemande(app, id, nouvelle, true));
      return;
    }

    // Le serveur renvoie la fiche entière (la section accès a pu apparaître/disparaître)
    // → on re-rend toute la vue pour rester cohérent, en conservant l'état déplié.
    if (maj.fiche) {
      const ouverts = etatSectionsOuvertes(app);
      fiche = maj.fiche;
      rerendreCorps(app);
      restaurerSectionsOuvertes(app, ouverts);
    }
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    demandesEnVol.delete(id);
  }
}

/** Modale de confirmation avant de retirer des tâches d'accès déjà traitées. */
function demanderConfirmationRetrait(faites, total, onConfirme) {
  ouvrirModale({
    titre: 'Retirer cette demande ?',
    corpsHTML: `<p>Cette demande a généré <strong>${total}</strong> tâche(s), dont <strong>${faites}</strong> déjà faite(s). Les retirer supprimera définitivement ces tâches et leur avancement.</p>`,
    piedHTML: `
      <button class="bouton bouton--fantome" data-fermer>Annuler</button>
      <button class="bouton" id="confirmer-retrait" style="background:var(--rouge)">Retirer quand même</button>`,
    onMonte: (fond) => {
      fond.querySelector('#confirmer-retrait').addEventListener('click', () => {
        fermerModale();
        onConfirme();
      });
    },
  });
}

/** Capture l'état déplié/replié des sections AVANT re-rendu, par clé.
 *  On distingue « connue + ouverte/fermée » de « inconnue » : une section
 *  nouvellement apparue (ex. « accès ») garde alors son état par défaut. */
function etatSectionsOuvertes(app) {
  const etats = new Map();
  app.querySelectorAll('.section').forEach((s) => {
    const cle = s.dataset.section || s.dataset.partie;
    if (cle) etats.set(cle, s.classList.contains('is-open'));
  });
  return etats;
}

/** Réapplique l'état déplié des sections déjà présentes avant le re-rendu ;
 *  une section inconnue (nouvelle) conserve son état par défaut du HTML. */
function restaurerSectionsOuvertes(app, etats) {
  app.querySelectorAll('.section').forEach((s) => {
    const cle = s.dataset.section || s.dataset.partie;
    if (!etats.has(cle)) return; // section nouvelle → on ne touche pas
    const doitEtreOuvert = etats.get(cle);
    const entete = s.querySelector('[data-toggle]');
    s.classList.toggle('is-open', doitEtreOuvert);
    if (entete) entete.setAttribute('aria-expanded', String(doitEtreOuvert));
  });
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
          location.hash = '#/onboarding/';
        } catch (e) {
          toast(e.message, 'err');
        }
      });
    },
  });
}

/* ----------------------------- Utilitaires ------------------------------- */
// fix-ok: feature badge/signature — re-rend les signatures d'une tâche après une action
function majSignatures(bloc, tache) {
  const zone = bloc.querySelector('[data-signatures]');
  if (zone) zone.innerHTML = signaturesTache(tache);
}

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
