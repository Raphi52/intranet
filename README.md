# 🚀 Portail Amitel

Portail web **interne** d'Amitel : un point d'entrée unique, **derrière authentification**,
qui regroupe l'onboarding des nouveaux collaborateurs, un système de tickets, un mur de
publications, des événements et la gestion des comptes. SPA légère **sans build**, aux
couleurs de l'entreprise, avec **mode clair / sombre**.

![Charte : rouge amitel + gris ardoise](https://img.shields.io/badge/charte-amitel-C0392B)

## ✨ Modules

- 🏠 **Accueil** — grille des sections + **mur de publications** (annonces internes : titre +
  texte ; création par tout utilisateur connecté ; édition/suppression par l'auteur ou un admin ;
  épinglage admin).
- 🚀 **Onboarding** — checklist interactive d'accueil (remplace l'Excel) : fiche identité,
  demandes d'accès à anticiper, les **4 parties** (🗂️ Administratif → ⚙️ Exploitation →
  💶 Comptabilité → ⚖️ Judiciaire), cases à cocher, commentaires, barres/anneau de progression,
  **confettis** 🎉 à 100 %. Sauvegarde immédiate (pas de bouton « Enregistrer »).
- 🎫 **Tickets** — gestion type Jira **multi-projets** : tableau (board) par statut, priorités +
  **échéance SLA**, commentaires, historique, assignation. Projets **privés** réservés aux membres.
  **Édition, réassignation et suppression réservées au créateur du ticket (ou à un admin).**
- 📅 **Événements** — création d'événements + inscription/désinscription en 1 clic, **compteur et
  liste des participants**.
- 👥 **Comptes** *(admin)* — création et gestion des comptes utilisateurs (= registre des personnes
  assignables aux tickets).
- 📚 **Docs internes** — base de connaissances *(en cours)*.
- 🔔 **Notifications** — **cloche** dans la barre latérale (badge de non-lus) : nouvelle publication,
  nouvel événement, ou ticket qui **vous** est assigné.

## 🔐 Authentification & accès

- **Login obligatoire** (e-mail + mot de passe) pour accéder à tout le portail ; **sessions
  vérifiées côté serveur** (cookie HttpOnly), mots de passe hachés (**scrypt**).
- **Comptes provisionnés par un admin** ; rôles **admin** / **membre**. Le premier admin est
  amorcé via les variables `ADMIN_EMAIL` / `ADMIN_PASSWORD` (sinon mot de passe aléatoire affiché
  une fois dans les logs).
- Accès aux **projets privés** par **appartenance explicite**, appliquée par identité vérifiée.

## 🎨 Interface

- **Barre latérale gauche rétractable** : icônes repliées, libellés au survol ; **logo + cloche de
  notifications** dans l'en-tête.
- **Mode clair / sombre** mémorisé, direction graphique « Linéaire » (sobre, précise), charte
  **rouge amitel**.

## 🧱 Stack technique

| Élément  | Choix |
|----------|-------|
| Backend  | Node.js + Express (modules ES) |
| Base     | SQLite (`better-sqlite3`), fichier `data/onboarding.db` |
| Frontend | HTML / CSS / JavaScript (modules ES) — **SPA à routeur par hash, sans build** |
| Polices  | Poppins + Inter (Google Fonts, repli système) |

Aucune étape de compilation : Express sert directement `public/`.

## ▶️ Démarrage (développement)

Prérequis : **Node.js ≥ 18**.

```bash
npm install      # installe les dépendances (compile SQLite)
npm start        # démarre le serveur -> http://localhost:3000
```

Au premier lancement, définissez le compte admin (sinon un mot de passe aléatoire est affiché
dans la console) :

```bash
ADMIN_EMAIL=admin@amitel.fr ADMIN_PASSWORD=un-mot-de-passe npm start
```

> `npm run dev` redémarre automatiquement à chaque modification. Port configurable via `PORT`.

## 🐳 Déploiement Docker

Conteneur **autonome** : une commande build l'image (better-sqlite3 compilé dans un stage
jetable, runtime léger **non-root**) et démarre l'app, base persistée dans un volume nommé.

```bash
cp .env.example .env              # renseigner ADMIN_EMAIL / ADMIN_PASSWORD
docker compose up -d --build      # build + démarrage -> http://localhost:8080
```

📘 **Guide d'installation / déploiement complet (serveur, `.env`, exploitation, sauvegarde,
dépannage) : [INSTALLATION.md](INSTALLATION.md).**

## 🗂️ Architecture (modulaire)

Le serveur ne connaît **aucune section en propre** : il met en place le socle commun (auth,
JSON, statiques, SPA) puis monte **toutes les sections déclarées**. Ajouter une section =
un dossier serveur + un manifeste front + 1 ligne dans chaque registre.

```
server/
  core/        # db, auth (+ auth-routes), notifications (+ notif-routes)
  sections/    # onboarding, ticketing, publications, evenements, docs (+ index.js = registre)
  index.js     # shell : sécurité + middleware auth -> monte les sections
public/
  js/core/     # app (routeur + shell), http, identite, ui, modal, home, cloche
  js/sections/ # une vue par section (onboarding, ticketing, evenements, admin, docs)
  css/styles.css
tools/         # smoke.mjs, test-migration.mjs, ui-capture.mjs (vérification)
data/          # base SQLite générée ici (non versionnée)
```

Le contenu « métier » de l'onboarding (parties, demandes d'accès, tâches par service) est
centralisé dans **`server/sections/onboarding/template.js`**.

## ✅ Vérification

```bash
npm run smoke               # assertions HTTP de bout en bout (parcours réel derrière l'auth)
node tools/ui-capture.mjs   # captures d'écran clair + sombre -> tools/captures/
```

## 💾 Données

Tout est dans `data/onboarding.db` (en Docker : volume **`portail-amitel_portail-data`**).
Sauvegarde : copier le fichier (dev) ou le volume (Docker — commandes dans
[INSTALLATION.md](INSTALLATION.md)).
