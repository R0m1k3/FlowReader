---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
inputDocuments:
  - c:\Users\Michael\VSCODE\FlowReader\_bmad-output\planning-artifacts\prd.md
  - c:\Users\Michael\VSCODE\FlowReader\_bmad-output\planning-artifacts\architecture.md
---

# FlowReader - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for FlowReader, decomposing the requirements from the PRD and Architecture inputs into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Inscription autonome d'un nouvel utilisateur.
FR2: Authentification sécurisée (Session/JWT).
FR3: Isolation stricte des données (Flux, Lectures, Favoris) par compte utilisateur.
FR4: Ajout de flux via URL (support RSS/Atom auto-détecté).
FR5: Détection automatique des métadonnées (Titre, Icône) à l'ajout.
FR6: Importation de flux en masse via fichier OPML.
FR7: Gestion des flux (Renommer, Supprimer).
FR8: Dashboard unifié "Nouveautés" trié par date.
FR9: Mode "Lecture Plaisir" avec extraction du contenu principal (nettoyage HTML).
FR10: Marquage "Lu" manuel ou automatique (scroll/swipe).
FR11: Marquage "Tout lu" par flux ou global.
FR12: Gestion des Favoris ("Star" / "Read Later").
FR13: Push temps réel des nouveaux articles (Websockets) vers le client connecté.
FR14: Synchronisation instantanée de l'état de lecture entre appareils.
FR15: Liste des utilisateurs inscrits (Vue Admin).
FR16: Suppression de compte utilisateur.

### NonFunctional Requirements

NFR1: Empreinte mémoire totale (Back+Front) **< 150 Mo** RAM.
NFR2: Temps de chargement article (TTI) **< 100ms** perçu.
NFR3: Score Lighthouse Mobile > 90.
NFR4: Architecture SPA (Single Page App) optimisée "Offline First" (Optimistic UI).
NFR5: Redémarrage conteneur (Recovery Time) **< 5 secondes**.
NFR6: Résilience totale aux flux défaillants (Timeout 5s strict, pas de blocage global).
NFR7: Isolation des données inter-utilisateurs validée par tests.
NFR8: Aucune télémétrie ou fuite de données (Privacy by Design).

### Additional Requirements

From Architecture:

- **Starter Template**: Custom Composite Stack (Go Chi + Vite + Postgres).
- **Database**: PostgreSQL with strict tuning (`shared_buffers=24MB`).
- **Infra**: Docker Compose with healthchecks.
- **Migration**: SQL Migrations via `golang-migrate` or `goose`.
- **API**: REST JSON API + OpenAPI 3.0 Specs.
- **Testing**: Integration tests with TestContainers (or similar isolation).

From UX/Vision (PRD):

- Mobile First: Swipes, transitions, One-handed usage.
- Zéro Friction: Add feed < 2 clicks.

### FR Coverage Map

FR1: Epic 1 - Inscription autonome
FR2: Epic 1 - Authentification sécurisée
FR3: Epic 1/4 - Isolation stricte (Fondation en Epic 1, Validation en Epic 4)
FR4: Epic 2 - Ajout de flux via URL
FR5: Epic 2 - Détection métadonnées
FR6: Epic 2 - Import OPML
FR7: Epic 2 - Gestion flux
FR8: Epic 3 - Dashboard Nouveautés
FR9: Epic 3 - Mode Lecture Plaisir
FR10: Epic 3 - Marquage Lu
FR11: Epic 3 - Marquage Tout Lu
FR12: Epic 3 - Gestion Favoris
FR13: Epic 3 - Push Websockets
FR14: Epic 4 - Sync Multi-device
FR15: Epic 4 - Vue Admin
FR16: Epic 4 - Suppression Compte

## Epic List

### Epic 1: "Walking Skeleton" & User Access

**Goal:** Establish the complete infrastructure and allow secure user access.
**Outcome:** Users can visit the app, register, login, and see a secure empty state.
**FRs covered:** FR1, FR2, FR3 (partial), FR16 (partial)

#### Story 1.1: Project Initialization & Walking Skeleton

As a Developer,
I want to initialize the project structure and Docker environment,
So that I have a running foundation to build upon.

**Acceptance Criteria:**

**Given** A clean git repository
**When** I run `docker-compose up`
**Then** A Go Backend container should start and listen on port 8080
**And** A PostgreSQL container should start and accept connections
**And** Calling `GET /health` on the backend should return 200 OK
**And** The Project Structure should match the Architecture definitions

#### Story 1.2: Database Migration System

As a Developer,
I want a versioned database migration system,
So that I can evolve the schema reliably across environments.

**Acceptance Criteria:**

**Given** The running Postgres container
**When** I run the migration command (e.g. `make migrate-up`)
**Then** The `users` table should be created in the database
**And** A `schema_migrations` table should track the version
**And** The application should fail to start if DB connection fails

#### Story 1.3: User Registration API

As a New User,
I want to create an account,
So that I can have my own private space for feeds.

**Acceptance Criteria:**

**Given** The registration endpoint `POST /api/v1/auth/register`
**When** I send valid email and password (>8 chars)
**Then** A new user record is created in the DB with a Hashed Password (Argon2)
**And** I receive a 201 Created response
**When** I send a duplicate email
**Then** I receive a 409 Conflict error
**And** Inputs are validated (email format, password length)

#### Story 1.4: Session Authentication

As a Registered User,
I want to log in securely,
So that I can access my private data.

**Acceptance Criteria:**

**Given** A registered user
**When** I POST valid credentials to `/api/v1/auth/login`
**Then** I receive a 200 OK
**And** A `session_id` cookie is set (HttpOnly, Secure, SameSite=Strict)
**And** A session record is created in the DB
**When** I call a protected endpoint without the cookie
**Then** I receive 401 Unauthorized

#### Story 1.5: Frontend Auth Foundation

As a User,
I want to log in via a web interface,
So that I can access the application easily.

**Acceptance Criteria:**

**Given** The frontend application running on Vite
**When** I navigate to `/login`
**Then** I see a login form
**When** I submit valid credentials
**Then** I am redirected to the Dashboard (`/`)
**And** My session state is persistent on refresh (checked via `/api/v1/users/me`)

### Epic 2: Feed Core Engine

**Goal:** Enable the aggregation and management of content feeds.
**Outcome:** Users can populate their reader via URL or OPML, and the backend reliably fetches content.
**FRs covered:** FR4, FR5, FR6, FR7

#### Story 2.1: Feed Model & Add Feed by URL

As a User,
I want to add a feed by providing its URL,
So that I can start receiving articles from that source.

**Acceptance Criteria:**

**Given** Database migrations for `feeds` and `articles` tables
**When** I POST a valid RSS/Atom URL to `/api/v1/feeds`
**Then** The feed is parsed and stored in the database
**And** Initial articles are fetched and stored
**And** I receive a 201 Created with the feed object

#### Story 2.2: Feed Metadata Auto-Discovery

As a User,
I want feed titles and icons to be detected automatically,
So that I don't have to manually configure each feed.

**Acceptance Criteria:**

**Given** A feed URL is submitted
**When** The backend parses the feed
**Then** The feed title is extracted from the RSS/Atom XML
**And** The favicon is fetched from the source domain
**And** The feed type (RSS 2.0, Atom 1.0) is detected

#### Story 2.3: OPML Import

As a User migrating from another reader,
I want to import my feeds via OPML file,
So that I can quickly set up my account.

**Acceptance Criteria:**

**Given** An authenticated user
**When** I POST an OPML file to `/api/v1/feeds/import`
**Then** All feeds in the OPML are parsed and added
**And** Duplicate feeds (by URL) are skipped
**And** I receive a summary of imported/skipped feeds

#### Story 2.4: Feed Management (CRUD)

As a User,
I want to rename or delete my feeds,
So that I can organize my subscriptions.

**Acceptance Criteria:**

**Given** An authenticated user with existing feeds
**When** I call `GET /api/v1/feeds`
**Then** I receive a list of my feeds with metadata
**When** I call `PATCH /api/v1/feeds/:id` with a new title
**Then** The feed title is updated
**When** I call `DELETE /api/v1/feeds/:id`
**Then** The feed and its articles are removed

#### Story 2.5: Background Feed Fetcher

As a User,
I want my feeds to update automatically,
So that I always have fresh content.

**Acceptance Criteria:**

**Given** A scheduled Go worker (e.g., every 15 minutes)
**When** The worker runs
**Then** Each feed is fetched concurrently with 5s timeout
**And** New articles are saved to the database
**And** Failing feeds do not block other feeds
**And** Last fetch status (success/error) is recorded

### Epic 3: "Lecture Plaisir" & Real-Time Experience

**Goal:** Deliver the core value proposition: a fluid, distraction-free reading experience.
**Outcome:** Users can read, track status, and receive updates instantly in a mobile-first UI.
**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13

#### Story 3.1: Dashboard "Nouveautés"

As a User,
I want to see all my unread articles in one view,
So that I can quickly catch up on new content.

**Acceptance Criteria:**

**Given** An authenticated user with feeds
**When** I call `GET /api/v1/articles?unread=true`
**Then** I receive a paginated list of unread articles sorted by date (newest first)
**And** Each article includes title, source feed, publication date, and excerpt

#### Story 3.2: Article Detail & Reader Mode

As a User,
I want to read articles in a clean, distraction-free format,
So that I can focus on the content.

**Acceptance Criteria:**

**Given** An article ID
**When** I call `GET /api/v1/articles/:id`
**Then** I receive the article with its full content
**And** The content is sanitized (no scripts, no ads, clean HTML)
**And** The frontend renders it in a "Reader Mode" layout

#### Story 3.3: Mark as Read (Manual & Auto)

As a User,
I want articles to be marked as read when I finish them,
So that I know what I've already seen.

**Acceptance Criteria:**

**Given** An article in the UI
**When** I click "Mark as Read" or scroll to the bottom of the article
**Then** The article's `read_at` timestamp is set via `PATCH /api/v1/articles/:id/read`
**And** It no longer appears in the "Unread" filter
**And** Frontend uses Optimistic UI (updates immediately before API confirms)

#### Story 3.4: Mark All as Read

As a User,
I want to mark all articles in a feed (or globally) as read,
So that I can start fresh when overwhelmed.

**Acceptance Criteria:**

**Given** A feed with unread articles
**When** I call `POST /api/v1/feeds/:id/mark-all-read`
**Then** All articles in that feed are marked as read
**When** I call `POST /api/v1/articles/mark-all-read`
**Then** All my unread articles globally are marked as read

#### Story 3.5: Favorites System

As a User,
I want to save articles for later,
So that I can revisit important content.

**Acceptance Criteria:**

**Given** An article
**When** I call `PATCH /api/v1/articles/:id/favorite` with `{favorite: true}`
**Then** The article is marked as a favorite
**When** I call `GET /api/v1/articles?favorite=true`
**Then** I receive only my favorited articles

#### Story 3.6: Websocket Push Notifications

As a User,
I want to receive new articles instantly without refreshing,
So that I always have the latest content.

**Acceptance Criteria:**

**Given** A connected Websocket (`/ws`)
**When** The background fetcher finds new articles for my feeds
**Then** A `new_article` event is pushed to my connection
**And** The frontend updates the Dashboard in real-time
**And** Disconnections are handled gracefully with auto-reconnect

### Epic 4: Advanced Systems & Robustness

**Goal:** Final optimizations, admin tools, and multi-device synchronization.
**Outcome:** A robust, production-ready system meeting strict memory constraints.
**FRs covered:** FR14, FR15, FR16, FR3 (Final Validation)

#### Story 4.1: Multi-Device Sync

As a User with multiple devices,
I want my read/favorite status to sync instantly,
So that I can seamlessly switch between devices.

**Acceptance Criteria:**

**Given** A user logged in on two devices (e.g., phone and PC)
**When** I mark an article as read on Device A
**Then** Device B receives a Websocket event and updates the UI immediately
**And** The sync works for `read` and `favorite` status changes

#### Story 4.2: Admin User List

As an Administrator,
I want to see all registered users,
So that I can manage the instance.

**Acceptance Criteria:**

**Given** An admin user (e.g., first registered user)
**When** I call `GET /api/v1/admin/users`
**Then** I receive a list of all users with their email and registration date
**When** A non-admin user calls this endpoint
**Then** They receive 403 Forbidden

#### Story 4.3: Delete User Account

As an Administrator,
I want to delete a user account,
So that I can remove inactive or abusive users.

**Acceptance Criteria:**

**Given** An admin user
**When** I call `DELETE /api/v1/admin/users/:id`
**Then** The user's account is deleted
**And** All associated feeds, articles, and sessions are cascade deleted
**And** The deleted user session is invalidated

#### Story 4.4: Performance & RAM Optimization

As a Self-Hoster,
I want the application to run within strict memory limits,
So that I can deploy it on low-resource servers.

**Acceptance Criteria:**

**Given** A Docker Compose deployment
**When** The application is running with 10 feeds and 500 articles
**Then** Total container memory (App + Postgres) is under 150MB
**And** Postgres is configured with `shared_buffers=24MB, max_connections=20`
**And** Go backend is profiled for memory leaks
