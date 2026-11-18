# ADR.md — Architectural Decision Records

**Phase :** 3 — Software Architecture & Database Design

**Version :** 1.0

**Date :** 2026-11-18

**Statut global :** décisions acceptées et arbitrages de clôture validés le 2026-11-18

**Portée :** 11 décisions structurantes, alignées sur `ARCHITECTURE_OVERVIEW.md`

> Chaque ADR est accepté sous réserve de la validation finale de la Phase 3. Les décisions triviales ne sont pas documentées.

---

## ADR-001 — Monolithe modulaire avec worker dédié

**Statut :** Accepté

### Contexte

EventPulse couvre 15 modules, 5 rôles et une volumétrie de démonstration (50 000 inscriptions, 30 000 check-ins). Le projet est un portfolio destiné à démontrer une architecture professionnelle, pas à supporter une organisation ni une équipe de développement distribuée. Les imports et exports sont longs et doivent sortir du cycle HTTP.

### Décision

Construire un **monolithe modulaire** déployé en trois processus : API, worker, frontend statique. Les modules métier sont séparés par des frontières explicites (facades, ports, règles d'import), mais partagent un seul dépôt, une seule base et un seul déploiement applicatif.

### Alternatives

1. **Microservices** : rejetés. Complexité opérationnelle, cohérence transactionnelle, observabilité et coût de démonstration disproportionnés.
2. **Monolithe non modularisé** : rejeté. Couplage fort, frontières invisibles, tests d'isolation difficiles.
3. **Serverless par fonction** : rejeté. Le stack imposé est Express, et les transactions métier sont centrales.

### Justification

- Une seule transaction PostgreSQL pour les invariants forts (remboursement, réservation, dernier OWNER).
- Un worker séparé isole les traitements longs sans introduire de distribution métier.
- Les frontières de modules préparent une éventuelle extraction future sans la promettre.
- Le déploiement Docker Compose reste simple et démontrable.

### Conséquences

**Positives :**

- Transactions locales, pas de sagas.
- Débogage et tests simplifiés.
- Frontières vérifiables par lint et revue.

**Négatives :**

- Un déploiement couple API et modules.
- Le worker partage du code avec l'API : une erreur de packaging peut affecter les deux.
- La scalabilité est horizontale par processus, pas par module.

**Mesures :**

- Règles d'import ESLint.
- Test d'architecture.
- Worker sans port HTTP.
- Aucun accès direct du worker aux repositories d'un autre module.

---

## ADR-002 — Multi-tenant à schéma partagé avec `organization_id`

**Statut :** Accepté

### Contexte

Le produit est multi-organisations. Chaque entité métier doit être isolée. La volumétrie et le modèle économique (portfolio) ne justifient ni une base par tenant ni un schéma par tenant.

### Décision

Utiliser **une base et un schéma partagés**, avec `organization_id NOT NULL` sur toute table métier, des clés étrangères composites incluant `organization_id` et un filtrage systématique dans les repositories.

### Alternatives

1. **Base par tenant** : rejetée. Coût de provisioning, migrations multiples, agrégats inter-organisations inutiles ici.
2. **Schéma par tenant** : rejeté. Complexité des migrations et du pooling pour un bénéfice nul à cette échelle.
3. **Row Level Security PostgreSQL** : non retenue en V1. Défense possible, mais ajoute une couche de politique difficile à tester et à déboguer ; les FK composites offrent déjà une garantie structurelle.

### Justification

- Simplicité opérationnelle et migrations uniques.
- Les FK composites rendent un croisement d'organisations impossible au niveau SQL.
- Les tests cross-tenant sont directs.
- Aucun besoin d'agrégation inter-organisations.

### Conséquences

**Positives :**

- Isolation défendue à plusieurs couches.
- Un seul pool de connexions.
- Sauvegardes et migrations simples.

**Négatives :**

- Risque de requête sans filtre si le repository est mal écrit.
- Index composites plus volumineux.
- Un incident base affecte tous les tenants.

**Mesures :**

- `organization_id` en première position des index.
- Interdiction de `findUnique(id)` nu.
- Suite d'isolation bloquante.
- 404 pour toute ressource hors tenant.
- RLS pourra être ajouté plus tard sans changer le modèle.

---

## ADR-003 — RBAC par registre d'actions et portées

**Statut :** Accepté

### Contexte

Cinq rôles, des restrictions par événement, des règles de gouvernance (dernier OWNER, ADMIN hors OWNER) et une matrice approuvée de 11 sections. Les permissions ne doivent pas dépendre du frontend.

### Décision

Centraliser les autorisations dans un **registre serveur d'actions** : chaque route déclare une action, un rôle minimal et une portée (`ORGANIZATION` ou `EVENT`). Un service de politique vérifie ensuite l'objet réel (appartenance, assignation, état).

### Alternatives

1. **Vérifications ad hoc par controller** : rejeté. Duplication, oublis, incohérences.
2. **CASL ou moteur de règles externe** : rejeté. Sur-dimensionné pour 5 rôles statiques.
3. **Permissions stockées en base par utilisateur** : rejeté. Le PRD définit des rôles, pas des permissions granulaires configurables.
4. **Contrôle frontend** : rejeté. Non sécurisant.

### Justification

- Une seule source de vérité pour la matrice.
- Les tests RBAC peuvent énumérer les actions.
- Les restrictions ADMIN/OWNER et la portée événement sont explicites.
- Le refus par défaut est simple à garantir.

### Conséquences

**Positives :**

- Tests systématiques par rôle.
- Documentation OpenAPI `x-roles` alignée.
- Ajout d'une route = ajout d'une entrée au registre.

**Négatives :**

- Le registre doit rester synchronisé avec les routes.
- Les règles d'objet restent dans les services, donc une double vérification est nécessaire.
- Les actions très spécifiques peuvent alourdir le registre.

**Mesures :**

- Test qui vérifie que chaque route possède une politique.
- Revue de toute route sans `authorize`.
- Test RBAC pour chaque action.

---

## ADR-004 — JWT court + sessions refresh rotatives liées à l'organisation

**Statut :** Accepté

### Contexte

Le stack impose JWT, refresh token rotation, Argon2 et RBAC. L'organisation active doit être vérifiée à chaque requête. Le frontend ne doit pas stocker de jeton durable.

### Décision

- **Access token JWT de 15 minutes**, conservé en mémoire côté client.
- **Refresh token opaque de 7 jours**, en cookie `HttpOnly`, `Secure`, `SameSite=Strict`, stocké haché en base.
- **Rotation à chaque refresh**, avec détection de réutilisation par famille.
- Session liée à l'organisation active ; changement d'organisation = nouveau couple de jetons.
- Le rôle est rechargé depuis le membership à chaque requête.

### Alternatives

1. **Session serveur uniquement** : rejetée. Le stack impose JWT.
2. **Refresh token en `localStorage`** : rejeté. Exposition XSS.
3. **JWT longue durée** : rejeté. Révocation difficile.
4. **Access token en cookie** : rejeté. CSRF plus complexe et couplage au navigateur pour les clients API.
5. **Rôle uniquement dans le JWT** : rejeté. Un changement de rôle ne serait pas immédiat.

### Justification

- Compromis standard entre sécurité, UX et stack imposé.
- La rotation détecte le vol de refresh.
- Le cookie `SameSite=Strict` réduit le CSRF.
- Le rechargement du membership garantit l'immédiateté des droits.

### Conséquences

**Positives :**

- Révocation par session et par famille.
- Pas de jeton durable accessible au JavaScript.
- Changement d'organisation explicite et audité.

**Négatives :**

- Une requête par 15 minutes peut payer un refresh.
- Les onglets multiples doivent coordonner le refresh.
- Le cookie impose une configuration CORS précise.

**Mesures :**

- Refresh single-flight côté client.
- Vérification d'origine sur `/auth/refresh`.
- Tests de rejeu et d'expiration.
- Révocation de famille auditée.

---

## ADR-005 — Prisma + migrations SQL pour les contraintes avancées

**Statut :** Accepté

### Contexte

Prisma est imposé. Il ne modélise pas nativement les index partiels, les CHECK complexes, les FK composites multi-colonnes avec tenant, ni les triggers. Les invariants critiques doivent être garantis par PostgreSQL.

### Décision

Utiliser Prisma pour le mapping, les requêtes et la migration de base, puis ajouter des **migrations SQL revues** pour :

- extensions `citext` et `pg_trgm` ;
- index partiels uniques ;
- FK composites incluant `organization_id` ;
- contraintes CHECK ;
- triggers d'immuabilité et de plafond ;
- index trigram ;
- privilèges restreints.

### Alternatives

1. **Tout en Prisma** : impossible pour les contraintes conditionnelles.
2. **Tout en SQL manuel** : rejeté. Perte de productivité et de typage.
3. **Contraintes uniquement applicatives** : rejeté. Courses, bugs et opérations manuelles contourneraient les règles.
4. **Trigger pour toutes les transitions métier** : rejeté. Messages pauvres, logique dispersée.

### Justification

- PostgreSQL garantit les invariants même en cas de concurrence.
- Prisma reste lisible et productif.
- Les migrations personnalisées sont explicites et testables.
- Les règles métier restent dans les services pour les messages et l'audit.

### Conséquences

**Positives :**

- Unicité partielle fiable.
- Immuabilité réelle.
- Plafond de remboursement impossible à contourner.
- Modèle Prisma lisible.

**Négatives :**

- Deux sources de vérité de schéma à synchroniser.
- `prisma migrate diff` peut proposer d'annuler les FK composites.
- Les triggers sont moins portables et plus difficiles à déboguer.

**Mesures :**

- Migrations nommées et revues.
- Tests SQL directs.
- Documentation des écarts Prisma/SQL.
- Aucun `db push` sur base partagée.

---

## ADR-006 — Analytique sur la base opérationnelle, sans entrepôt

**Statut :** Accepté

### Contexte

24 KPI, 24 mois, 50 000 inscriptions, 30 000 check-ins. Le produit est un portfolio et doit rester simple. Un entrepôt ou des snapshots ajouteraient une infrastructure et une seconde source de vérité.

### Décision

Calculer les KPI **à la demande**, en lecture seule, sur les tables opérationnelles PostgreSQL, via une couche de requêtes analytiques dédiée. Aucune table de snapshot, aucune vue matérialisée, aucun entrepôt en V1.

### Alternatives

1. **Entrepôt (dbt, ClickHouse, BigQuery)** : rejeté. Sur-dimensionné, coût et complexité.
2. **Tables de snapshots KPI** : rejetées. Risque de divergence et de double vérité.
3. **Vues matérialisées** : rejetées en V1. Maintenance et fraîcheur à gérer pour un gain non démontré.
4. **Calcul côté client** : rejeté. Divergence, PII, performance.

### Justification

- Les volumes tiennent avec les index appropriés.
- Une seule source de vérité.
- Les formules restent au même endroit.
- Le cache Redis optionnel absorbe les pics.

### Conséquences

**Positives :**

- Pas de pipeline de rafraîchissement.
- Cohérence immédiate avec les données opérationnelles.
- Coût d'infrastructure minimal.

**Négatives :**

- Requêtes analytiques sur les tables de production.
- Risque de requête lente si mal indexée.
- La scalabilité au-delà de la volumétrie cible n'est pas garantie.

**Mesures :**

- Couche read-only isolée.
- Index composites.
- Budget de latence < 2 s.
- Cache Redis optionnel.
- `EXPLAIN ANALYZE` sur les requêtes critiques.

---

## ADR-007 — BullMQ avec jobs idempotents

**Statut :** Accepté

### Contexte

Imports, exports et purge doivent être asynchrones, reprenables et traçables. Redis et BullMQ sont imposés. Les jobs peuvent être rejoués après crash ou redémarrage.

### Décision

Utiliser BullMQ avec :

- `jobId` = identifiant de l'entité ;
- retries avec backoff exponentiel ;
- erreurs non réessayables marquées immédiatement ;
- idempotence à l'acceptation et à l'exécution ;
- import atomique en une transaction ;
- suivi de statut en base ;
- pas de table DLQ dédiée.

### Alternatives

1. **Traitement synchrone** : rejeté. Blocage HTTP et timeouts.
2. **Cron + table de jobs maison** : rejeté. Réinvention de BullMQ, imposé par le stack.
3. **Kafka ou RabbitMQ** : rejeté. Sur-dimensionné et hors stack.
4. **DLQ dédiée** : rejetée. Le statut métier et l'ensemble `failed` suffisent.

### Justification

- Stack imposé.
- Idempotence nécessaire pour les rejeux.
- Le statut métier est plus utile au produit que l'état interne de la file.
- Le worker séparé limite l'impact sur l'API.

### Conséquences

**Positives :**

- Reprise automatique.
- Traçabilité par entité.
- Aucune double génération de fichier.

**Négatives :**

- Transaction d'import longue.
- Redis devient une dépendance critique.
- Les jobs interrompus peuvent rester `PROCESSING` sans supervision.

**Mesures :**

- Supervision des files et des statuts bloqués.
- Timeouts.
- Tests de rejeu.
- Persistance Redis recommandée.
- Aucune donnée métier durable dans Redis.

---

## ADR-008 — Stockage objet privé et URLs signées

**Statut :** Accepté

### Contexte

Les fichiers d'import et d'export contiennent des données sensibles. Ils ne doivent pas transiter par le système de fichiers public ni être servis par l'API sans contrôle.

### Décision

Stocker les fichiers dans un **bucket S3-compatible privé**, avec des clés préfixées par organisation. L'API vérifie les droits puis génère une **URL signée de 15 minutes**. Le worker écrit les fichiers mais ne signe jamais d'URL.

### Alternatives

1. **Disque local partagé** : rejeté. Scalabilité, sauvegarde et isolation insuffisantes.
2. **Stockage public** : rejeté. Fuite de données.
3. **Proxy API pour tous les téléchargements** : rejeté. Charge serveur et streaming complexe.
4. **URLs longue durée** : rejeté. Partagées, elles deviennent des accès permanents.

### Justification

- Contrôle d'accès centralisé.
- Aucun fichier exposé publiquement.
- Le stockage objet est adapté aux fichiers volumineux.
- L'expiration courte limite la fuite par partage de lien.

### Conséquences

**Positives :**

- Séparation stockage/API.
- Purge indépendante.
- URLs temporaires auditables.

**Négatives :**

- Dépendance à un service de stockage.
- Configuration CORS et signature à maîtriser.
- Le bucket doit être correctement privé.

**Mesures :**

- Bucket privé, chiffrement au repos.
- Clés préfixées par organisation.
- Vérification des droits avant signature.
- 410 après expiration métier.
- Tests d'accès non autorisé.

---

## ADR-009 — REST `/api/v1`, pagination par curseur, Problem Details

**Statut :** Accepté

### Contexte

Le stack impose REST et OpenAPI. Les listes peuvent atteindre 50 000 lignes, les filtres sont nombreux et les erreurs doivent être exploitables par le frontend.

### Décision

- REST versionné `/api/v1`.
- **Pagination par curseur** opaque, `limit` maximal 100.
- Filtres et tri dans l'URL, listes blanches par endpoint.
- Erreurs au format **Problem Details** avec `code` métier stable.
- Montants en chaîne décimale, dates ISO 8601 UTC.
- `202` pour les jobs, `410` pour les exports expirés.

### Alternatives

1. **Pagination offset** : rejetée. Coût croissant, dérive en cas d'insertion, moins adaptée aux grandes listes.
2. **GraphQL** : rejeté. Hors stack et complexité de sécurité.
3. **RPC** : rejeté. Moins adapté aux ressources et à OpenAPI.
4. **Erreurs ad hoc** : rejetées. Frontend et tests fragiles.

### Justification

- Curseur stable et performant sur les index.
- Problem Details standardise les erreurs.
- Les codes métier permettent des messages et tests précis.
- OpenAPI documente les contrats.

### Conséquences

**Positives :**

- Listes performantes.
- Erreurs homogènes.
- Contrats testables.

**Négatives :**

- Pas de saut de page arbitraire.
- Le curseur doit encoder un tri stable.
- Les clients doivent gérer `nextCursor`.

**Mesures :**

- Curseur opaque versionné.
- Tri secondaire par identifiant.
- Test de stabilité.
- Documentation OpenAPI.

---

## ADR-010 — Temps réel par invalidation, pas par poussée de valeurs

**Statut :** Accepté (module Should)

### Contexte

Socket.IO est Should. Les dashboards doivent rester cohérents avec REST. Un calcul temps réel séparé créerait deux sources de vérité et des divergences de KPI.

### Décision

Socket.IO diffuse uniquement des **événements d'invalidation** (`registration.confirmed`, `checkin.recorded`, `transaction.paid`, etc.). Le client invalide les requêtes concernées et refait un appel REST. Aucun KPI n'est calculé ni transmis par le socket.

### Alternatives

1. **Pousser les KPI calculés** : rejeté. Double calcul, double source de vérité.
2. **Pousser les deltas** : rejeté. Fragile en cas de correction ou de remboursement.
3. **Polling seul** : rejeté. Moins réactif, mais conservé comme repli.
4. **WebSocket brut** : rejeté. Socket.IO est imposé.

### Justification

- Une seule implémentation des formules.
- Le refetch garantit la cohérence.
- L'invalidation est simple à sécuriser.
- Le module peut être désactivé sans impact fonctionnel.

### Conséquences

**Positives :**

- Aucune divergence REST/temps réel.
- Charge de calcul maîtrisée.
- Repli polling naturel.

**Négatives :**

- Latence d'un aller-retour après invalidation.
- Rafale de refetch si les événements sont nombreux.
- Rooms à sécuriser.

**Mesures :**

- Rooms `org:{id}` et `event:{id}`.
- Débounce des invalidations côté client.
- Authentification du socket.
- Aucune PII dans les payloads.

---

## ADR-011 — Soft delete, anonymisation et effacement distincts

**Statut :** Accepté

### Contexte

Les règles BR-DEL imposent des comportements différents selon les entités : suppression logique conditionnelle, anonymisation irréversible, conservation des données comptables. Les confondre créerait des pertes de données ou des violations de règles.

### Décision

Traiter trois mécanismes séparés :

1. **Soft delete** : `deleted_at`, uniquement sur les entités éligibles et sous conditions.
2. **Anonymisation** : remplacement des PII, `anonymized_at`, conservation de l'identifiant interne et des agrégats.
3. **Effacement définitif** : `erased_at` pour un participant sans dépendance comptable ; suppression physique si aucune référence ne subsiste, sinon purge des PII avec conservation de l'identifiant technique. Jamais pour les transactions, remboursements, check-ins et audit ; fichiers d'export supprimés à expiration.

### Alternatives

1. **Suppression physique partout** : rejetée. Casse l'historique, les KPI et l'audit.
2. **Soft delete partout** : rejeté. Ne répond pas à l'anonymisation.
3. **Anonymisation automatique** : rejetée. Action explicite, auditée et irréversible.
4. **Cascade de suppression** : rejetée. Effets destructeurs non maîtrisés.

### Justification

- Respect des règles métier et de la traçabilité.
- Les données comptables restent cohérentes.
- L'anonymisation réduit les PII sans casser l'analyse.
- Les suppressions sont auditables.

### Conséquences

**Positives :**

- Historique fiable.
- KPI stables.
- Conformité de principe aux demandes d'effacement des PII.

**Négatives :**

- Requêtes à filtrer explicitement.
- Contraintes d'unicité partielles nécessaires.
- Risque d'oublier un filtre `deleted_at`.

**Mesures :**

- Repositories explicites.
- Index partiels.
- Tests de suppression conditionnelle.
- Audit de chaque opération.
- Aucune cascade destructive.

---

## Synthèse

| ADR | Décision | Impact principal |
|---|---|---|
| 001 | Monolithe modulaire + worker | Simplicité transactionnelle |
| 002 | Schéma partagé + `organization_id` | Isolation structurelle |
| 003 | Registre d'actions RBAC | Autorisations testables |
| 004 | JWT court + refresh rotatif | Sécurité des sessions |
| 005 | Prisma + SQL avancé | Invariants garantis |
| 006 | Analytique sans entrepôt | Une seule vérité |
| 007 | BullMQ idempotent | Fiabilité asynchrone |
| 008 | Stockage privé + URLs signées | Confidentialité des fichiers |
| 009 | REST + curseur + Problem Details | Contrats stables |
| 010 | Temps réel par invalidation | Cohérence des KPI |
| 011 | Trois mécanismes de suppression | Traçabilité et PII |

---

## Décisions de clôture Phase 3 — 2026-11-18

Ces arbitrages sont officiellement validés et complètent les ADR sans en créer de nouveaux.

| ID | Décision | Conséquences |
|---|---|---|
| D-06 | Advanced Analytics accessible à OWNER et ANALYST uniquement | ADMIN, EVENT_MANAGER et VIEWER refusés ; PRD §12.6, US-ADV-01 et navigation Phase 2 alignés ; contrat API et tests RBAC inchangés |
| D-09/A-01 | Un seul EVENT_MANAGER responsable par événement en V1 | `manager_membership_id` conservé ; pas de table de jointure ; remplacement = mise à jour de l'affectation ; aucune co-responsabilité |

Les documents concernés et l'état des corrections sont consignés dans `ARCHITECTURE_VALIDATION_REPORT.md`, section « Final Decisions & Documentation Closure ».

---

*Fin de ADR.md — Version 1.0.*
