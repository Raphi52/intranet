# 🚀 Onboarding Amitel

Application web **ludique** pour l'accueil des nouveaux collaborateurs Amitel.
Elle remplace le fichier Excel « Checklist Nouveau Collaborateur » par une
checklist interactive, suivie en temps réel, aux couleurs de l'entreprise.

![Charte : rouge amitel + gris ardoise](https://img.shields.io/badge/charte-amitel-C0392B)

## ✨ Ce que fait l'application

- **Tableau de bord** : toutes les fiches d'onboarding en cours, avec leur taux
  d'avancement.
- **Fiche collaborateur** reprenant fidèlement l'Excel :
  - 🪪 **Fiche identité** (nom, prénom, service, dates, contrat, poste)
  - 🔑 **Demandes d'accès** à anticiper (SQL, EXPRESSO, téléphonie, MS365, ZenDesk, VPN, RA)
  - Les **4 parties** du parcours, dans l'ordre :
    🗂️ Administratif → ⚙️ Exploitation → 💶 Comptabilité → ⚖️ Judiciaire
  - Chaque tâche : case à cocher, intitulé, détails, responsable, type de profil, commentaire
- **Côté ludique** : barres et anneau de progression animés, sections qui se
  replient une fois terminées, bannières « Prévenir la partie suivante » qui
  s'allument, et **confettis** 🎉 quand l'onboarding atteint 100 %.
- **Sauvegarde automatique** : chaque coche, commentaire ou champ est enregistré
  immédiatement dans une base **SQLite** (pas de bouton « Enregistrer »).
- **Impression** : un onboarding peut être imprimé / exporté en PDF (bouton 🖨️).

## 🧱 Stack technique

| Élément   | Choix                                          |
|-----------|------------------------------------------------|
| Backend   | Node.js + Express                              |
| Base      | SQLite (`better-sqlite3`), fichier `data/onboarding.db` |
| Frontend  | HTML / CSS / JavaScript (modules ES), **sans build** |
| Polices   | Poppins + Inter (Google Fonts, repli système)  |

Aucune étape de compilation : le serveur Express sert directement le dossier
`public/`.

## ▶️ Démarrage

Prérequis : **Node.js ≥ 18** (testé sur Node 22).

```bash
npm install      # installe les dépendances (compile SQLite)
npm start        # démarre le serveur
```

Puis ouvrez **http://localhost:3000**.

> Astuce : `npm run dev` redémarre automatiquement à chaque modification.
> Le port peut être changé via la variable d'environnement `PORT`.

## 🐳 Docker

> 📘 **Guide d'installation / déploiement complet (pour mise en service serveur) :
> [INSTALLATION.md](INSTALLATION.md)** — prérequis, `.env`, exploitation, sauvegarde, dépannage.

Conteneur **autonome** (port publié), pensé pour coexister avec d'autres
conteneurs sur le serveur cible. Image multi-stage : `better-sqlite3` est compilé
dans un stage jetable, l'image finale reste légère et tourne en **non-root**.

```bash
docker compose up -d --build        # build + démarrage (port 8080)
HOST_PORT=9000 docker compose up -d  # publier sur un autre port hôte
docker compose logs -f               # suivre les logs
docker compose down                  # arrêter (la base est CONSERVÉE)
```

> **Compte admin (une fois, avant le 1er `up`)** : copiez `.env.example` en
> `.env` et renseignez `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Sans cela, un mot de
> passe aléatoire est généré et visible via `docker compose logs`.

Puis ouvrez **http://localhost:8080** (ou `http://<serveur>:8080`).

- **Persistance** : la base SQLite vit dans le volume nommé **`portail-data`**
  (monté sur `/app/data`). Elle survit aux `down`/`up` et aux reconstructions.
- ⚠️ `docker compose down -v` **supprime** ce volume → perte des données.
- **Variables** : `HOST_PORT` (port hôte, défaut `8080`), `TZ` (fuseau, défaut
  `Europe/Paris`).

### Sauvegarde / restauration du volume

```bash
# Sauvegarde -> sauvegarde-portail.tgz
docker run --rm -v portail-data:/data -v "$PWD":/sortie alpine \
  tar czf /sortie/sauvegarde-portail.tgz -C /data .

# Restauration
docker run --rm -v portail-data:/data -v "$PWD":/sortie alpine \
  tar xzf /sortie/sauvegarde-portail.tgz -C /data
```

> Pour repartir d'une base existante (poste de dev → conteneur), remplacez le
> volume nommé par un bind-mount dans `docker-compose.yml` :
> `- ./data:/app/data`.

## 🗂️ Structure du projet

```
.
├── server/
│   ├── index.js      # serveur Express + API REST
│   ├── db.js         # base SQLite (schéma + requêtes)
│   └── template.js   # ⭐ contenu de la checklist (à personnaliser)
├── public/
│   ├── index.html
│   ├── css/styles.css
│   └── js/           # app (routeur), api, ui, modal, store + vues
└── data/             # base SQLite générée ici (non versionnée)
```

## ✏️ Personnaliser la checklist

Tout le contenu « métier » est centralisé dans **`server/template.js`** :
parties, demandes d'accès, et liste des tâches par service (avec responsable et
type de profil). Modifiez ce fichier pour faire évoluer la checklist commune.

> Les fiches **déjà créées** conservent leur propre copie des tâches ; seules les
> **nouvelles** fiches reflètent les modifications du modèle.

## 🔌 API REST (résumé)

| Méthode & route                     | Rôle                                   |
|-------------------------------------|----------------------------------------|
| `GET /api/meta`                     | Services, types de contrat, parties    |
| `GET /api/collaborateurs`           | Liste + progression                    |
| `POST /api/collaborateurs`          | Crée une fiche (+ checklist)           |
| `GET /api/collaborateurs/:id`       | Fiche complète                         |
| `PUT /api/collaborateurs/:id`       | Met à jour l'identité                  |
| `DELETE /api/collaborateurs/:id`    | Supprime une fiche                     |
| `PATCH /api/taches/:id`             | Coche une tâche / commentaire          |
| `PATCH /api/demandes/:id`           | Active une demande d'accès             |

## 💾 Sauvegarde des données

Toutes les données sont dans le fichier `data/onboarding.db`. Pour sauvegarder
ou transférer, copiez simplement ce fichier.
