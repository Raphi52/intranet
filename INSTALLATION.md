# 🚀 Installation & déploiement — Portail Amitel

Guide pour mettre le **Portail Amitel** en service sur un serveur, via **Docker**.
Tout est conteneurisé : une seule commande build l'image et démarre l'application,
avec sa base de données persistée. Pas de Node, pas de dépendances à installer à la main.

> Procédure **vérifiée** de bout en bout (build, démarrage, connexion admin, persistance des données après redémarrage).

---

## 1. Prérequis

| Cible | À installer |
|-------|-------------|
| **Serveur Linux** (recommandé) | **Docker Engine** + plugin **Docker Compose** (`docker compose version` doit répondre). Rien d'autre. |
| **Windows** (Server / 10 / 11) | **Docker Desktop** + **WSL2** activé. Si WSL2 manque : PowerShell **administrateur** → `wsl --install` → **redémarrer** → lancer Docker Desktop et attendre l'icône baleine **verte** (« Engine running »). |

Aucune autre dépendance (la base est du **SQLite** embarqué, compilé dans l'image).

---

## 2. Installation (4 étapes)

```bash
# 1) Récupérer le code
git clone https://github.com/Raphi52/intranet.git portail-amitel
cd portail-amitel

# 2) Configurer le compte administrateur initial + le port
cp .env.example .env
#    puis éditer .env : ADMIN_EMAIL, ADMIN_PASSWORD (obligatoire), HOST_PORT, TZ

# 3) Construire l'image et démarrer (en arrière-plan)
docker compose up -d --build

# 4) Vérifier que c'est en route
docker compose ps          # le conteneur "portail-amitel" doit être "Up ... (healthy)"
```

Ouvrir ensuite **http://<adresse-du-serveur>:8080** (ou le `HOST_PORT` choisi).

### Contenu du `.env`

```env
# Compte administrateur créé au TOUT PREMIER démarrage (base vide).
ADMIN_EMAIL=admin@amitel.fr
ADMIN_PASSWORD=un-mot-de-passe-solide      # ← à définir absolument

# Réseau / divers
HOST_PORT=8080            # port publié sur le serveur (interne : 3000)
TZ=Europe/Paris           # fuseau pour l'horodatage (la base reste en UTC)
```

> ⚠️ Si `ADMIN_PASSWORD` n'est pas défini, un mot de passe **aléatoire** est généré et
> affiché **une seule fois** dans les logs (`docker compose logs | grep ADMIN_PASSWORD`).

---

## 3. Première connexion

1. Aller sur `http://<serveur>:8080`.
2. Se connecter avec l'`ADMIN_EMAIL` / `ADMIN_PASSWORD` définis dans `.env`.
3. L'application demande de **changer le mot de passe** à la première connexion.
4. Créer les autres comptes (collègues) via la section **Comptes** — c'est l'admin qui provisionne les accès.

> La base de départ est **vide** (hors le compte admin) : c'est voulu, pour repartir propre.
> Pour importer des données existantes, voir « Reprendre une base existante » plus bas.

---

## 4. Exploitation au quotidien

```bash
docker compose logs -f            # suivre les logs en direct
docker compose ps                 # état + santé du conteneur
docker compose restart            # redémarrer l'application
docker compose stop               # arrêter (données conservées)
docker compose up -d              # relancer
```

### Mettre à jour l'application

```bash
git pull                          # récupérer la dernière version du code
docker compose up -d --build      # reconstruire + redémarrer (données conservées)
```

### Sauvegarde / restauration de la base

La base vit dans le **volume Docker `portail-amitel_portail-data`** (elle survit aux
redémarrages, recréations et mises à jour du conteneur).

```bash
# Sauvegarde -> sauvegarde-portail.tgz (dans le dossier courant)
docker run --rm -v portail-amitel_portail-data:/data -v "$PWD":/sortie alpine \
  tar czf /sortie/sauvegarde-portail.tgz -C /data .

# Restauration depuis sauvegarde-portail.tgz
docker run --rm -v portail-amitel_portail-data:/data -v "$PWD":/sortie alpine \
  tar xzf /sortie/sauvegarde-portail.tgz -C /data
```

> 🛑 `docker compose down -v` **supprime** le volume → **perte des données**.
> Utiliser `docker compose down` (sans `-v`) pour arrêter sans rien perdre.

---

## 5. Dans Docker Desktop

L'application apparaît dans l'onglet **Containers** sous le groupe **`portail-amitel`**
(son propre conteneur, son volume, son port) — elle **coexiste** avec vos autres
applications Docker sans interférer.

---

## 6. Dépannage

| Symptôme | Cause / solution |
|----------|------------------|
| `docker compose` : « cannot connect to the Docker daemon » | Le moteur n'est pas démarré. Linux : `sudo systemctl start docker`. Windows : lancer Docker Desktop, attendre la baleine verte. |
| Windows : « Le Sous-système Windows pour Linux n'est pas installé » | PowerShell admin → `wsl --install` → redémarrer → relancer Docker Desktop. |
| Le port 8080 est déjà pris | Changer `HOST_PORT` dans `.env` (ex. `HOST_PORT=9000`) puis `docker compose up -d`. |
| Mot de passe admin inconnu (base neuve, `.env` non rempli) | `docker compose logs \| grep -i ADMIN_PASSWORD` (affiché une fois au 1er démarrage). |
| Le conteneur reste « unhealthy » | `docker compose logs` pour voir l'erreur applicative ; vérifier que le port interne 3000 répond. |
| Repartir d'une base totalement vierge | `docker compose down -v` (⚠️ efface les données) puis `docker compose up -d --build`. |

---

## 7. Reprendre une base existante (optionnel)

Pour démarrer le conteneur avec une base SQLite déjà remplie (ex. base de test
`data/onboarding.db`), copiez-la dans le volume **avant** ou **après** le 1er démarrage :

```bash
# Conteneur arrêté, volume créé : injecter une base existante
docker run --rm -v portail-amitel_portail-data:/data -v "$PWD/data":/src alpine \
  cp /src/onboarding.db /data/onboarding.db
docker compose up -d
```

---

## 8. Déployer avec Claude Code (optionnel)

Le dépôt est **autoportant** : aucune configuration cachée, tout est dans le repo +
le `.env`. Pour déléguer le déploiement à Claude Code, ouvrir Claude dans le dossier
du dépôt et lui donner par exemple :

> « Déploie ce projet en Docker : copie `.env.example` en `.env`, mets `ADMIN_EMAIL` et
> `ADMIN_PASSWORD`, lance `docker compose up -d --build`, vérifie que le conteneur est
> *healthy* et que `http://localhost:8080` répond, puis confirme que je peux me connecter
> en admin. »

Claude suivra exactement les étapes de ce guide.

---

## 🔁 Déploiement automatisé (CI/CD Azure DevOps)

Le dépôt fournit un pipeline **`azure-pipelines.yml`** (3 stages) :

1. **Build & tests** — `npm ci` (compile better-sqlite3) + `npm run smoke` (parcours HTTP).
   *(Pas de build front : SPA vanilla servie par Express.)*
2. **Image → ACR** — build de l'image Docker (Dockerfile multi-stage) + push vers l'**Azure Container Registry**.
3. **Déploiement** — connexion **SSH** au serveur, qui **tire l'image depuis l'ACR** et (re)démarre
   via **`docker-compose.prod.yml`** — le serveur n'a **pas les sources**, seulement l'image + le compose.

**Côté serveur (une fois)** : Docker installé + un dossier de déploiement. Le pipeline y dépose
`docker-compose.prod.yml` et un `.env` (généré depuis les secrets) à chaque déploiement.

**À configurer dans Azure DevOps** (détaillé en tête de `azure-pipelines.yml`) :
- une **service connection** « Docker Registry » vers l'ACR (`dockerRegistryServiceConnection`) ;
- variables : `acrLoginServer`, `deployHost`, `deployUser`, `deployDir`, `hostPort` ;
- **secrets** : `sshPrivateKey`, `acrUsername`, `acrPassword`, `adminEmail`, `adminPassword`.

Le conteneur tourne dans le **projet Docker `portail-amitel`** (regroupé et isolé des autres projets).

> Le mode manuel (§2, `docker compose up -d --build` depuis les sources) reste valable pour un test
> local ou un déploiement ponctuel sans CI/CD.

## Récapitulatif technique

| Élément | Valeur |
|---------|--------|
| Image | multi-stage `node:20-bookworm-slim`, exécutée en **non-root** ; `better-sqlite3` compilé à l'intérieur |
| Port | `HOST_PORT` (défaut **8080**) → **3000** dans le conteneur |
| Données | volume nommé **`portail-amitel_portail-data`** monté sur `/app/data` (SQLite `onboarding.db`) |
| Variables `.env` | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `HOST_PORT`, `TZ` |
| Santé | `HEALTHCHECK` HTTP intégré ; `restart: unless-stopped` |
| Réseau | HTTP simple sur le port publié — TLS/HTTPS à assurer par un reverse proxy en amont |
