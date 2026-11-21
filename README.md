# EventPulse Analytics

Backend Foundation — Phase 4A.3.1

EventPulse Analytics est une plateforme SaaS B2B de gestion événementielle et d'analytique destinée aux organisateurs de salons professionnels, d'expositions, de conférences et de workshops.

La vision produit est de centraliser les données opérationnelles de plusieurs événements dans un référentiel isolé par organisation, de calculer des KPI auditables et de produire des tableaux de bord, rapports et exports. Le backend présent dans ce dépôt constitue uniquement le socle technique de cette plateforme.

> **Statut actuel :** les fonctionnalités métier, la persistance métier, l'authentification, les analytiques et le frontend ne sont pas encore implémentés.

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

Le modèle métier, les migrations, les repositories, l'authentification et les fonctionnalités métier ne font pas partie de l'état actuel du code.

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

npm installe les dépendances du workspace `@eventpulse/api` depuis la racine du monorepo. Le script `postinstall` du workspace génère ensuite le Prisma Client à partir du schéma minimal, sans nécessiter de base active.

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

| Variable            | Valeurs autorisées                                           | Valeur par défaut |
| ------------------- | ------------------------------------------------------------ | ----------------- |
| `NODE_ENV`          | `development`, `test`, `production`                          | `development`     |
| `PORT`              | Entier de `1` à `65535`                                      | `3000`            |
| `LOG_LEVEL`         | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` | `info`            |
| `DATABASE_URL`      | URL PostgreSQL (`postgresql://` ou `postgres://`)            | Obligatoire       |
| `DATABASE_POOL_SIZE` | Entier supérieur ou égal à `1`                              | `10`              |

Le fichier `.env.example` contient également `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` et `POSTGRES_PORT`, utilisés uniquement par Docker Compose. Le mot de passe fourni est réservé au développement local.

La configuration est validée avec Zod au chargement du module d'environnement, avant le démarrage du serveur. Les variables optionnelles ont une valeur par défaut ; `DATABASE_URL` est obligatoire et une valeur invalide ou hors limites provoque une erreur explicite.

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
| `npm run lint`           | Analyse le code avec ESLint                                     |
| `npm run lint:fix`       | Applique les corrections ESLint disponibles                     |
| `npm run format`         | Formate le code avec Prettier                                   |
| `npm run format:check`   | Vérifie le formatage sans modifier les fichiers                 |
| `npm run typecheck`      | Vérifie les types sans générer de fichiers                      |
| `npm run prisma:generate` | Génère le Prisma Client depuis le schéma minimal               |
| `npm run prisma:validate` | Valide le schéma Prisma                                        |
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
│       │   │   └── prisma.ts
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
│       │   └── routes/
│       │       ├── index.ts
│       │       ├── health.routes.ts
│       │       └── v1/
│       │           └── index.ts
│       ├── test/
│       │   ├── http/
│       │   │   ├── app.test.ts
│       │   │   ├── request-logger.test.ts
│       │   │   ├── routes.test.ts
│       │   │   ├── server.test.ts
│       │   │   ├── supertest.test.ts
│       │   │   └── validation.test.ts
│       │   └── unit/
│       │       ├── env-loader.test.ts
│       │       ├── env.test.ts
│       │       ├── get-runtime-info.test.ts
│       │       ├── logger.test.ts
│       │       ├── server-import.test.ts
│       │       ├── database/
│       │       │   └── prisma.test.ts
│       │       ├── errors/
│       │       │   ├── app-error.test.ts
│       │       │   ├── problem-details.test.ts
│       │       │   └── validation-error.test.ts
│       │       └── http/
│       │           ├── pagination.test.ts
│       │           └── responses.test.ts
│       ├── prisma/
│       │   └── schema.prisma
│       ├── package.json
│       ├── tsconfig.build.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── docs/
│   ├── phase-1-discovery/
│   ├── phase-2-ui-ux/
│   └── phase-3-architecture/
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
- `database/` : singleton Prisma, cycle de vie de la connexion et contrôle de disponibilité.
- `prisma/schema.prisma` : schéma Prisma minimal, sans modèle métier à ce stade.
- `middleware/` : Request ID, logging HTTP, validation Zod des requêtes et traitement centralisé des erreurs.
- `errors/` : classes `AppError` et `ValidationError`, conversion des erreurs vers le format Problem Details.
- `http/` : enveloppes de réponses de succès et calculs de pagination réutilisables.
- `routes/` : composition centralisée des routes, routeur API principal, espace versionné `/api/v1` et routeur de santé.
- `test/` : tests unitaires et tests HTTP avec Vitest et Supertest.
- `docs/` : documentation de découverte produit, UX et architecture de conception.

### Composition et versionnement des routes

Le routeur API principal est monté sur `/api`, puis le routeur de version sur `/v1`, ce qui expose le préfixe `/api/v1`. Les futurs routeurs de modules métier seront enregistrés dans `routes/v1/index.ts` afin de ne pas concentrer les routes dans `app.ts`. Aucun endpoint métier n'est encore enregistré dans cet espace.

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
npm run db:check
npm run db:down
```

`npm run db:down` arrête le conteneur sans supprimer le volume `postgres_data`.

Le schéma `apps/api/prisma/schema.prisma` configure uniquement le provider PostgreSQL et la génération du Prisma Client. Aucun modèle métier, aucune migration et aucun seed ne sont définis à ce stade ; la génération utilise l'option officielle `--allow-no-models`.

Le client Prisma est un singleton créé dans `src/database/prisma.ts`. Le serveur établit la connexion avant d'accepter des requêtes HTTP et ferme la connexion après l'arrêt du serveur. Une connexion impossible empêche le démarrage ; `npm run db:check` connecte Prisma et exécute `SELECT 1` pour vérifier la disponibilité. Les tests unitaires utilisent un client simulé et ne nécessitent pas PostgreSQL.

## Endpoints disponibles

| Méthode | Chemin    | Réponse                      |
| ------- | --------- | ---------------------------- |
| `GET`   | `/health` | `200` avec `{"status":"ok"}` |

`GET /health` est un contrôle HTTP simple permettant de vérifier que le processus répond. Ce n'est pas un contrôle avancé de disponibilité des dépendances externes.

Le préfixe `/api/v1` est monté et réservé aux futurs contrats métier. Aucune route métier, d'authentification ou d'administration n'est exposée à ce stade. Toute requête inconnue sous `/api/v1` ou ailleurs retourne une erreur `404` au format Problem Details.

## Gestion des erreurs et sécurité HTTP

- **Helmet** applique des en-têtes HTTP de sécurité.
- **CORS** autorise en développement l'origine `http://localhost:5173`, avec les méthodes `GET`, `POST`, `PATCH` et `DELETE`, et les en-têtes `Content-Type`, `Authorization` et `X-Request-Id`. Les credentials sont désactivés et le cache de préflight est de 600 secondes. En production, aucune origine cross-origin n'est autorisée par défaut.
- **Request ID** : un identifiant valide fourni dans `X-Request-Id` est conservé, sinon un UUID est généré. L'identifiant est renvoyé dans la réponse et associé au logger de la requête.
- **Problem Details** : les erreurs HTTP utilisent le type de contenu `application/problem+json` et exposent notamment `type`, `title`, `status`, `detail`, `instance`, `code` et `requestId`. Les erreurs de validation ajoutent un tableau `errors` avec `path`, `code` et `message`, sans exposer les valeurs soumises.
- **Corps JSON** : la limite est fixée à `100kb`. Un JSON malformé produit une erreur `400 INVALID_JSON` et un payload trop volumineux une erreur `413 PAYLOAD_TOO_LARGE`.
- **Erreurs inattendues** : elles sont converties en réponse `500 INTERNAL_SERVER_ERROR` sans exposer les détails internes.
- **Logger structuré** : Pino produit des logs JSON horodatés, avec le champ `service`, le contexte de requête et le masquage des champs sensibles courants tels que les mots de passe, tokens, en-têtes d'autorisation, cookies, secrets et clés API.

L'authentification et le contrôle d'accès par rôle (RBAC) ne sont pas implémentés dans cette phase.

## Arrêt gracieux

Le serveur gère les signaux `SIGTERM` et `SIGINT` :

1. le signal reçu est journalisé ;
2. le serveur arrête d'accepter de nouvelles connexions ;
3. les connexions inactives sont fermées ;
4. les requêtes en cours peuvent se terminer ;
5. le serveur HTTP journalise sa fermeture ;
6. la connexion Prisma est fermée et journalisée.

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
- endpoint `GET /health` ;
- serveur HTTP natif avec arrêt gracieux, timeout et gestion des signaux ;
- PostgreSQL 16 local via Docker Compose ;
- Prisma Client, connexion au démarrage, fermeture au shutdown et contrôle `SELECT 1` ;
- tests unitaires et HTTP avec Vitest et Supertest ;
- ESLint et Prettier.

### Non implémenté à ce stade

- modèle de données métier, migrations, seeds et repositories ;
- authentification, autorisation et RBAC ;
- modules métier (événements, participants, inscriptions, billets, paiements, check-ins, exposants, stands) ;
- KPI, analytiques, rapports et exports ;
- files d'attente et workers ;
- temps réel ;
- frontend ;
- CI/CD et déploiement.

Les prochaines étapes consistent à construire le modèle de données métier, les repositories, les modules métier et les mécanismes de sécurité sur ce socle. Les documents disponibles sous `docs/` décrivent la conception cible ; ils ne signifient pas que les fonctionnalités correspondantes sont déjà opérationnelles.
