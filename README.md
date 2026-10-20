# 🌿 FlowReader

> **Le calme dans le chaos de l'information.**
> Un agrégateur RSS minimaliste, intelligent et économe, conçu pour ceux qui veulent reprendre le contrôle de leur veille.

![FlowReader Dashboard](https://placehold.co/800x450/1e1e1e/FFF?text=Aperçu+Dashboard)

[![Rust](https://img.shields.io/badge/Rust-stable-000000?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![React Version](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

## ✨ Pourquoi FlowReader ?

FlowReader n'est pas juste un autre lecteur RSS. C'est une expérience de lecture repensée pour l'efficacité et le plaisir. Fini le scroll infini anxiogène, place à la concentration.

### 🧘 Mode Focus

Une interface immersive inspirée des applications de rencontre pour trier vos flux à la vitesse de la pensée.

- **Swipe à droite :** Article lu / archivé.
- **Swipe à gauche :** Article gardé pour plus tard.
- **Double-clic :** Lecture immédiate.

![Mode Focus](https://placehold.co/800x450/1e1e1e/22C55E?text=Mode+Focus)

### 🧠 Smart Digest (IA)

Ne perdez plus de temps sur les articles "clickbait".

- FlowReader utilise l'IA (via OpenRouter) pour lire le contenu complet à votre place.
- Il génère un **résumé concis** directement accessible depuis votre liste de lecture.
- Identifiez en un coup d'œil si un article mérite votre temps.

![Smart Digest](https://placehold.co/800x450/1e1e1e/22C55E?text=Smart+Digest+IA)

### ⚡ Performance & Sobriété

Conçu pour l'auto-hébergement respectueux des ressources.

- **Backend en Rust :** Axum + Tokio + SQLx, un binaire statique de quelques Mo.
- **Frontend React 19 :** Fluide et moderne.
- **< 150MB RAM :** Tourne parfaitement sur un Raspberry Pi ou un NAS modeste.

## 🚀 Fonctionnalités Clés

- **PWA & Offline :** Installez-le sur mobile comme une app native. Supporte la lecture hors-ligne.
- **Recherche Full-Text :** Retrouvez n'importe quel article instantanément grâce à l'indexation PostgreSQL.
- **Design Organique :** Thèmes "Organic Warmth" et "Deep Forest" (Mode Sombre) pour le confort des yeux.
- **Lecture Confortable :** Mode lecteur distration-free intégré.
- **Agents IA (BMad) :** Architecture conçue pour être maintenue et étendue par des agents IA.

## 📦 Installation

### Option 1 : Docker Compose (Recommandé)

Le moyen le plus simple de démarrer.

```bash
# 1. Cloner le dépôt
git clone https://github.com/R0m1k3/FlowReader.git
cd FlowReader

# 2. Lancer la stack
docker-compose up -d
```

Accédez à `http://localhost:8080`.

### Option 2 : Unraid

Un template dédié est fourni pour les utilisateurs d'Unraid.

1. Copiez le fichier `docker-compose.unraid.yaml` sur votre serveur.
2. Lancez le conteneur :

    ```bash
    docker-compose -f docker-compose.unraid.yaml up -d
    ```

    *Note : Les données sont persistées dans `/mnt/user/appdata/flowreader`.*

### Mises à jour

L'image `ghcr.io/r0m1k3/flowreader:latest` est reconstruite à chaque merge sur `main`.
Le compose Unraid utilise `pull_policy: always` : chaque démarrage avec
`docker compose -f docker-compose.unraid.yaml up -d` télécharge la dernière image et
applique la nouvelle version. Les migrations SQL s'appliquent seules au démarrage ;
les comptes, sessions, flux et articles existants sont conservés.

> ℹ️ Un simple `docker restart` relance le conteneur existant sans télécharger
> d'image : utilisez `docker compose up -d` (ou « Update » dans l'interface Docker d'Unraid).

### Configuration (Variables d'Environnement)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `PORT` | Port du serveur | `8080` |
| `DATABASE_URL` | Connexion PostgreSQL | `postgres://...` |
| `OPENROUTER_API_KEY` | Clé pour les résumés IA | *(Optionnel)* |
| `OPENROUTER_MODEL` | Modèle utilisé pour les résumés | `google/gemini-2.0-flash-001` |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL (compose, à mettre dans `.env`) | `flowreader` — **à changer** |
| `REGISTRATION_ENABLED` | `false` pour fermer les inscriptions (le 1er compte, admin, reste possible) | `true` |
| `TRUSTED_PROXIES` | IP/CIDR du reverse proxy (ex. `172.16.0.0/12`) pour le rate-limit par IP client | *(vide)* |
| `COOKIE_SECURE` | Forcer le cookie `Secure` (HTTPS derrière proxy) | auto |
| `WS_ALLOWED_ORIGINS` | Origines WebSocket supplémentaires | *(vide)* |

> 🔒 La base PostgreSQL n'est plus exposée sur l'hôte par défaut. Changez `POSTGRES_PASSWORD`
> **avant** le premier démarrage (il n'est appliqué qu'à la création du volume).

### Lecture

- Bureau (≥ 1280 px) : trois panneaux — flux, liste, lecteur. Tablette : liste et lecteur côte à côte,
  les flux dans un tiroir. Téléphone : une colonne avec une barre d'onglets (À lire, Focus, Favoris, Flux)
  et des gestes sur les articles (glisser → lu, glisser ← favori).
- Vue **liste** (vignettes carrées) ou **magazine** (grandes cartes), au choix.
- Recherche dans les titres et le texte des articles : `⌘K` / `Ctrl+K` ou `/`.
- Raccourcis clavier : `j`/`k` naviguer, `o` ouvrir, `m` lu/non lu, `s` favori, `v` original,
  `/` ou `⌘K` rechercher, `u` non lus/tous, `r` actualiser, `Espace` page suivante puis article suivant,
  `?` aide.
- Bouton **Aa** dans le lecteur : thème (clair, sépia, sombre, auto), police (serif, sans,
  Atkinson Hyperlegible), taille, interligne et largeur de colonne.

## 🛠️ Développement

Envie de mettre les mains dans le code ?

```bash
# Pré-requis : Rust stable, Node 22+, PostgreSQL 16 (ou Docker)

# 1. Construire le frontend (servi par le backend depuis web/dist)
make web

# 2. Lancer le backend
DATABASE_URL=postgres://flowreader:flowreader@localhost:5432/flowreader?sslmode=disable make dev

# 3. Tests, format et lint (TEST_DATABASE_URL active le test d'intégration SQL)
make test lint
```

## 🏗️ Architecture

```mermaid
graph TD
    Client[React Frontend] -->|API REST| Server[Rust Backend]
    Server -->|SQL| DB[(PostgreSQL)]
    Server -->|Fetch| RSS[Flux RSS Externes]
    Server -->|Analyze| AI[OpenRouter API]
```

## 🤝 Contribuer

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une Issue ou une Pull Request.

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier [LICENSE](LICENSE) pour plus de détails.
