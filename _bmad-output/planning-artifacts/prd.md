---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
inputDocuments: []
workflowType: 'prd'
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 0
classification:
  projectType: web_app
  domain: general
  complexity: low
  projectContext: greenfield
---

# Product Requirements Document - FlowReader

**Author:** Michael
**Date:** 2026-02-04
**Status:** DRAFT (Polished)

## 1. Executive Summary

**FlowReader** est un lecteur de flux RSS/Atom auto-hébergé, conçu pour être l'antithèse des agrégateurs modernes surchargés. Sa proposition de valeur unique réside dans son équilibre radical : une **simplicité monacale pour l'utilisateur** (Zéro Friction, Lecture Plaisir) alliée à une **robustesse technique absolue** (Docker <150Mo RAM, Websockets temps réel, Multi-utilisateurs). Il vise à remplacer les solutions existantes par une expérience "Mobile First" fluide et instantanée.

---

## 2. Success Criteria

### User & Business Success

* **Zéro Friction** : Ajout d'un flux en < 2 clics et < 10 secondes.
* **Lisibilité "Livre"** : Transformation automatique des articles bruts en format épuré (sans pubs/distractions).
* **Adoption Quotidienne** : Utilisation > 5 min/jour en remplacement complet du lecteur précédent.
* **Mobile First** : Expérience tactile parfaite (swipe, transitions) utilisable d'une seule main.

### Technical Success

* **Performance Extrême** : Conteneur complet < 150 Mo RAM. Rendu article < 100ms.
* **Déploiement Instantané** : `docker-compose up` suffit pour tout lancer (Database + App + Proxy).
* **Temps Réel** : Les nouveaux articles apparaissent instantanément (Websockets) sans rechargement.

---

## 3. Product Scope & Roadmap

### Phase 1: MVP (Lancement)

L'objectif est une expérience de lecture complète et fiable pour plusieurs utilisateurs.

* **Cœur** : Gestion Flux (CRUD), Dashboard "Nouveautés", Vue Lecture Plaisir.
* **Architecture** : SPA (React/Vue), Backend (Go/Rust/Node?), SQLite, Docker.
* **Critique** : Authentification Multi-comptes, Websockets, Support OPML.

### Phase 2: Growth (Post-MVP)

* **IA** : Résumés automatiques via OpenRouter.
* **Organisation** : Dossiers, Tags, Recherche Full-text.
* **Filtres** : Règles de filtrage et de mise en sourdine.

### Phase 3: Vision (Futur)

* **Écosystème** : API Publique, Apps natives iOS/Android, Fédération ActivityPub.

---

## 4. User Journeys

### J1: Le "Rituel du Matin" (Utilisateur Principal)

* **Contexte** : 15 min de libre, mobile.
* **Flux** : Michael ouvre l'app → Dashboard "Nouveautés" (flux agrégés) → Tape sur un article → Lecture immersive (sans distraction) → Swipe article suivant → Message "Tout lu" satisfaisant.
* **Valeur** : Efficacité et plaisir de lecture immédiat.

### J2: Le Nouvel Arrivant (Invité)

* **Contexte** : Ami invité sur l'instance.
* **Flux** : Inscription (Compte "Paul") → Dashboard vide → Import OPML ou ajout URL → Ses articles apparaissent instantanément.
* **Valeur** : Isolation totale des données (ne voit pas les flux de Michael), onboarding rapide.

### J3: L'Admin Système (Ops)

* **Contexte** : Maintenance.
* **Flux** : `docker-compose pull && up` → Redémarrage < 5s → Données préservées.
* **Valeur** : Maintenance "Zero Headache".

---

## 5. Functional Requirements (Capabilities)

### User Management

* **FR1**: Inscription autonome d'un nouvel utilisateur.
* **FR2**: Authentification sécurisée (Session/JWT).
* **FR3**: Isolation stricte des données (Flux, Lectures, Favoris) par compte utilisateur.

### Feed Management

* **FR4**: Ajout de flux via URL (support RSS/Atom auto-détecté).
* **FR5**: Détection automatique des métadonnées (Titre, Icône) à l'ajout.
* **FR6**: Importation de flux en masse via fichier OPML.
* **FR7**: Gestion des flux (Renommer, Supprimer).

### Reading Experience

* **FR8**: Dashboard unifié "Nouveautés" trié par date avec **scroll infini** pour une navigation fluide.
* **FR9**: Mode "Lecture Plaisir" avec extraction du contenu principal et **typographie optimisée** (suppression de l'italique sur les titres pour un meilleur confort visuel).
* **FR10**: Marquage "Lu" manuel ou automatique (scroll/swipe).
* **FR11**: Marquage "Tout lu" par flux ou global.
* **FR12**: Gestion des Favoris ("Star" / "Read Later").

### Real-time & Synchronization

* **FR13**: Push temps réel des nouveaux articles (Websockets) vers le client connecté.
* **FR14**: Synchronisation instantanée de l'état de lecture entre appareils.

### Administration

* **FR15**: Liste des utilisateurs inscrits (Vue Admin).
* **FR16**: Suppression de compte utilisateur.

---

## 6. Non-Functional Requirements (Quality)

### Performance & Resource Efficiency

* **NFR1**: Empreinte mémoire totale (Back+Front) **< 150 Mo** RAM.
* **NFR2**: Temps de chargement article (TTI) **< 100ms** perçu.
* **NFR3**: Score Lighthouse Mobile > 90.

### Architecture & Reliability

* **NFR4**: Architecture SPA (Single Page App) optimisée "Offline First" (Optimistic UI).
* **NFR5**: Redémarrage conteneur (Recovery Time) **< 5 secondes**.
* **NFR6**: Résilience totale aux flux défaillants (Timeout 5s strict, pas de blocage global).

### Security

* **NFR7**: Isolation des données inter-utilisateurs validée par tests.
* **NFR8**: Aucune télémétrie ou fuite de données (Privacy by Design).

---

## 7. Technical Stack Constraints

* **Frontend**: Framework SPA moderne (ex: React, Vue, Svelte) supportant les navigateurs Evergreen.
* **Backend**: Langage performant à faible empreinte mémoire (ex: Go, Rust, ou Node optimisé).
* **Database**: SQLite (mode WAL) pour la simplicité de déploiement et performance locale.
* **Deployment**: Image Docker unique (ou Multi-stage build) exposant un seul port.
