# EventPulse Analytics

Backend Foundation — Phase 4A.3.2

EventPulse Analytics est une plateforme SaaS B2B de gestion événementielle et d'analytique destinée aux organisateurs de salons professionnels, d'expositions, de conférences et de workshops.

La vision produit est de centraliser les données opérationnelles de plusieurs événements dans un référentiel isolé par organisation, de calculer des KPI auditables et de produire des tableaux de bord, rapports et exports. Le backend présent dans ce dépôt constitue le socle technique de cette plateforme.

> **Statut actuel :** le modèle de données métier et ses migrations sont implémentés. Les repositories, les fonctionnalités métier, l'authentification, les analytiques et le frontend ne le sont pas encore.

## Stack technique

Les versions exactes des dépendances sont définies dans `package.json` et `package-lock.json`.

| Composant      | État         | Usage actuel                                              |
| -------------- | ------------ | --------------------------------------------------------- |
| Node.js 22.x   | Intégré      | Runtime du backend                                        |
| TypeScript     | Intégré      | Code source strict, modules ESM et résolution `NodeNext`  |
| Express 5      | Intégré      | Application HTTP                                          |
| Zod            | Intégré      | Validation de la configuration d'environnement            |
| Pino           | Intégré      | Journalisation structurée                                 |
| Helmet         | Intégré      | En-têtes de sécurité HTTP                                 |
| CORS           | Intégré      | Politique d'accès cross-origin                            |
| dotenv         | Intégré      | Chargement du fichier `.env` racine                       |
| Vitest         | Intégré      | Tests unitaires et HTTP                                   |
| Supertest      | Intégré      | Tests des routes Express                                  |
| ESLint         | Intégré      | Analyse statique                                          |
| Prettier       | Intégré      | Formatage du code                                         |
| npm workspaces | Intégré      | Gestion du monorepo et du workspace `@eventpulse/api`     |
| PostgreSQL 16  | Intégré      | Base locale reproductible via Docker Compose              |
| Prisma 5.x     | Intégré      | Client PostgreSQL, génération et connexion                |
| Docker Compose | Intégré      | Service PostgreSQL de développement                       |

Le schéma de données métier et son historique de migrations sont présents. Les repositories, l'authentification et les fonctionnalités métier ne font pas partie de l'état actuel du code.

## Prérequis

- Node.js **22.x** (`>=22 <23`, version indiquée dans `.nvmrc`) ;
- npm compatible avec le projet ;
- Git ;
- Docker avec Compose pour la base PostgreSQL locale.

L'utilisation de `nvm` est optionnelle mais permet de sélectionner la version attendue :

```bash
nvm use
```

## Installation

Depuis la racine du dépôt :

```bash
npm install
```

Pour une installation reproductible à partir du lockfile :

```bash
npm ci
```

npm installe les dépendances du workspace `@eventpulse/api` depuis la racine du monorepo. Le script `postinstall` du workspace génère ensuite le Prisma Client à partir du schéma métier, sans nécessiter de base active.

## Configuration de l'environnement

La configuration est chargée depuis le fichier `.env` situé à la racine du dépôt. Créer ce fichier à partir du modèle fourni :

```bash
cp .env.example .env
```

Sous PowerShell :

```powershell
Copy-Item .env.example .env
```

Variables prises en charge par le schéma actuel :

| Variable             | Valeurs autorisées                                           | Valeur par défaut |
| -------------------- | ------------------------------------------------------------ | ----------------- |
| `NODE_ENV`           | `development`, `test`, `production`                          | `development`     |
| `PORT`               | Entier de `1` à `65535`                                      | `3000`            |
| `LOG_LEVEL`          | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` | `info`            |
| `DATABASE_URL`       | URL PostgreSQL (`postgresql://` ou `postgres://`)            | Obligatoire       |
| `DATABASE_RUNTIME_URL` | URL PostgreSQL du login applicatif                         | Oui en production |
| `DATABASE_POOL_SIZE` | Entier de `1` à `100`                               | `10`              |
| `TEST_DATABASE_URL`  | URL PostgreSQL dont le nom de base finit par `_test`         | `eventpulse_test` en local |

Variables d'authentification (Phase 4A.4) :

| Variable                          | Valeurs autorisées                          | Valeur par défaut |
| --------------------------------- | ------------------------------------------- | ----------------- |
| `JWT_ACCESS_SECRET`               | Secret d'au moins 32 caractères             | Développement uniquement |
| `JWT_ACCESS_TTL_SECONDS`          | Entier de `60` à `3600`                     | `900`             |
| `JWT_ISSUER`, `JWT_AUDIENCE`      | Chaînes de 1 à 120 caractères               | `eventpulse-analytics`, `eventpulse-api` |
| `JWT_KEY_ID`                      | Chaîne de 1 à 64 caractères                 | `primary`         |
| `REFRESH_TOKEN_PEPPER`            | Secret d'au moins 32 caractères             | Développement uniquement |
| `PASSWORD_RESET_TOKEN_PEPPER`     | Secret d'au moins 32 caractères             | Développement uniquement |
| `REFRESH_SLIDING_TTL_SECONDS`     | Entier de `60` à 2 592 000                  | `604800` (7 jours) |
| `SESSION_ABSOLUTE_TTL_SECONDS`    | Entier ≥ TTL glissant, jusqu'à 31 536 000   | `2592000` (30 jours) |
| `PASSWORD_RESET_TTL_SECONDS`      | Entier de `60` à 86 400                     | `1800`            |
| `AUTH_COOKIE_SECURE`              | `true` ou `false`                           | `true` en production |
| `AUTH_COOKIE_DOMAIN`              | Domaine de cookie optionnel (labels DNS valides, point initial accepté) | Non défini |
| `CORS_ALLOWED_ORIGINS`            | Origines HTTP(S) séparées par des virgules  | `http://localhost:5173` (hors production) |
| `TRUST_PROXY_HOPS`                | Entier de `0` à `10`                        | `0`               |
| `REDIS_URL`                       | URL `redis://` ou `rediss://`               | Obligatoire en production |
| `REDIS_KEY_PREFIX`                | Chaîne de 1 à 64 caractères                 | `eventpulse`      |
| `AUTH_LOGIN_MAX_ATTEMPTS`         | Entier de `1` à `100`                       | `10`              |
| `AUTH_LOGIN_WINDOW_SECONDS`       | Entier de `60` à 86 400                     | `900`             |
| `AUTH_FORGOT_MAX_ATTEMPTS`        | Entier de `1` à `100`                       | `5`               |
| `AUTH_FORGOT_WINDOW_SECONDS`      | Entier de `60` à 86 400                     | `3600`            |
| `AUTH_REFRESH_MAX_ATTEMPTS`       | Entier de `1` à 1 000                       | `60`              |
| `AUTH_REFRESH_WINDOW_SECONDS`     | Entier de `60` à 86 400                     | `3600`            |
| `AUTH_LOCKOUT_THRESHOLD`          | Entier de `1` à `100`                       | `5`               |
| `AUTH_LOCKOUT_BASE_SECONDS`       | Entier de `1` à 86 400                      | `60`              |
| `AUTH_LOCKOUT_MAX_SECONDS`        | Entier ≥ base, jusqu'à 604 800              | `86400`           |
| `AUTH_RATE_LIMIT_FAIL_CLOSED`     | `true` ou `false` (forcé à `true` en production) | `true`       |

En production, `JWT_ACCESS_SECRET`, `REFRESH_TOKEN_PEPPER`, `PASSWORD_RESET_TOKEN_PEPPER`, `REDIS_URL` et `CORS_ALLOWED_ORIGINS` sont obligatoires, les secrets de développement sont refusés, `AUTH_COOKIE_SECURE` ne peut pas être `false` et les origines `*` sont rejetées. `AUTH_RATE_LIMIT_FAIL_CLOSED=false` est refusé en production : les routes d'authentification échouent en `503 AUTH_REDIS_UNAVAILABLE` lorsque Redis est indisponible. En développement et en test, l'absence de `REDIS_URL` utilise un store de rate limiting en mémoire, limité au processus courant. `TRUST_PROXY_HOPS` doit refléter le nombre exact de proxys de confiance ; `true` n'est jamais accepté.

Le fichier `.env.example` contient également `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_PORT`, utilisés uniquement par Docker Compose. Le mot de passe fourni est réservé au développement local.

La configuration est validée avec Zod au chargement du module d'environnement, avant le démarrage du serveur. Les variables optionnelles ont une valeur par défaut ; `DATABASE_URL` est obligatoire et une valeur invalide ou hors limites provoque une erreur explicite.

`DATABASE_RUNTIME_URL` est le login applicatif, membre du groupe `eventpulse_app`. En développement, son absence fait retomber l'API sur `DATABASE_URL` (rôle propriétaire). En production, elle est obligatoire : le démarrage échoue sinon, afin de ne pas exécuter l'API avec le rôle de migration. Les migrations et les outils de vérification utilisent toujours `DATABASE_URL`.

`TEST_DATABASE_URL` désigne la base dédiée aux tests d'intégrité. Son nom doit se terminer par `_test` ; le `globalSetup` refuse toute autre base et ne la supprime jamais.

`DATABASE_POOL_SIZE` est appliqué au client Prisma sous la forme du paramètre PostgreSQL `connection_limit`.

Les fichiers `.env` locaux sont ignorés par Git. Ne jamais placer de secrets réels dans le dépôt ou dans `.env.example`.

## Commandes disponibles

Les scripts applicatifs délèguent leur exécution au workspace `@eventpulse/api`. `prisma:validate` et les commandes Docker Compose s'exécutent depuis la racine afin de charger le `.env` racine et le fichier Compose.

| Commande                 | Rôle                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `npm run start`          | Démarre la version compilée avec `node apps/api/dist/server.js` |
| `npm run build`          | Génère le Prisma Client puis compile dans `apps/api/dist/`      |
| `npm run test`           | Exécute la suite Vitest une fois                                |
| `npm run test:watch`     | Exécute Vitest en mode watch                                    |
| `npm run test:coverage`  | Exécute les tests avec couverture V8                            |
| `npm run test:integration` | Exécute les tests d'intégrité PostgreSQL sur `eventpulse_test` |
| `npm run test:integration:watch` | Exécute les tests d'intégrité en mode watch            |
| `npm run db:check:migrations` | Scanne les migrations contre les suppressions protégées    |
| `npm run db:verify:integrity` | Vérifie le catalogue PostgreSQL (FK, index, CHECK, triggers, privilèges) |
| `npm run lint`           | Analyse le code avec ESLint                                     |
| `npm run lint:fix`       | Applique les corrections ESLint disponibles                     |
| `npm run format`         | Formate le code avec Prettier                                   |
| `npm run format:check`   | Vérifie le formatage sans modifier les fichiers                 |
| `npm run typecheck`      | Vérifie les types sans générer de fichiers                      |
| `npm run prisma:generate` | Génère le Prisma Client depuis `schema.prisma`                 |
| `npm run prisma:validate` | Valide le schéma Prisma                                        |
| `npm run prisma:migrate:dev` | Crée et applique une migration en développement           |
| `npm run prisma:migrate:deploy` | Scanne puis applique les migrations en attente           |
| `npm run prisma:migrate:status` | Affiche l'état des migrations                          |
| `npm run prisma:studio`  | Ouvre Prisma Studio pour inspecter les données                  |
| `npm run db:up`          | Démarre PostgreSQL 16 avec Docker Compose                       |
| `npm run db:down`        | Arrête PostgreSQL sans supprimer le volume de données           |
| `npm run db:check`       | Compile puis vérifie la connexion PostgreSQL via Prisma         |

`npm run start` lance la version compilée et nécessite donc un build préalable :

```bash
npm run build
npm run start
```

Les artefacts générés sont écrits dans `apps/api/dist/` et la couverture dans `apps/api/coverage/`. Ces répertoires sont ignorés par Git.

## Architecture actuelle

```text
EventPulse-Analytics/
├── apps/
│   └── api/
│       ├── src/
│       │   ├── app.ts
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── config/
│       │   │   ├── env.schema.ts
│       │   │   ├── env.ts
│       │   │   └── logger.ts
│       │   ├── database/
│       │   │   ├── check-connection.ts
│       │   │   ├── check-migrations.ts
│       │   │   ├── integrity-manifest.ts
│       │   │   ├── integrity.ts
│       │   │   ├── migration-safety.ts
│       │   │   ├── prisma.ts
│       │   │   └── verify-integrity.ts
│       │   ├── errors/
│       │   │   ├── app-error.ts
│       │   │   ├── problem-details.ts
│       │   │   └── validation-error.ts
│       │   ├── http/
│       │   │   ├── pagination.ts
│       │   │   └── responses.ts
│       │   ├── middleware/
│       │   │   ├── error-handler.ts
│       │   │   ├── request-logger.ts
│       │   │   └── validate-request.ts
│       │   ├── modules/
│       │   │   ├── audit/
│       │   │   │   └── audit.writer.ts
│       │   │   ├── auth/
│       │   │   │   ├── middleware/
│       │   │   │   │   ├── authenticate.middleware.ts
│       │   │   │   │   ├── require-origin.middleware.ts
│       │   │   │   │   ├── tenant-context.middleware.ts
│       │   │   │   │   └── user-rate-limit.middleware.ts
│       │   │   │   ├── repositories/
│       │   │   │   │   ├── auth-unit-of-work.ts
│       │   │   │   │   ├── password-reset-token.repository.ts
│       │   │   │   │   ├── session.repository.ts
│       │   │   │   │   └── user.repository.ts
│       │   │   │   ├── services/
│       │   │   │   │   ├── password-reset.service.ts
│       │   │   │   │   ├── password.service.ts
│       │   │   │   │   ├── session.service.ts
│       │   │   │   │   ├── token-hash.ts
│       │   │   │   │   └── token.service.ts
│       │   │   │   ├── auth.controller.ts
│       │   │   │   ├── auth.errors.ts
│       │   │   │   ├── auth.facade.ts
│       │   │   │   ├── auth.mapper.ts
│       │   │   │   ├── auth.module.ts
│       │   │   │   ├── auth.routes.ts
│       │   │   │   ├── auth.schemas.ts
│       │   │   │   ├── auth.service.ts
│       │   │   │   └── auth.types.ts
│       │   │   └── organizations/
│       │   │       └── organizations-reader.ts
│       │   ├── routes/
│       │   │   ├── index.ts
│       │   │   ├── health.routes.ts
│       │   │   └── v1/
│       │   │       └── index.ts
│       │   └── shared/
│       │       ├── contracts/
│       │       │   ├── auth-user-provisioner.ts
│       │       │   └── organizations-reader.ts
│       │       ├── http/
│       │       │   ├── cookies.ts
│       │       │   └── origin.ts
│       │       ├── mail/
│       │       │   └── null-mail.ts
│       │       ├── ports/
│       │       │   ├── audit.port.ts
│       │       │   ├── clock.port.ts
│       │       │   └── mail.port.ts
│       │       ├── rate-limit/
│       │       │   ├── create-rate-limiter.ts
│       │       │   ├── in-memory-rate-limit.store.ts
│       │       │   ├── rate-limit.errors.ts
│       │       │   ├── rate-limit.store.ts
│       │       │   ├── rate-limiter.ts
│       │       │   └── redis-rate-limit.store.ts
│       │       ├── redis/
│       │       │   └── redis-connection.ts
│       │       └── types/
│       │           └── actor-context.ts
│       ├── test/
│       │   ├── http/
│       │   │   ├── app.test.ts
│       │   │   ├── auth-routes.test.ts
│       │   │   ├── request-logger.test.ts
│       │   │   ├── routes.test.ts
│       │   │   ├── server.test.ts
│       │   │   ├── supertest.test.ts
│       │   │   └── validation.test.ts
│       │   ├── integration/
│       │   │   ├── global-setup.ts
│       │   │   ├── helpers/
│       │   │   ├── auth.test.ts
│       │   │   ├── schema-integrity.test.ts
│       │   │   ├── refund-cap.test.ts
│       │   │   ├── immutability.test.ts
│       │   │   ├── event-integrity.test.ts
│       │   │   ├── api-key-scopes.test.ts
│       │   │   ├── updated-at.test.ts
│       │   │   ├── privileges.test.ts
│       │   │   ├── indexes.test.ts
│       │   │   └── partial-indexes.test.ts
│       │   └── unit/
│       │       ├── auth/
│       │       │   ├── auth.schemas.test.ts
│       │       │   ├── auth.service.test.ts
│       │       │   ├── password-reset.service.test.ts
│       │       │   ├── password.service.test.ts
│       │       │   ├── session.service.test.ts
│       │       │   └── token.service.test.ts
│       │       ├── database/
│       │       │   ├── integrity-manifest.test.ts
│       │       │   ├── migration-safety.test.ts
│       │       │   ├── prisma.test.ts
│       │       │   └── test-database-guard.test.ts
│       │       ├── errors/
│       │       │   ├── app-error.test.ts
│       │       │   ├── problem-details.test.ts
│       │       │   └── validation-error.test.ts
│       │       ├── http/
│       │       │   ├── pagination.test.ts
│       │       │   └── responses.test.ts
│       │       ├── rate-limit/
│       │       │   ├── rate-limiter.test.ts
│       │       │   └── redis-rate-limit.store.test.ts
│       │       ├── shared/
│       │       │   └── http-security.test.ts
│       │       ├── env-loader.test.ts
│       │       ├── env.test.ts
│       │       ├── get-runtime-info.test.ts
│       │       ├── logger.test.ts
│       │       └── server-import.test.ts
│       ├── prisma/
│       │   ├── migrations/
│       │   │   ├── 20261121225300_init_database_schema/
│       │   │   ├── 20261121231500_integrity_constraints/
│       │   │   ├── 20261121232000_participant_merge_tenant_fk/
│       │   │   ├── 20261122100000_api_key_scopes_constraint/
│       │   │   ├── 20261122101000_event_integrity_constraints/
│       │   │   ├── 20261122102000_refund_cap_trigger/
│       │   │   ├── 20261122103000_immutability_triggers/
│       │   │   ├── 20261122104000_touch_updated_at_trigger/
│       │   │   ├── 20261122105000_trgm_indexes/
│       │   │   ├── 20261122106000_runtime_privileges/
│       │   │   ├── 20261123120000_auth_session_absolute_expiry/
│       │   │   └── migration_lock.toml
│       │   └── schema.prisma
│       ├── package.json
│       ├── tsconfig.build.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── vitest.integration.config.ts
├── docs/
│   ├── phase-1-discovery/
│   ├── phase-2-ui-ux/
│   ├── phase-3-architecture/
│   └── phase-4-implementation/
├── .env.example
├── .gitattributes
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── LICENSE
├── docker-compose.yml
├── eslint.config.js
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.base.json
```

### Rôle des principaux fichiers

- `app.ts` : construit l'application Express, configure Helmet, CORS, le logger de requêtes et la limite JSON, monte la composition des routes, gère les routes inconnues et branche le gestionnaire d'erreurs central.
- `server.ts` : point d'entrée du serveur HTTP. Il crée le serveur natif Node.js, l'écoute sur `PORT`, expose le cycle de vie et installe les handlers de signaux. Le serveur n'est démarré que lorsque ce fichier est exécuté directement.
- `index.ts` : expose le nom du service et les informations de runtime. Ce fichier n'est pas le point d'entrée du serveur.
- `config/` : schéma et chargement de l'environnement, ainsi que la configuration Pino.
- `database/` : singleton Prisma, cycle de vie de la connexion, contrôle de disponibilité, manifeste d'intégrité, vérificateur de catalogue et scanner de migrations.
- `modules/auth/` : authentification et identité — contrôleur, routes, schémas Zod, service applicatif, façade, middlewares, repositories Prisma et services de mots de passe, jetons et sessions.
- `modules/audit/` : writer d'audit append-only branché sur `audit_logs`.
- `modules/organizations/` : `OrganizationsReader` minimal utilisé par l'authentification pour résoudre les appartenances et organisations.
- `shared/` : ports (`AuditPort`, `MailPort`, `ClockPort`), rate limiting Redis/mémoire, cookies et validation d'origine, connexion Redis et contexte d'acteur.
- `prisma/schema.prisma` : schéma Prisma métier (20 modèles, 25 enums) et migrations versionnées.
- `prisma/migrations/` : historique SQL versionné, dont les contraintes d'intégrité ajoutées manuellement et la colonne `sessions.absolute_expires_at`.
- `middleware/` : Request ID, logging HTTP, validation Zod des requêtes et traitement centralisé des erreurs.
- `errors/` : classes `AppError` et `ValidationError`, conversion des erreurs vers le format Problem Details.
- `http/` : enveloppes de réponses de succès et calculs de pagination réutilisables.
- `routes/` : composition centralisée des routes, routeur API principal, espace versionné `/api/v1` et routeur de santé.
- `test/` : tests unitaires, tests HTTP et tests d'intégration PostgreSQL avec Vitest et Supertest.
- `docs/` : documentation de découverte produit, UX, architecture de conception et runbooks d'implémentation.

### Composition et versionnement des routes

Le routeur API principal est monté sur `/api`, puis le routeur de version sur `/v1`, ce qui expose le préfixe `/api/v1`. Les routeurs de modules métier sont enregistrés dans `routes/v1/index.ts` ; le routeur d'authentification y est monté sous `/auth` via une construction paresseuse, afin que les routes de santé et les tests sans base de données n'ouvrent pas de connexion Prisma. Les futurs routeurs métier suivront le même modèle.

`GET /health` reste un contrôle opérationnel non versionné. Les routes inconnues, versionnées ou non, aboutissent au gestionnaire `404` central et conservent le format Problem Details.

### Validation des requêtes

Le middleware `validateRequest({ body, params, query })`, utilisé au niveau de la route, valide uniquement les sections configurées avec les schémas Zod fournis par la route. Une requête invalide est bloquée avant le handler et produit une réponse `400 VALIDATION_ERROR` au format Problem Details, avec un tableau `errors` contenant `path`, `code` et `message`. Les valeurs soumises ne sont pas renvoyées.

Les données validées et transformées remplacent `req.body`, `req.params` et `req.query` avant l’exécution du handler. Cette écriture est compatible avec les getters d’Express 5 et ne modifie pas les types globaux d’Express.

### Réponses de succès et pagination

Les réponses de succès sont construites avec `singleResponse`, `collectionResponse` et `paginatedResponse`. Elles suivent le contrat de `API_DESIGN.md` : ressource unique `{ "data": ... }`, collection `{ "data": [...] }` et collection paginée `{ "data": [...], "meta": { "limit", "hasMore", "nextCursor" } }`.

Les collections paginées utilisent le curseur opaque prévu en v1. `nextCursor` vaut `null` sur la dernière page et `limit` est borné de 1 à 100. `calculateOffsetPagination` fournit le calcul `offset` et `totalPages` pour les usages internes, notamment les exports de rapports, sans exposer de pagination par offset dans l’API. Pour zéro résultat, `totalPages` vaut `0`.

### PostgreSQL et Prisma

Le fichier `docker-compose.yml` fournit PostgreSQL 16 avec un volume persistant et un healthcheck. Pour le développement local :

```bash
cp .env.example .env
npm run db:up
npm run prisma:migrate:deploy
npm run db:verify:integrity
npm run db:check
npm run db:down
```

`npm run db:down` arrête le conteneur sans supprimer le volume `postgres_data`. Les commandes Prisma chargent le fichier `.env` racine.

Le schéma `apps/api/prisma/schema.prisma` décrit 20 tables et 25 enums : utilisateurs et sessions, organisations et memberships, invitations et clés API, événements et billets, participants, inscriptions, transactions et remboursements, check-ins, exposants, stands et réservations, imports, exports et journal d'audit. Les identifiants sont des UUID, les montants des `numeric(12,2)`, les emails des `citext` et les horodatages des `timestamptz(3)`.

### Protections SQL

Les tables métier portent `organization_id` et les tables parentes exposent `UNIQUE (organization_id, id)`. Au-delà du schéma Prisma, les migrations ajoutent :

- **19 clés étrangères composites** multi-tenant, dont 6 FK à 3 colonnes qui garantissent la cohérence événementielle des inscriptions, réservations, transactions et check-ins ;
- **6 index uniques partiels**, dont l'unicité d'une réservation active, d'un check-in valide, d'une transaction par inscription ou réservation et du code de stand après suppression logique ;
- **25 contraintes `CHECK`** (cohérence métier et `CHECK` littéral de `api_keys.scopes`) ;
- **3 tables immuables** (`check_ins`, `refunds`, `audit_logs`) protégées par triggers `BEFORE UPDATE OR DELETE` ;
- **plafond cumulatif des remboursements** vérifié sous verrou `FOR UPDATE`, en arithmétique `numeric`, uniquement pour les transactions `PAID` ou `PARTIALLY_REFUNDED` ;
- **trigger `updated_at`** sur les 14 tables mutables, avec sémantique « si inchangé » ;
- **5 index trigram GIN**, dont un index d'expression `((email)::text)` pour le `citext` ;
- **rôle groupe `eventpulse_app`** sans login : `SELECT, INSERT` seulement sur les tables immuables, `SELECT, INSERT, UPDATE, DELETE` sur les tables mutables, aucun `TRUNCATE` (le rôle propriétaire, lui, conserve ce privilège).

Ces objets ne sont pas représentés dans le schéma Prisma : `prisma migrate dev` ou `prisma migrate diff` peut proposer de les supprimer. Ces suggestions ne doivent jamais être appliquées sans revue. `npm run db:check:migrations` refuse toute suppression non autorisée d'un objet protégé, et `npm run db:verify:integrity` vérifie 126 contrôles de catalogue (FK, index, `CHECK`, triggers, privilèges). La fonction de plafond des remboursements s'exécute avec un `search_path` fixé et des tables qualifiées `public.`, ce qui la protège du masquage par une table temporaire. Ces protections s'appliquent au rôle runtime : un propriétaire du schéma ou un superutilisateur peut toujours désactiver un trigger ou supprimer une contrainte, d'où l'obligation de restreindre et revoir ces opérations. Le détail du workflow, des rôles et des limites figure dans `docs/phase-4-implementation/DATABASE_HARDENING_RUNBOOK.md`.

### Workflow des migrations

```bash
# Après modification du schéma, générer une migration vide puis la relire
npx prisma migrate dev --create-only --schema apps/api/prisma/schema.prisma --name nom_de_la_migration

# Scanner les suppressions protégées puis appliquer les migrations en attente
npm run db:check:migrations
npm run prisma:migrate:status
npm run prisma:migrate:deploy

# Vérifier le catalogue réel
npm run db:verify:integrity
```

`prisma migrate dev` est réservé au développement local et ne doit pas être utilisé sur une base partagée. Les migrations déjà appliquées ne sont jamais modifiées ni supprimées. Le workflow n'utilise ni `prisma db push`, ni reset, ni suppression du volume PostgreSQL. Une correction de protection passe par une nouvelle migration additive, avec une directive `-- integrity-guard: allow DROP …` uniquement lorsqu'un remplacement est réellement voulu.

### Tests d'intégrité PostgreSQL

```bash
npm run test:integration
```

Les tests utilisent une base dédiée dont le nom finit par `_test` (`eventpulse_test` par défaut). Le `globalSetup` refuse tout autre nom, crée la base si elle est absente, exécute le scanner puis `prisma migrate deploy`. La base n'est jamais reset, droppée ou truncate.

La suite couvre le manifeste complet et ses identités exactes, la matrice de couverture des 19 FK composites, le plafond et la concurrence des remboursements (avec `SQLSTATE` et neutralisation du `search_path`), l'immuabilité par SQL direct et par Prisma, la cohérence événementielle, les scopes API (`NULL` refusé, doublons et tableau vide acceptés), `updated_at`, les privilèges effectifs du groupe runtime (et, si `TEST_RUNTIME_LOGIN_ROLE` est défini, du login réel), les index trigram et les index partiels. Le scanner de migrations est une analyse lexicale : la revue humaine reste requise pour le SQL dynamique.

Le scénario d'authentification `test/integration/auth.test.ts` s'exécute sur PostgreSQL réel avec un vrai `RateLimiter` : hachage des sessions et audit, sélection et changement d'organisation, compte désactivé, rotation et détection de réutilisation, refresh concurrent, verrouillage limité à l'IP attaquante, session sans organisation, logout global, expiration absolue et réinitialisation de mot de passe. Il vérifie aussi qu'un refus du quota de reset par compte n'invalide pas le dernier jeton encore valide. Les tests unitaires couvrent Argon2id, les jetons JWT (claims, audience, UUID, algorithmes), les sessions, les schémas Zod, le rate limiting et les erreurs Redis ; les tests HTTP vérifient les contrats de routes, les cookies et l'absence de fuite de secrets.

Les tests Redis réels sont conditionnels et utilisent un conteneur dédié sans volume :

```bash
docker compose up -d redis-test
TEST_REDIS_URL=redis://localhost:6380/15 npm run test:integration
```

Sans `TEST_REDIS_URL`, la suite Redis est explicitement ignorée (`describe.skip`) ; les autres tests d'intégration continuent de s'exécuter. Avec la variable définie, les scripts Lua d'incrément et d'extension de verrou, l'atomicité concurrente, le fail-closed sur endpoint indisponible et la recréation du client partagé après `end` sont exercés contre un vrai serveur. Ne jamais pointer `TEST_REDIS_URL` vers une instance de production.

Inspection et validation :

```bash
npm run prisma:validate
npm run prisma:generate
npm run prisma:studio
docker exec -it eventpulse-analytics-postgres-1 psql -U eventpulse -d eventpulse -c '\dt'
```

Le client Prisma est un singleton créé dans `src/database/prisma.ts`. Le serveur établit la connexion avant d'accepter des requêtes HTTP et ferme la connexion après l'arrêt du serveur. Une connexion impossible empêche le démarrage ; `npm run db:check` connecte Prisma et exécute `SELECT 1` pour vérifier la disponibilité. Les tests unitaires utilisent un client simulé et ne nécessitent pas PostgreSQL.

## Endpoints disponibles

| Méthode  | Chemin                          | Authentification | Réponse                                            |
| -------- | ------------------------------- | ---------------- | -------------------------------------------------- |
| `GET`    | `/health`                       | Aucune           | `200` avec `{"status":"ok"}`                       |
| `GET`    | `/health/ready`                 | Aucune           | `200` avec état dégradé et capacités désactivées   |
| `POST`   | `/api/v1/auth/login`            | Aucune           | `200` `{ data: { accessToken, tokenType, expiresIn, user, activeOrganization } }` + cookie `ep_rt` |
| `POST`   | `/api/v1/auth/refresh`          | Cookie `ep_rt`   | `200` nouveaux access token et refresh token       |
| `POST`   | `/api/v1/auth/logout`           | Bearer ou cookie | `204`, cookie effacé                               |
| `POST`   | `/api/v1/auth/logout-all`       | Bearer           | `204`, toutes les sessions révoquées               |
| `GET`    | `/api/v1/auth/me`               | Bearer           | `200` utilisateur, organisation active, rôle       |
| `GET`    | `/api/v1/auth/sessions`         | Bearer           | `200` liste bornée de sessions sans secret         |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | Bearer        | `204` session révoquée (cookie effacé si session courante) |
| `POST`   | `/api/v1/auth/switch-organization` | Bearer        | `200` nouveaux jetons pour l'organisation choisie  |
| `POST`   | `/api/v1/auth/password/forgot`  | Aucune           | `204` réponse générique, sans énumération de comptes |
| `POST`   | `/api/v1/auth/password/reset`   | Aucune           | `204`, mot de passe remplacé et sessions révoquées |

`GET /health` est un contrôle HTTP simple permettant de vérifier que le processus répond. Ce n'est pas un contrôle avancé de disponibilité des dépendances externes.

`GET /health/ready` expose un signal opérationnel non sensible. Il répond `200` avec `status: "degraded"` et `checks.passwordResetEmail = { provider: "none", deliveryEnabled: false, reason: "no_provider_configured", intentionalNoOpInDevelopment }`. Le processus reste prêt à servir le trafic : l'absence de fournisseur mail est une limite fonctionnelle connue, pas une indisponibilité HTTP. Au démarrage, le serveur journalise également un avertissement structuré `Password reset email delivery is disabled`. Aucun secret, email ou jeton n'est exposé.

Le préfixe `/api/v1` expose uniquement le module d'authentification à ce stade. Toute autre requête sous `/api/v1` ou ailleurs retourne une erreur `404` au format Problem Details.

### Authentification

- **Mots de passe** : hachage Argon2id (65 536 KiB, 3 itérations, parallélisme 1). Un compte inconnu vérifie un hash factice afin de réduire les écarts de latence.
- **Access token** : JWT HS256 signé avec `JWT_ACCESS_SECRET`, durée 15 minutes par défaut, portant `sub`, `sid`, `org`, `role`, `jti`, `typ=access`, `kid`, `iss` et `aud`. La vérification impose l'algorithme, l'émetteur, l'audience, le `kid` actif, la présence de tous les claims requis et un format UUID canonique pour `sub`, `sid`, `org` et `jti`.
- **Refresh token** : valeur opaque de 256 bits, stockée uniquement sous forme hachée avec `REFRESH_TOKEN_PEPPER`, transportée exclusivement par le cookie `ep_rt` (`HttpOnly`, `Secure` en production, `SameSite=Strict`, `Path=/api/v1/auth`). Chaque rafraîchissement effectue une rotation ; la réutilisation d'un jeton déjà tourné révoque toute la famille de sessions.
- **Sessions** : expiration glissante de 7 jours dans la limite absolue de 30 jours (`sessions.absolute_expires_at`). Le nombre de sessions actives est plafonné ; les plus anciennes sont révoquées. `sessions.organization_id` reste nullable pour compatibilité transitoire : toute session persistée avec une organisation nulle est rejetée et sa famille est révoquée au refresh ; l'authentification Bearer et optionnelle la rejette aussi. Aucune migration `NOT NULL` n'est introduite avant l'analyse du module Organizations.
- **Organisation active** : `organizationId` est optionnel au login. Une seule appartenance active est sélectionnée automatiquement ; plusieurs appartenances sans choix explicite renvoient `409 AUTH_ORGANIZATION_REQUIRED`, et l'absence d'appartenance renvoie `403 AUTH_NO_ACTIVE_MEMBERSHIP`. `switch-organization` vérifie l'appartenance côté serveur et effectue une rotation des jetons.
- **Réinitialisation** : jeton de 256 bits valable 30 minutes, à usage unique, stocké haché. Une nouvelle demande acceptée invalide les jetons précédents non utilisés ; une demande refusée par le quota par compte ne touche à aucun jeton. Un reset réussi révoque toutes les sessions. `MailPort` transporte le lien ; `NullMailPort` échoue explicitement en production avant toute création de jeton, au lieu de simuler un envoi. La réponse publique reste toujours `204` et ne garantit pas la livraison. Un plancher de latence de 250 ms (configurable dans les tests) réduit les écarts entre compte actif, inconnu, désactivé et requête throttlée ; il ne garantit pas une égalité temporelle absolue.
- **Rate limiting et verrouillage** : compteurs Redis atomiques et progressifs — login `10` tentatives par 15 minutes par IP et compte, forgot `5` par heure et par IP et `5` par heure par compte, refresh `60` par heure par session, routes authentifiées `300` par minute et par utilisateur. Après `5` échecs, le verrouillage croît de 60 secondes jusqu'à 24 heures. Le verrouillage de connexion est désormais limité au couple **compte + IP** : un attaquant qui connaît un email ne peut pas verrouiller durablement le compte depuis une autre IP, sans supprimer la protection progressive ni le quota par IP+compte. En production, une indisponibilité Redis produit `503 AUTH_REDIS_UNAVAILABLE` au lieu d'un contournement silencieux.
- **Refresh concurrent** : la protection contre le rejeu est conservée. Deux refresh simultanés avec le même jeton produisent au plus un succès ; le perdant révoque toute la famille, y compris le jeton gagnant. Ce comportement est volontairement sûr et peut surprendre un client multi-onglets ; le frontend devra utiliser un rafraîchissement single-flight. Aucun assouplissement de la détection de rejeu n'est effectué côté backend.
- **Audit** : les connexions réussies, échecs, révocations, changements d'organisation et resets sont journalisés via `AuditPort`. Les échecs anonymes ne sont audités que lorsque l'organisation est identifiée de façon fiable. Les écritures d'arrière-plan sont attendues avec un timeout borné lors de l'arrêt gracieux ; un timeout ou un échec est journalisé sans secret. L'audit reste best-effort en cas d'arrêt brutal ou de panne durable de la base ; il n'existe ni Outbox ni tenant système.
- **CSRF** : les opérations à effet de session vérifient l'en-tête `Origin` contre l'allowlist CORS ; les cookies sont `SameSite=Strict` et le logout par cookie exige une origine autorisée.

## Gestion des erreurs et sécurité HTTP

- **Helmet** applique des en-têtes HTTP de sécurité.
- **CORS** applique une allowlist explicite d'origines configurées par `CORS_ALLOWED_ORIGINS`, avec les credentials activés (indispensables au cookie de refresh), les méthodes `GET`, `POST`, `PATCH` et `DELETE`, et les en-têtes `Content-Type`, `Authorization` et `X-Request-Id`. Le cache de préflight est de 600 secondes. Les jokers sont refusés et, en production, aucune origine n'est autorisée sans configuration explicite.
- **Cookies** : le refresh token utilise un cookie `HttpOnly` `SameSite=Strict`, `Secure` en production, limité au chemin `/api/v1/auth`. La suppression réutilise les mêmes attributs de chemin, domaine et sécurité.
- **Proxy** : `TRUST_PROXY_HOPS` fixe le nombre exact de proxys de confiance pour déterminer l'IP cliente utilisée par le rate limiting. La valeur booléenne `true` est refusée.
- **Request ID** : un identifiant valide fourni dans `X-Request-Id` est conservé, sinon un UUID est généré. L'identifiant est renvoyé dans la réponse et associé au logger de la requête.
- **Problem Details** : les erreurs HTTP utilisent le type de contenu `application/problem+json` et exposent notamment `type`, `title`, `status`, `detail`, `instance`, `code` et `requestId`. Les erreurs de validation ajoutent un tableau `errors` avec `path`, `code` et `message`, sans exposer les valeurs soumises.
- **Corps JSON** : la limite est fixée à `100kb`. Un JSON malformé produit une erreur `400 INVALID_JSON` et un payload trop volumineux une erreur `413 PAYLOAD_TOO_LARGE`.
- **Erreurs inattendues** : elles sont converties en réponse `500 INTERNAL_SERVER_ERROR` sans exposer les détails internes.
- **Logger structuré** : Pino produit des logs JSON horodatés, avec le champ `service`, le contexte de requête et le masquage des champs sensibles courants tels que les mots de passe, tokens, en-têtes d'autorisation, cookies, secrets et clés API.

L'authentification est implémentée. Le contrôle d'accès par rôle (RBAC) et les guards d'autorisation par ressource restent à construire dans une phase ultérieure.

## Arrêt gracieux

Le serveur gère les signaux `SIGTERM` et `SIGINT` :

1. le signal reçu est journalisé ;
2. le serveur arrête d'accepter de nouvelles connexions ;
3. les connexions inactives sont fermées ;
4. les requêtes en cours peuvent se terminer ;
5. le serveur HTTP journalise sa fermeture ;
6. les audits d'arrière-plan sont vidés avec un timeout borné (3 s par défaut), puis le résultat est journalisé ;
7. la connexion Prisma est fermée et journalisée ;
8. la connexion Redis partagée est fermée et journalisée.

L'arrêt est idempotent : plusieurs appels ou signaux ne déclenchent pas plusieurs fermetures concurrentes. Un délai maximal de **10 secondes** est appliqué. En cas de dépassement, un avertissement est journalisé et les connexions restantes sont fermées de force avec les API natives de Node.js.

Le processus n'appelle pas `process.exit()` lors d'un arrêt normal ; il se termine naturellement une fois les handles libérés. Sous Windows, la livraison de signaux POSIX dépend du terminal ou du processus appelant.

## État du développement

### Déjà présent

- Monorepo npm et workspace `@eventpulse/api` ;
- TypeScript strict en mode ESM avec scripts de build ;
- configuration et validation des variables d'environnement ;
- logger Pino structuré et masquage des données sensibles ;
- middleware Request ID et logging HTTP ;
- modèle d'erreur centralisé et réponses Problem Details ;
- validation réutilisable des corps, paramètres de route et paramètres de requête avec Zod ;
- utilitaires de réponses de succès et de pagination par curseur ;
- application Express avec Helmet, CORS, limite JSON et gestion globale des erreurs ;
- composition centralisée des routes et espace versionné `/api/v1` ;
- endpoints `GET /health` et `GET /health/ready` (capacités dégradées non sensibles) ;
- serveur HTTP natif avec arrêt gracieux, timeout, flush d'audit borné et gestion des signaux ;
- PostgreSQL 16 local via Docker Compose ;
- modèle de données métier Prisma (20 tables, 25 enums) et migrations versionnées ;
- contraintes d'intégrité SQL : extensions `citext` et `pg_trgm`, contraintes d'unicité partielles, `CHECK`, clés étrangères composites multi-tenant et cohérence événementielle à 3 colonnes ;
- triggers de plafond de remboursement, d'immuabilité (`check_ins`, `refunds`, `audit_logs`) et de `updated_at` ;
- index trigram et séparation des privilèges entre rôle de migration et rôle runtime `eventpulse_app` ;
- vérificateur de catalogue PostgreSQL, scanner de migrations et manifeste d'intégrité ;
- tests d'intégrité PostgreSQL sur base `_test` dédiée ;
- authentification complète : Argon2id, JWT d'accès, refresh tokens opaques avec rotation et détection de réutilisation, sessions glissantes et absolues, cookie `HttpOnly`/`SameSite=Strict` ;
- sélection d'organisation, changement d'organisation, listing et révocation de sessions ;
- réinitialisation de mot de passe à usage unique avec invalidation des jetons antérieurs ;
- rate limiting Redis, verrouillage progressif limité à compte+IP et échec fermé en production ;
- tests Redis réels conditionnels via le service `redis-test` isolé ;
- audit des événements d'authentification via `AuditPort`, avec flush borné au shutdown ;
- Prisma Client, connexion au démarrage, fermeture au shutdown et contrôle `SELECT 1` ;
- tests unitaires, HTTP et d'intégration PostgreSQL avec Vitest et Supertest ;
- ESLint et Prettier.

### Non implémenté à ce stade

- seeds et modules métier (événements, participants, inscriptions, billets, paiements, check-ins, exposants, stands) ;
- RBAC, guards d'autorisation par ressource et politiques d'accès fines ;
- envoi réel d'emails transactionnels (seul `NullMailPort` existe ; la livraison est désactivée et signalée via `/health/ready`) ;
- Outbox d'audit durable et worker de purge des sessions/jetons ;
- KPI, analytiques, rapports et exports ;
- files d'attente et workers ;
- temps réel ;
- frontend ;
- CI/CD et déploiement.

Les prochaines étapes consistent à construire les modules métier, le RBAC et l'envoi d'emails sur ce socle. Les documents disponibles sous `docs/` décrivent la conception cible ; ils ne signifient pas que les fonctionnalités correspondantes sont toutes déjà opérationnelles.
