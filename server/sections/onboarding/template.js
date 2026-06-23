/**
 * Modèle de checklist d'onboarding Amitel.
 *
 * Ce fichier décrit le contenu "vierge" de la fiche : la liste des demandes
 * d'accès et l'ensemble des tâches réparties par service. À la création d'un
 * nouveau collaborateur, ces éléments sont copiés dans la base SQLite pour
 * devenir SA checklist personnelle (qu'on peut ensuite cocher / commenter).
 *
 * 👉 Pour faire évoluer la checklist commune, il suffit de modifier ce fichier
 *    (les nouvelles fiches en tiendront compte ; les fiches déjà créées gardent
 *    leur propre copie).
 */

// fix-ok: scout #11 (sortir les valeurs en dur) + feature #2 (échéances) — édition
//          multi-points volontaire, cause connue (cadrage scout), pas un blind-fix.

// --- Config extraite (était codée en dur dans les libellés/détails) --------
// URL interne du Rapport d'Activité : centralisée ici (portabilité + plus
// d'adresse interne disséminée dans les chaînes de détails).
const RA_URL = 'ra.intranet.com';
// Personne physique récurrente : un changement de nom ne doit plus être silencieux.
const RESP_RH = 'Laurence';

// Les 4 grandes étapes de l'onboarding, dans l'ordre du parcours.
export const PARTIES = [
  {
    cle: 'administratif',
    titre: 'Administratif',
    icone: '🗂️',
    sousTitre: 'Direction & RH',
    relais: "Prévenir la partie Exploitation !",
  },
  {
    cle: 'exploitation',
    titre: 'Exploitation',
    icone: '⚙️',
    sousTitre: 'IT / Système',
    relais: "Prévenir la partie Comptabilité !",
  },
  {
    cle: 'comptabilite',
    titre: 'Comptabilité',
    icone: '💶',
    sousTitre: 'Finance & formations',
    relais: "Prévenir la partie Judiciaire !",
  },
  {
    cle: 'judiciaire',
    titre: 'Judiciaire',
    icone: '⚖️',
    sousTitre: 'Métier & développement',
    relais: null,
  },
];

// Demandes d'information / d'accès à anticiper (cases à cocher de l'entête).
export const DEMANDES = [
  "Droit d'accès SQL RW / DB Prod",
  'Accès EXPRESSO',
  'Téléphonie Unified & Teams Phone',
  'Licence MS365 Standard',
  'Accès ZenDesk',
  'Accès VPN',
  "Accès Rapport d'Activité (RA)",
];

// Section dédiée aux tâches générées par les demandes d'accès cochées.
// N'apparaît dans la fiche que si au moins une tâche d'accès existe.
export const PARTIE_ACCES = {
  cle: 'acces',
  titre: 'Mise en place des accès',
  icone: '🔑',
  sousTitre: 'Procédure issue des demandes cochées',
  relais: null,
};

// Responsable par défaut affecté aux tâches d'accès générées.
export const RESPONSABLE_ACCES = 'IT / SI';

/**
 * Mini-checklist GÉNÉRIQUE par demande d'accès : activer la demande crée ces
 * sous-tâches dans la section « Mise en place des accès » ; les désactiver les
 * retire. Clé = libellé EXACT de la demande (cf. DEMANDES ci-dessus).
 *
 * 👉 Contenu volontairement générique au départ : à peaufiner librement ici
 *    (les nouvelles bascules de demande en tiendront compte ; les tâches déjà
 *    créées gardent leur libellé jusqu'à un re-cochage).
 *
 * `defaut` sert de gabarit de repli si une demande n'a pas d'entrée dédiée.
 */
export const TACHES_ACCES = {
  defaut: [
    { libelle: 'Demander la création de l’accès' },
    { libelle: 'Configurer l’accès' },
    { libelle: 'Communiquer les identifiants au collaborateur' },
    { libelle: 'Vérifier le bon fonctionnement' },
  ],
};

/** Retourne le mini-checklist d'une demande (gabarit dédié ou `defaut`). */
export function tachesPourDemande(libelle) {
  return TACHES_ACCES[libelle] || TACHES_ACCES.defaut;
}

/**
 * Feature #2 — pilotage par le temps : échéance RELATIVE à la date d'entrée.
 * Clé = libellé EXACT d'une tâche ; valeur = décalage en jours (négatif = AVANT
 * l'arrivée, 0 = jour J, positif = après). Tâche absente = pas d'échéance.
 *
 * L'échéance réelle et le statut « en retard » sont calculés À LA LECTURE
 * (getFiche : date_entree + offset) — rien n'est figé en base. Donc ajuster ces
 * offsets reprojette toutes les fiches, y compris existantes.
 *
 * 👉 Volontairement restreint aux tâches sensibles au temps ; étendre ici.
 */
export const OFFSETS_TACHE = {
  'Valider le besoin matériel avec la direction': -7,
  'Valider et commander le poste de travail et les accessoires': -5,
  'Création du compte AD': 0,
  'Préparer la fiche d’identification et la transmettre': 0,
  'Faire signer la charte informatique': 1,
};

/** Décalage d'échéance (jours) d'une tâche, ou null si elle n'est pas datée. */
export function offsetPour(libelle) {
  return Object.prototype.hasOwnProperty.call(OFFSETS_TACHE, libelle)
    ? OFFSETS_TACHE[libelle]
    : null;
}

// Tâches par partie. type_profil n'est réellement utilisé que pour l'exploitation.
export const TACHES = {
  administratif: [
    {
      libelle: 'Valider le besoin matériel avec la direction',
      details:
        'Type de poste (PC/Mac), nombre d’écrans, dock, casque, clavier/souris, téléphone, autres besoins spécifiques.',
      responsable: 'Direction',
    },
    {
      libelle: 'Valider et commander le poste de travail et les accessoires',
      details:
        'Commande du PC/Mac, écran(s), dock, casque, clavier, souris, sacoche… S’assurer que tout sera livré à temps.',
      responsable: 'Direction',
    },
    {
      libelle: 'Acheter les licences spécifiques si nécessaires',
      details:
        'Licences de logiciels métier, outils payants particuliers, hors pack standard Office / Teams.',
      responsable: 'Direction',
    },
    {
      libelle: 'Faire signer la charte informatique',
      details: 'Charte signée par le collaborateur et archivée dans le dossier RH.',
      responsable: RESP_RH,
    },
    {
      libelle: 'Staff&Go',
      details: 'Création du compte Staff&Go.',
      responsable: RESP_RH,
    },
    {
      libelle: 'Faire signer le règlement intérieur',
      details:
        'Remise du règlement intérieur et signature de réception / prise de connaissance.',
      responsable: RESP_RH,
    },
  ],

  exploitation: [
    {
      libelle: 'Achat ou réhabilitation du matériel',
      details:
        'Attribuer un poste existant ou préparer un nouveau. Vérifier l’état matériel, nettoyage, accessoires présents. (Cf. procédure installation poste)',
      responsable: 'Exploitation',
      type_profil: 'Tous',
    },
    {
      libelle: 'Création du compte AD',
      details:
        'Créer le compte utilisateur AD dans la bonne UO, avec le bon modèle de nommage et les infos de base (service, poste, type de contrat, expiration compte…).',
      responsable: 'Exploitation',
      type_profil: 'Tous',
    },
    {
      libelle: 'Affectation des groupes de sécurité AD',
      details:
        'Ajouter l’utilisateur dans les groupes (DEVRIG, AMITEL…) adaptés : partages réseau, applis, etc.',
      responsable: 'Exploitation',
      type_profil: 'Tous',
    },
    {
      libelle: 'Création du compte Kerio',
      details: 'Créer le compte Kerio pour la messagerie, selon le modèle standard.',
      responsable: 'Exploitation',
      type_profil: 'Tous',
    },
    {
      libelle: 'Affectation des listes et groupes Kerio',
      details:
        'Ajouter l’utilisateur dans les listes de diffusion et groupes Kerio de son service / projet.',
      responsable: 'Exploitation',
      type_profil: 'Tous',
    },
    {
      libelle: 'Ajout de l’utilisateur dans l’annuaire Kerio',
      details: 'Mettre à jour l’annuaire interne : téléphone, email, fonction, service.',
      responsable: 'Exploitation',
      type_profil: 'Tous',
    },
    {
      libelle: 'Création du compte sur les bases RIG (habilitations)',
      details:
        'Créer le compte et les droits nécessaires sur les bases RIG selon le profil (via import XML) : dev, recette (prod à confirmer).',
      responsable: 'Exploitation / Référent applicatif',
      type_profil: 'RIG',
    },
    {
      libelle: 'Attribuer la licence MS365 Standard',
      details: 'Assigner la licence (MS365 Standard) au nouveau compte.',
      responsable: 'Exploitation',
      type_profil: 'Tous (à la demande)',
    },
    {
      libelle: 'Préparer la fiche MS365',
      details: 'Comprend les éléments de la licence Office.',
      responsable: 'Exploitation',
      type_profil: 'Tous (à la demande)',
    },
    {
      libelle:
        'Attribuer un numéro de téléphone dans Unified Connect (si nécessaire) + Licence Teams Phone',
      details: 'Créer ou associer un numéro de téléphone au collaborateur dans l’outil de téléphonie.',
      responsable: 'Exploitation',
      type_profil: 'À confirmer',
    },
    {
      libelle: 'Préparer la fiche d’identification et la transmettre',
      details:
        'Document récapitulatif : identifiant, adresse mail, mot de passe temporaire, infos VPN, téléphone, outils principaux.',
      responsable: 'Exploitation',
      type_profil: 'Tous',
    },
    {
      libelle: 'Ajouter l’utilisateur dans les groupes et équipes Teams',
      details: 'Ajouter aux équipes de son service, projets, réunions, groupes transverses.',
      responsable: 'Exploitation',
      type_profil: 'Tous (MS365)',
    },
    {
      libelle: 'Configurer Teams (profil utilisateur)',
      details:
        'Renseigner jours présentiel/distanciel, horaires de travail, fuseau horaire (GMT), etc. (avec l’utilisateur).',
      responsable: 'Exploitation / Utilisateur accompagné',
      type_profil: 'Tous (MS365)',
    },
    {
      libelle: 'Configurer le VPN nomade',
      details: 'Configurer le VPN pour le télétravail et transmettre la fiche d’installation.',
      responsable: 'Exploitation',
      type_profil: 'À confirmer',
    },
    {
      libelle: 'Droit SQL base RIG',
      details: 'Attribuer les droits d’accès SQL sur la base RIG.',
      responsable: 'Exploitation',
      type_profil: 'À confirmer',
    },
    {
      libelle: 'Configurer ZenDesk',
      details: 'Créer le compte ZenDesk, le rattacher à la bonne file et appliquer les bons droits.',
      responsable: 'Exploitation / Référent support',
      type_profil: 'À confirmer',
    },
    {
      libelle: 'Licence VS (DEV)',
      details: 'Attribution licence VS + CoPilote (trial 30j DEV).',
      responsable: 'Exploitation',
      // type_profil laissé vide : colonne « Type profil » vierge dans l'Excel pour cette ligne.
    },
    {
      libelle: 'Config. Rapport d’Activité (RA)',
      details:
        `Créer le compte sur ${RA_URL}. Associer le modèle d’heures et le service. Identifiants : calqués sur l’AD.`,
      // L'Excel place cette tâche sous la section Exploitation mais en attribue la
      // responsabilité au Judiciaire (et laisse la colonne « Type profil » vierge).
      responsable: 'Judiciaire',
    },
  ],

  comptabilite: [
    {
      libelle: 'Créer les accès EXPRESSO',
      details:
        'Créer le compte et donner les droits EXPRESSO en fonction du rôle du collaborateur.',
      responsable: 'Comptabilité',
    },
    {
      libelle: 'Planifier les formations nécessaires',
      details:
        'Formations outils internes (dont EXPRESSO), procédures comptables, process internes, sécurité…',
      responsable: 'Comptabilité',
    },
  ],

  judiciaire: [
    {
      libelle: 'Vérification et installation',
      details: 'Vérification de l’installation de son PC et installation des outils « judiciaire ».',
      responsable: 'Judiciaire',
    },
    {
      libelle: 'Présentation et formation',
      details: 'Présentation et formation du logiciel RIG + métier Judiciaire.',
      responsable: 'Judiciaire',
    },
    {
      libelle: 'Affecter les droits GIT',
      details: 'Affecter les droits Azure DevOps.',
      responsable: 'DEV',
    },
    {
      libelle: 'Affectation petit projet',
      details:
        'Affectation d’un petit projet judiciaire pour développer avec notre framework interne.',
      responsable: 'Judiciaire',
    },
    {
      libelle: 'Envoi des accès RA',
      details: 'Envoyer le mail de bienvenue avec le lien et les identifiants au collaborateur.',
      responsable: 'Judiciaire',
    },
  ],
};

// Liste des services proposés dans le formulaire (champ "Service").
export const SERVICES = [
  'Direction',
  'Exploitation',
  'Comptabilité',
  'Judiciaire',
  'Développement',
  'Support',
  'Commerce',
  'Autre',
];

// Types de contrat proposés dans le formulaire.
export const TYPES_CONTRAT = ['CDI', 'CDD', 'Alternance', 'Stage', 'Intérim', 'Freelance', 'Autre'];
