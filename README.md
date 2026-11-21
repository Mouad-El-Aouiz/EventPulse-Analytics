# EventPulse Analytics

Backend Foundation — Phase 4A.1

EventPulse Analytics est une plateforme SaaS B2B de gestion événementielle et d'analytique destinée aux organisateurs de salons professionnels, d'expositions, de conférences et de workshops.

La vision produit est de centraliser les données opérationnelles de plusieurs événements dans un référentiel isolé par organisation, de calculer des KPI auditables et de produire des tableaux de bord, rapports et exports. Le backend présent dans ce dépôt constitue uniquement le socle technique de cette plateforme.

> **Statut actuel :** les fonctionnalités métier, la persistance en base de données, l'authentification, les analytiques et le frontend ne sont pas encore implémentés.

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
| PostgreSQL     | Cible future | Aucune connexion base de données n'est encore implémentée |

Les couches de données, files d'attente, authentification, autorisation et fonctionnalités métier ne font pas partie de l'état actuel du code.

## Prérequis

- Node.js **22.x** (`>=22 <23`, version indiquée dans `.nvmrc`) ;
- npm compatible avec le projet ;
- Git.

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

npm installe les dépendances du workspace `@eventpulse/api` depuis la racine du monorepo.

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

| Variable    | Valeurs autorisées                                           | Valeur par défaut |
| ----------- | ------------------------------------------------------------ | ----------------- |
| `NODE_ENV`  | `development`, `test`, `production`                          | `development`     |
| `PORT`      | Entier de `1` à `65535`                                      | `3000`            |
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` | `info`            |

La configuration est validée avec Zod au chargement du module d'environnement, avant le démarrage du serveur. En l'absence d'une variable, sa valeur par défaut s'applique ; une valeur invalide ou hors limites provoque une erreur explicite.

Les fichiers `.env` locaux sont ignorés par Git. Ne jamais placer de secrets réels dans le dépôt ou dans `.env.example`.

## Commandes disponibles

Les scripts racine délèguent leur exécution au workspace `@eventpulse/api`.

| Commande                | Rôle                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `npm run start`         | Démarre la version compilée avec `node apps/api/dist/server.js` |
| `npm run build`         | Compile le backend dans `apps/api/dist/`                        |
| `npm run test`          | Exécute la suite Vitest une fois                                |
| `npm run test:watch`    | Exécute Vitest en mode watch                                    |
| `npm run test:coverage` | Exécute les tests avec couverture V8                            |
| `npm run lint`          | Analyse le code avec ESLint                                     |
| `npm run lint:fix`      | Applique les corrections ESLint disponibles                     |
| `npm run format`        | Formate le code avec Prettier                                   |
| `npm run format:check`  | Vérifie le formatage sans modifier les fichiers                 |
| `npm run typecheck`     | Vérifie les types sans générer de fichiers                      |

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
│       │   ├── errors/
│       │   │   ├── app-error.ts
│       │   │   └── problem-details.ts
│       │   └── middleware/
│       │       ├── error-handler.ts
│       │       └── request-logger.ts
│       ├── test/
│       │   ├── http/
│       │   │   ├── app.test.ts
│       │   │   ├── request-logger.test.ts
│       │   │   ├── server.test.ts
│       │   │   └── supertest.test.ts
│       │   └── unit/
│       │       ├── env-loader.test.ts
│       │       ├── env.test.ts
│       │       ├── get-runtime-info.test.ts
│       │       ├── logger.test.ts
│       │       ├── server-import.test.ts
│       │       └── errors/
│       │           ├── app-error.test.ts
│       │           └── problem-details.test.ts
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
├── eslint.config.js
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.base.json
```

### Rôle des principaux fichiers

- `app.ts` : construit l'application Express, configure Helmet, CORS, le logger de requêtes, la limite JSON, expose `GET /health`, gère les routes inconnues et branche le gestionnaire d'erreurs central.
- `server.ts` : point d'entrée du serveur HTTP. Il crée le serveur natif Node.js, l'écoute sur `PORT`, expose le cycle de vie et installe les handlers de signaux. Le serveur n'est démarré que lorsque ce fichier est exécuté directement.
- `index.ts` : expose le nom du service et les informations de runtime. Ce fichier n'est pas le point d'entrée du serveur.
- `config/` : schéma et chargement de l'environnement, ainsi que la configuration Pino.
- `middleware/` : Request ID, logging HTTP et traitement centralisé des erreurs.
- `errors/` : classe `AppError` et conversion des erreurs vers le format Problem Details.
- `test/` : tests unitaires et tests HTTP avec Vitest et Supertest.
- `docs/` : documentation de découverte produit, UX et architecture de conception.

## Endpoints disponibles

| Méthode | Chemin    | Réponse                      |
| ------- | --------- | ---------------------------- |
| `GET`   | `/health` | `200` avec `{"status":"ok"}` |

`GET /health` est un contrôle HTTP simple permettant de vérifier que le processus répond. Ce n'est pas un contrôle avancé de disponibilité des dépendances externes.

Aucune route métier, d'authentification ou d'administration n'est exposée à ce stade. Toute autre route retourne une erreur `404` au format Problem Details.

## Gestion des erreurs et sécurité HTTP

- **Helmet** applique des en-têtes HTTP de sécurité.
- **CORS** autorise en développement l'origine `http://localhost:5173`, avec les méthodes `GET`, `POST`, `PATCH` et `DELETE`, et les en-têtes `Content-Type`, `Authorization` et `X-Request-Id`. Les credentials sont désactivés et le cache de préflight est de 600 secondes. En production, aucune origine cross-origin n'est autorisée par défaut.
- **Request ID** : un identifiant valide fourni dans `X-Request-Id` est conservé, sinon un UUID est généré. L'identifiant est renvoyé dans la réponse et associé au logger de la requête.
- **Problem Details** : les erreurs HTTP utilisent le type de contenu `application/problem+json` et exposent notamment `type`, `title`, `status`, `detail`, `instance`, `code` et `requestId`.
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
5. la fermeture est journalisée lorsque le serveur est complètement arrêté.

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
- application Express avec Helmet, CORS, limite JSON et gestion globale des erreurs ;
- endpoint `GET /health` ;
- serveur HTTP natif avec arrêt gracieux, timeout et gestion des signaux ;
- tests unitaires et HTTP avec Vitest et Supertest ;
- ESLint et Prettier.

### Non implémenté à ce stade

- connexion PostgreSQL et couche de persistance ;
- authentification, autorisation et RBAC ;
- modules métier (événements, participants, inscriptions, billets, paiements, check-ins, exposants, stands) ;
- KPI, analytiques, rapports et exports ;
- files d'attente et workers ;
- temps réel ;
- frontend ;
- Docker, CI/CD et déploiement.

Les prochaines étapes consistent à construire la couche de données, les modules métier et les mécanismes de sécurité sur ce socle. Les documents disponibles sous `docs/` décrivent la conception cible ; ils ne signifient pas que les fonctionnalités correspondantes sont déjà opérationnelles.
