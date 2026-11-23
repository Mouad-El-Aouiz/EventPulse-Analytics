# Runbook — Durcissement SQL et intégrité PostgreSQL

Ce document décrit les protections SQL qui ne peuvent pas être exprimées dans le schéma Prisma, les rôles PostgreSQL attendus, le workflow de migration sûr, les risques de drift et les limites connues. Il s'adresse à l'exploitation et aux développeurs qui font évoluer le schéma.

## 1. Protections SQL non modélisables par Prisma

Prisma modélise les tables, colonnes, enums, index simples et clés étrangères simples. Les objets suivants sont ajoutés manuellement dans les migrations et vérifiés par `npm run db:verify:integrity` :

| Protection | Objets | Source |
| --- | --- | --- |
| Clés étrangères composites multi-tenant | 19 contraintes `(organization_id, …)` | `20261121231500_integrity_constraints`, `20261121232000_participant_merge_tenant_fk`, `20261122101000_event_integrity_constraints` |
| Cohérence événementielle | 6 FK 3 colonnes `ON UPDATE RESTRICT ON DELETE RESTRICT` | `20261122101000_event_integrity_constraints` |
| Unicité conditionnelle | 6 index uniques partiels | `20261121231500_integrity_constraints` |
| Règles de domaine | 25 contraintes `CHECK` | `20261121231500_integrity_constraints`, `20261122100000_api_key_scopes_constraint` |
| Unicité de support des FK | 5 contraintes `UNIQUE` à 3 colonnes | `20261122101000_event_integrity_constraints` |
| Plafond des remboursements | `enforce_refund_cap()`, `trg_refund_cap` | `20261122102000_refund_cap_trigger`, `20261122107000_refund_cap_search_path` |
| Immuabilité | `prevent_immutable_mutation()`, `trg_checkin_immutable`, `trg_refund_immutable`, `trg_audit_immutable` | `20261122103000_immutability_triggers` |
| `updated_at` automatique | `set_updated_at_if_unchanged()`, `trg_touch_updated_at` sur 14 tables | `20261122104000_touch_updated_at_trigger` |
| Recherche trigram | 5 index GIN `gin_trgm_ops` | `20261122105000_trgm_indexes` |
| Privilèges runtime | rôle groupe `eventpulse_app` | `20261122106000_runtime_privileges` |

État attendu après migrations : **19 FK composites, 6 index partiels uniques, 25 CHECK, 5 UNIQUE, 18 triggers, 5 index trigram, 3 tables immuables**. Le vérificateur exécute 126 contrôles de catalogue.

### 1.1 Cohérence événementielle

Les contraintes 3 colonnes garantissent qu'une ligne ne référence pas un objet d'un autre événement, même si l'organisation est identique :

- `registrations (organization_id, event_id, ticket_id) → tickets (organization_id, event_id, id)` ;
- `booth_reservations (organization_id, event_id, booth_id) → booths (organization_id, event_id, id)` ;
- `transactions (organization_id, event_id, registration_id) → registrations (organization_id, event_id, id)` ;
- `transactions (organization_id, event_id, booth_reservation_id) → booth_reservations (organization_id, event_id, id)` ;
- `check_ins (organization_id, event_id, registration_id) → registrations (organization_id, event_id, id)` ;
- `check_ins (organization_id, participant_id, registration_id) → registrations (organization_id, participant_id, id)`.

Les colonnes nullables utilisent `MATCH SIMPLE` : la FK n'est vérifiée que si la référence est présente. Le `CHECK` `check_ins_status_reason_chk` impose déjà les trois références pour un check-in `VALID`.

Cinq anciennes FK 2 colonnes ont été remplacées par ces contraintes. Le scanner de migrations exige une directive `-- integrity-guard: allow DROP CONSTRAINT <nom>` dans la migration de remplacement.

### 1.2 Immuabilité

`check_ins`, `refunds` et `audit_logs` refusent tout `UPDATE` et `DELETE`, y compris pour le rôle propriétaire. Une tentative produit une exception explicite `immutable table <table> does not allow <operation>`.

Conséquences opérationnelles :

- la suppression d'un utilisateur référencé par une ligne immuable échoue, car les FK acteurs sont en `ON DELETE SET NULL` et le trigger bloque la mise à jour ;
- aucun trigger ne bloque `TRUNCATE` : seul le privilège `TRUNCATE` protège les tables, et le rôle runtime ne l'a pas. Un rôle propriétaire peut toujours truncate ; cette opération reste interdite en exploitation ;
- les corrections se font par ajout compensatoire (remboursement, nouveau check-in) et non par modification d'historique.

### 1.3 Plafond des remboursements

`trg_refund_cap` s'exécute `BEFORE INSERT` sur `refunds` :

1. verrouille la transaction cible avec `SELECT … FOR UPDATE`, ce qui sérialise les inserts concurrents sur une même transaction ;
2. refuse un remboursement si la transaction n'est pas `PAID` ou `PARTIALLY_REFUNDED` ;
3. calcule `SUM(refunds.amount) + NEW.amount` en `numeric` et refuse tout dépassement de `transactions.amount`, y compris de `0.01`.

Le montant est comparé sans conversion flottante. Un dépassement produit une exception SQL explicite avec un `ERRCODE` de contrainte, exploitable par l'application.

La fonction est sécurisée contre le détournement de `search_path` par la migration `20261122107000_refund_cap_search_path` :

- elle s'exécute avec `SET search_path = pg_catalog, public` (visible dans `pg_proc.proconfig`) ;
- elle référence les tables par leur nom qualifié `public."transactions"` et `public."refunds"`.

Ces deux mesures se complètent : la qualification est la défense principale, car une table temporaire (`pg_temp`) masque une relation du même nom quel que soit le `search_path` ; le `search_path` fixé empêche une redirection vers un autre schéma persistant. Le privilège `TEMP` reste accordé par défaut à `PUBLIC` dans PostgreSQL ; le révoquer est un durcissement d'exploitation possible mais non appliqué par les migrations, car il affecte toute la base et peut casser des outils. La garantie de concurrence repose sur le niveau d'isolation `READ COMMITTED` par défaut de PostgreSQL : le `SELECT … FOR UPDATE` verrouille la transaction cible et sérialise les inserts concurrents, ce que les tests exécutent sous ce niveau.

### 1.4 `updated_at`

`trg_touch_updated_at` s'applique uniquement aux 14 tables mutables portant la colonne. Règle :

- si `NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at`, la valeur est remplacée par `now()` ;
- une valeur explicitement différente est respectée ;
- une valeur explicitement identique à l'ancienne est rafraîchie, car un trigger `BEFORE UPDATE` ne peut pas distinguer « omis » de « fourni identique » ;
- aucun trigger n'existe sur les tables immuables.

### 1.5 Index trigram

Les index portent sur `participants.first_name`, `participants.last_name`, `exhibitors.name`, `events.name` et `participants.email`. L'email est un `citext` ; l'index utilise l'expression `((email)::text) gin_trgm_ops`. Une recherche doit donc écrire `(email)::text ILIKE '%…%'` pour utiliser l'index. `citext ILIKE` natif peut ne pas le sélectionner.

## 2. Rôles et privilèges

### 2.1 Rôles

| Rôle | Usage | Création |
| --- | --- | --- |
| `eventpulse` | Propriétaire du schéma et des objets, rôle de migration | Provisionné par Docker Compose en local, par l'exploitation en production |
| `eventpulse_app` | Groupe de privilèges runtime, `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, sans mot de passe | Migration `20261122106000_runtime_privileges` |
| `<login runtime>` (ex. `eventpulse_runtime`) | Login utilisé par l'API, membre de `eventpulse_app` | **Hors migration**, par l'exploitation |

Le rôle de migration a besoin de `CREATEROLE` pour créer `eventpulse_app`. Si ce n'est pas le cas, créer le rôle groupe avant le déploiement ; la migration est conditionnelle (`IF NOT EXISTS`).

Exemple de création du login runtime, exécuté par l'exploitation avec un secret fourni par le gestionnaire de secrets :

```sql
CREATE ROLE eventpulse_runtime LOGIN PASSWORD :'runtime_password' IN ROLE eventpulse_app;
```

Ne jamais écrire ce mot de passe dans une migration, un fichier versionné ou `.env.example`. Le login doit conserver `INHERIT` (défaut) pour bénéficier des privilèges du groupe.

### 2.2 Privilèges effectifs

- `USAGE` sur le schéma `public`, sans `CREATE` ;
- `SELECT, INSERT, UPDATE, DELETE` sur les 17 tables mutables ;
- `SELECT, INSERT` uniquement sur `check_ins`, `refunds`, `audit_logs` ;
- aucun `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` ou `TRIGGER` sur les tables immuables ;
- aucune table appartenant au rôle runtime ;
- aucune attribution par `ALTER DEFAULT PRIVILEGES` : toute nouvelle table doit être ajoutée explicitement aux grants et au manifeste.

Vérifications manuelles possibles :

```sql
SELECT has_table_privilege('eventpulse_app', 'check_ins', 'UPDATE'); -- false
SELECT has_table_privilege('eventpulse_app', 'events', 'UPDATE');    -- true
SELECT has_schema_privilege('eventpulse_app', 'public', 'CREATE');   -- false
```

### 2.3 Appartenance et tests

Le vérificateur s'exécute avec le rôle propriétaire et contrôle les privilèges du groupe `eventpulse_app`, pas ceux d'un login externe. En test, `SET LOCAL ROLE eventpulse_app` valide le comportement effectif sans créer de login.

Un login runtime externe peut être contrôlé de façon optionnelle : si la variable `TEST_RUNTIME_LOGIN_ROLE` est définie (par exemple `eventpulse_runtime`), les tests vérifient ses attributs de login (non-superuser, `NOBYPASSRLS`) et son appartenance à `eventpulse_app` dans `pg_auth_members` (`inherit_option = true`, `admin_option = false`). Sans cette variable, ce contrôle est explicitement ignoré et n'échoue pas.

## 3. Variables d'environnement

| Variable | Rôle | Obligatoire |
| --- | --- | --- |
| `DATABASE_URL` | URL du rôle propriétaire, utilisée par les migrations et les outils de vérification | Oui |
| `DATABASE_RUNTIME_URL` | URL du login runtime, utilisée par le client Prisma de l'API | Oui en production |
| `DATABASE_POOL_SIZE` | `connection_limit` appliqué au client Prisma | Non (10) |
| `TEST_DATABASE_URL` | Base dédiée aux tests d'intégrité, nom terminé par `_test` | Non (défaut local `eventpulse_test`) |

En développement, `DATABASE_RUNTIME_URL` peut être omise : l'API retombe sur `DATABASE_URL` et se connecte avec le rôle propriétaire. En production, le schéma d'environnement refuse le démarrage si elle est absente, afin d'éviter d'exécuter l'API avec le rôle de migration.

Le client Prisma applicatif utilise `DATABASE_RUNTIME_URL ?? DATABASE_URL` (`apps/api/src/database/prisma.ts`). Les scripts de migration et de vérification utilisent `DATABASE_URL`.

## 4. Mise en route locale

```bash
npm install
cp .env.example .env
npm run db:up
npm run prisma:migrate:deploy
npm run db:verify:integrity
npm run db:check
```

`npm run prisma:migrate:deploy` exécute d'abord le scanner de migrations, puis `prisma migrate deploy`. Aucune commande de reset, de drop ou de suppression de volume n'est utilisée.

## 5. Base de test et tests d'intégrité

```bash
npm run test:integration
```

Le `globalSetup` de `apps/api/test/integration/global-setup.ts` :

1. charge le `.env` racine ;
2. refuse toute URL dont le nom de base ne se termine pas par `_test` ;
3. crée la base si elle est absente via une connexion d'administration Prisma vers `postgres` ;
4. exécute le scanner de migrations ;
5. applique les migrations avec `prisma migrate deploy`.

La base `eventpulse_test` n'est jamais reset, droppée ou truncate. Elle peut être conservée entre deux exécutions ; les données de test utilisent des UUID uniques.

Couverture : manifeste complet, plafond et concurrence des remboursements, immuabilité, cohérence événementielle, scopes API, `updated_at`, privilèges runtime, index trigram et index partiels.

## 6. Workflow de migration sûr

1. Modifier `schema.prisma` uniquement si le modèle métier change. Aucun remodelage n'est nécessaire pour les protections SQL.
2. Générer une migration vide et la revoir :
   ```bash
   npx prisma migrate dev --create-only --schema apps/api/prisma/schema.prisma --name nom_explicite
   ```
3. Inspecter le SQL généré. Prisma peut proposer de supprimer des objets qu'il ne modélise pas. **Ne jamais accepter ces suppressions.** Supprimer les `DROP` non voulus du fichier.
4. Ajouter les protections SQL manuelles dans la nouvelle migration. Si un objet protégé doit réellement être remplacé, ajouter une directive explicite dans le fichier :
   ```sql
   -- integrity-guard: allow DROP CONSTRAINT nom_de_la_contrainte
   ```
5. Valider le scanner :
   ```bash
   npm run db:check:migrations
   ```
6. Appliquer :
   ```bash
   npm run prisma:migrate:deploy
   ```
7. Vérifier le catalogue et les tests :
   ```bash
   npm run db:verify:integrity
   npm run test:integration
   ```

Règles absolues :

- ne jamais modifier ni supprimer une migration déjà appliquée (checksums) ;
- ne jamais utiliser `prisma migrate reset`, `prisma db push` sur une base partagée, `DROP DATABASE` ou la suppression du volume ;
- une correction de protection se fait par une nouvelle migration additive ;
- avant d'appliquer une migration ajoutant des contraintes sur une base peuplée, exécuter les requêtes de pré-contrôle d'incohérence et corriger les données.

## 7. Risques de drift Prisma

Prisma ne connaît pas les FK composites, index partiels, `CHECK`, triggers, index d'expression et privilèges. `prisma migrate dev` ou `prisma migrate diff` peut donc proposer leur suppression. Le dépôt se protège à trois niveaux :

1. `migration-safety.ts` refuse les `DROP` d'objets protégés sans directive ;
2. `verifyDatabaseIntegrity()` échoue si un objet manque, est désactivé ou a une définition incorrecte ;
3. les tests d'intégration échouent si le comportement réel change.

En cas de drift détecté :

- ne pas lancer `migrate dev` pour « réparer » ;
- comparer le catalogue réel avec `integrity-manifest.ts` ;
- recréer l'objet manquant dans une nouvelle migration avec la définition documentée ;
- relancer le scanner, le vérificateur et les tests.

## 8. Limites connues

- `api_keys.scopes` accepte `'{}'` et des doublons (`ARRAY['ingestion:write','ingestion:write']`) avec le `CHECK` littéral documenté, car `<@` ignore la multiplicité. En revanche un élément `NULL` est refusé (`23514`), car l'expression de contenance vaut `NULL` en sa présence et la contrainte exige `true`. La règle « au moins un scope » relève du service applicatif, pas de la base.
- La suppression d'un utilisateur référencé par `check_ins`, `refunds` ou `audit_logs` échoue. Le produit ne supprime pas les utilisateurs ; la suspension passe par `memberships.status`.
- Une valeur `updated_at` explicitement identique à l'ancienne est rafraîchie.
- L'index trigram email exige le cast `(email)::text`.
- Le scanner de migrations est une analyse lexicale du SQL, pas un parseur PostgreSQL. Il refuse les `DROP`/`DISABLE` connus sur les objets protégés, mais ne prouve pas l'absence de tout contournement (SQL dynamique, `DO`/`EXECUTE`, requêtes construites à l'exécution). Toute migration reste soumise à une revue humaine.
- Le vérificateur s'exécute avec le rôle propriétaire et contrôle le groupe runtime, pas un login externe ; sans `TEST_RUNTIME_LOGIN_ROLE`, les tests d'intégration ne contrôlent pas de login réel.
- Un rôle propriétaire du schéma, un superutilisateur ou un rôle disposant des privilèges nécessaires peut toujours désactiver un trigger, supprimer une contrainte, remplacer une fonction ou `TRUNCATE` une table. Les protections garantissent l'application par les chemins applicatifs et le rôle runtime, pas contre un administrateur de base malveillant ou une erreur d'exploitation. Seule la discipline d'exploitation, les revues de migration et le scanner limitent ce risque.
- Le rôle propriétaire conserve `TRUNCATE` ; l'interdiction repose sur la discipline d'exploitation et les privilèges runtime.
- Les triggers d'immuabilité ne couvrent pas `TRUNCATE`.
- Aucune pipeline CI n'est encore branchée ; les scripts npm sont prêts à l'être.
- Les migrations ajoutant des contraintes échouent si des données existantes sont incohérentes ; un pré-contrôle est requis en production.
- La base `eventpulse_test` est aujourd'hui persistante. Un conteneur PostgreSQL éphémère par exécution est une cible non implémentée ; la base actuelle n'est jamais reset, droppée ni truncate, et les données de test utilisent des UUID uniques.
