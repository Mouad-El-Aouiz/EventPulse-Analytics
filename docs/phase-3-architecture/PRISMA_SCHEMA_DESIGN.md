# PRISMA_SCHEMA_DESIGN.md — EventPulse Analytics

**Phase :** 3 — Software Architecture & Database Design
**Version :** 1.0
**Date :** 2026-11-18
**ORM :** Prisma 5.x
**Cible :** PostgreSQL 16
**Complément :** `DATABASE_DESIGN.md`

> Ce document est conceptuel. Il ne contient ni migration, ni commande d'exécution, ni implémentation applicative. Les blocs Prisma décrivent la structure cible et les conventions à respecter lors de la Phase 4.

---

## 1. Objectifs et périmètre

Le schéma Prisma doit :

1. Représenter les 20 tables du modèle relationnel validé.
2. Garantir l'isolation multi-tenant par des contraintes adaptées.
3. Rester lisible : les relations Prisma utilisent des clés simples, les contraintes composites et conditionnelles sont ajoutées par migration SQL revue.
4. Laisser PostgreSQL porter les invariants critiques (index partiels, triggers, CHECK), Prisma restant la couche de mapping et de requêtage.

Le schéma ne doit pas :

- Créer de tables techniques supplémentaires (files, cache, snapshots KPI).
- Ajouter des champs métier non validés.
- Remplacer les règles métier par des contraintes implicites non documentées.

---

## 2. Conventions

### 2.1 Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Modèle | `PascalCase` singulier | `CheckIn` |
| Champ | `camelCase` | `checkedInAt` |
| Table | `snake_case` pluriel via `@@map` | `check_ins` |
| Colonne | `snake_case` via `@map` | `checked_in_at` |
| Enum | `PascalCase`, valeurs `SCREAMING_SNAKE_CASE` | `CheckInStatus.VALID` |
| Type enum SQL | `snake_case` via `@@map` | `check_in_status` |
| Index | nommage explicite `map:` | `checkins_org_event_time_idx` |
| Contrainte unique | nommage explicite `map:` | `registrations_org_id_uq` |
| Clé étrangère | `map:` explicite | `registrations_event_fk` |

### 2.2 Types et valeurs par défaut

```prisma
id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)
amount        Decimal  @db.Decimal(12, 2)
currency      String   @default("EUR") @db.Char(3)
organizationId String  @map("organization_id") @db.Uuid
```

- **Identifiants :** UUID générés par l'application en UUIDv7 (ordonnés dans le temps). Le défaut `gen_random_uuid()` sert de filet de sécurité pour les insertions hors application.
- **Dates :** `timestamptz(3)`, toujours UTC. Aucun type `timestamp` sans fuseau.
- **Montants :** `Decimal` Prisma mappé en `numeric(12,2)`. Jamais de `Float`.
- **Devise :** `char(3)` avec `CHECK = 'EUR'` ajouté en SQL.
- **JSON :** `Json @db.JsonB` pour `parameters`, `preview_metadata`, `metadata`.
- **Tableaux :** `String[]` pour `api_keys.scopes`.

### 2.3 Horodatage et mise à jour

- `createdAt` est toujours renseigné par la base ou l'application.
- `updatedAt` utilise `@updatedAt` côté Prisma **et** un trigger SQL de secours pour les écritures hors ORM. Le trigger ne remplace la valeur que si elle est absente ou identique à l'ancienne ; une valeur explicite différente est respectée. Il est limité aux tables mutables.
- Les tables immuables (`check_ins`, `refunds`, `audit_logs`) n'ont **pas** de `updatedAt`.

### 2.4 Soft delete

- Colonne unique `deletedAt DateTime? @map("deleted_at") @db.Timestamptz(3)`.
- Aucun `deleted` booléen : la date porte l'information et permet l'audit.
- L'exclusion est appliquée par la couche repository, jamais par un middleware global silencieux.
- Les contraintes d'unicité concernées sont partielles (`WHERE deleted_at IS NULL`), donc invisibles pour Prisma.

---

## 3. Organisation des fichiers

Prisma 5 permet un schéma multi-fichiers (`prismaSchemaFolder`). Structure cible :

```
prisma/
  schema/
    00-base.prisma          // generator, datasource, extensions
    10-enums.prisma         // tous les enums
    20-identity.prisma      // User, Session, PasswordResetToken
    30-tenancy.prisma       // Organization, Membership, Invitation, ApiKey
    40-events.prisma        // Event, Ticket
    50-attendees.prisma     // Participant, Registration
    60-finance.prisma       // Transaction, Refund
    70-checkins.prisma      // CheckIn
    80-exhibitors.prisma    // Exhibitor, Booth, BoothReservation
    90-async.prisma         // Import, Export
    95-audit.prisma         // AuditLog
  migrations/
    <timestamp>_baseline/
    <timestamp>_tenant_constraints/
    ...
```

**Repli :** si le support multi-fichiers n'est pas activé, un unique `schema.prisma` conserve le même ordre de sections.

---

## 4. Enums

| Enum | Valeurs | Table(s) |
|---|---|---|
| `Role` | `OWNER`, `ADMIN`, `EVENT_MANAGER`, `ANALYST`, `VIEWER` | `memberships`, `invitations` |
| `MembershipStatus` | `ACTIVE`, `DISABLED` | `memberships` |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED` | `invitations` |
| `ApiKeyStatus` | `ACTIVE`, `REVOKED` | `api_keys` |
| `EventType` | `EXHIBITION`, `CONFERENCE`, `WORKSHOP`, `TRADE_SHOW`, `OTHER` | `events` |
| `EventStatus` | `DRAFT`, `PUBLISHED`, `ONGOING`, `COMPLETED`, `ARCHIVED`, `CANCELLED` | `events` |
| `Gender` | `FEMALE`, `MALE`, `NON_BINARY`, `UNDISCLOSED`, `UNKNOWN` | `participants` |
| `RegistrationStatus` | `PENDING`, `CONFIRMED`, `CANCELLED`, `WAITLISTED` | `registrations` |
| `RegistrationSource` | `MANUAL`, `IMPORT`, `INGESTION_API`, `PARTNER`, `OTHER` | `registrations` |
| `TransactionType` | `TICKET`, `BOOTH` | `transactions` |
| `TransactionStatus` | `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED` | `transactions` |
| `CheckInStatus` | `VALID`, `INVALID` | `check_ins` |
| `CheckInReason` | `OUTSIDE_WINDOW`, `DUPLICATE`, `REGISTRATION_CANCELLED`, `REGISTRATION_NOT_CONFIRMED`, `REGISTRATION_NOT_FOUND`, `PARTICIPANT_NOT_FOUND`, `EVENT_NOT_FOUND`, `EVENT_CANCELLED` | `check_ins` |
| `CheckInSource` | `MANUAL`, `CSV`, `INGESTION_API` | `check_ins` |
| `BoothStatus` | `AVAILABLE`, `RESERVED`, `UNAVAILABLE` | `booths` |
| `ReservationStatus` | `ACTIVE`, `RELEASED` | `booth_reservations` |
| `ImportType` | `PARTICIPANTS`, `REGISTRATIONS`, `CHECKINS`, `PAYMENTS` | `imports` |
| `ImportFormat` | `CSV`, `XLSX` | `imports` |
| `ImportStatus` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` | `imports` |
| `DuplicateStrategy` | `SKIP`, `UPDATE`, `ERROR` | `imports` |
| `ReportType` | `EVENT_PERFORMANCE`, `FINANCIAL`, `ATTENDANCE`, `EXHIBITORS`, `EVENT_COMPARISON` | `exports` |
| `ExportFormat` | `PDF`, `XLSX`, `CSV` | `exports` |
| `ExportStatus` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED` | `exports` |
| `AuditCategory` | `AUTH`, `USERS_ROLES`, `ORGANIZATION`, `SENSITIVE_DATA`, `FINANCIAL`, `INGESTION` | `audit_logs` |
| `AuditResult` | `SUCCESS`, `FAILURE` | `audit_logs` |

**Contraintes :**

- Les valeurs d'enum PostgreSQL ne sont jamais supprimées ni renommées sans migration dédiée : on ajoute uniquement.
- Les statuts sont mappés tels quels dans le domaine applicatif ; aucune valeur par défaut implicite hors celles documentées.
- `CheckInReason` reflète exactement les 8 motifs de `BUSINESS_RULES.md` (BR-CHK-004). `EVENT_NOT_FOUND` et `UNKNOWN_PARTICIPANT` couvrent les références absentes.

---

## 5. Schéma conceptuel représentatif

### 5.1 Base

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "prismaSchemaFolder"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [citext, pg_trgm]
}
```

> `citext` et `pg_trgm` nécessitent l'extension `postgresqlExtensions`. Si elle n'est pas activée, le type `citext` est remplacé par `text` + index fonctionnel `lower(email)`, et la recherche trigram est abandonnée.

### 5.2 Identité

```prisma
model User {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email        String    @unique(map: "users_email_uq") @db.Citext
  passwordHash String    @map("password_hash")
  displayName  String    @map("display_name") @db.VarChar(150)
  isActive     Boolean   @default(true) @map("is_active")
  lastLoginAt  DateTime? @map("last_login_at") @db.Timestamptz(3)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)

  memberships       Membership[]
  sessions          Session[]
  resetTokens       PasswordResetToken[]
  invitationsSent   Invitation[]
  apiKeysCreated    ApiKey[]
  exportsRequested  Export[]
  audits            AuditLog[]

  @@map("users")
}

model Session {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId              String    @map("user_id") @db.Uuid
  organizationId      String?   @map("organization_id") @db.Uuid
  familyId            String    @map("family_id") @db.Uuid
  refreshTokenHash    String    @unique(map: "sessions_refresh_hash_uq") @map("refresh_token_hash")
  expiresAt           DateTime  @map("expires_at") @db.Timestamptz(3)
  revokedAt           DateTime? @map("revoked_at") @db.Timestamptz(3)
  replacedBySessionId String?   @unique(map: "sessions_replaced_by_uq") @map("replaced_by_session_id") @db.Uuid
  ipAddress           String?   @map("ip_address") @db.Inet
  userAgent           String?   @map("user_agent")
  createdAt           DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  lastUsedAt          DateTime? @map("last_used_at") @db.Timestamptz(3)

  user              User     @relation(fields: [userId], references: [id], onDelete: Restrict, map: "sessions_user_fk")
  organization      Organization? @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "sessions_org_fk")
  replacedBySession Session? @relation("SessionRotation", fields: [replacedBySessionId], references: [id], onDelete: SetNull, map: "sessions_replaced_by_fk")
  previousSession   Session? @relation("SessionRotation")

  @@index([userId, revokedAt], map: "sessions_user_revoked_idx")
  @@index([familyId], map: "sessions_family_idx")
  @@index([expiresAt], map: "sessions_expires_idx")
  @@map("sessions")
}

model PasswordResetToken {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  tokenHash String    @unique(map: "password_reset_tokens_hash_uq") @map("token_hash")
  expiresAt DateTime  @map("expires_at") @db.Timestamptz(3)
  usedAt    DateTime? @map("used_at") @db.Timestamptz(3)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade, map: "password_reset_tokens_user_fk")

  @@index([userId, expiresAt], map: "password_reset_tokens_user_expires_idx")
  @@map("password_reset_tokens")
}
```

**Notes :**

- `Session` est le support du refresh token rotation. Une famille (`familyId`) permet la détection de réutilisation.
- `organizationId` est nullable tant que l'utilisateur n'a pas choisi d'organisation.
- La révocation d'une famille est une mise à jour massive de `revokedAt` ; elle est auditée.

### 5.3 Organisations et accès

```prisma
model Organization {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name               String   @db.VarChar(150)
  slug               String   @unique(map: "organizations_slug_uq") @db.VarChar(80)
  timezone           String   @default("Europe/Paris") @db.VarChar(64)
  currency           String   @default("EUR") @db.Char(3)
  exportRetentionDays Int     @default(30) @map("export_retention_days") @db.SmallInt
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz(3)

  memberships  Membership[]
  invitations  Invitation[]
  apiKeys      ApiKey[]
  sessions     Session[]
  events       Event[]
  participants Participant[]
  exhibitors   Exhibitor[]
  imports      Import[]
  exports      Export[]
  auditLogs    AuditLog[]

  @@map("organizations")
}

model Membership {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String           @map("organization_id") @db.Uuid
  userId         String           @map("user_id") @db.Uuid
  role           Role
  status         MembershipStatus @default(ACTIVE)
  joinedAt       DateTime         @default(now()) @map("joined_at") @db.Timestamptz(3)
  disabledAt     DateTime?        @map("disabled_at") @db.Timestamptz(3)
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "memberships_org_fk")
  user         User         @relation(fields: [userId], references: [id], onDelete: Restrict, map: "memberships_user_fk")
  managedEvents Event[]     @relation("EventManager")

  @@unique([organizationId, userId], map: "memberships_org_user_uq")
  @@unique([organizationId, id], map: "memberships_org_id_uq")
  @@index([userId, status], map: "memberships_user_status_idx")
  @@index([organizationId, role, status], map: "memberships_org_role_idx")
  @@map("memberships")
}

model Invitation {
  id               String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId   String           @map("organization_id") @db.Uuid
  email            String           @db.Citext
  role             Role
  status           InvitationStatus @default(PENDING)
  tokenHash        String           @unique(map: "invitations_token_uq") @map("token_hash")
  invitedByUserId  String           @map("invited_by_user_id") @db.Uuid
  expiresAt        DateTime         @map("expires_at") @db.Timestamptz(3)
  acceptedAt       DateTime?        @map("accepted_at") @db.Timestamptz(3)
  revokedAt        DateTime?        @map("revoked_at") @db.Timestamptz(3)
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(3)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "invitations_org_fk")
  invitedByUser  User         @relation(fields: [invitedByUserId], references: [id], onDelete: Restrict, map: "invitations_user_fk")

  @@index([organizationId, status, createdAt], map: "invitations_org_status_idx")
  @@map("invitations")
}

model ApiKey {
  id             String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  name           String       @db.VarChar(100)
  keyPrefix      String       @map("key_prefix") @db.VarChar(16)
  keyHash        String       @unique(map: "api_keys_hash_uq") @map("key_hash")
  scopes         String[]     @default(["ingestion:write"])
  status         ApiKeyStatus @default(ACTIVE)
  lastUsedAt     DateTime?    @map("last_used_at") @db.Timestamptz(3)
  expiresAt      DateTime?    @map("expires_at") @db.Timestamptz(3)
  revokedAt      DateTime?    @map("revoked_at") @db.Timestamptz(3)
  createdByUserId String      @map("created_by_user_id") @db.Uuid
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "api_keys_org_fk")
  createdByUser User         @relation(fields: [createdByUserId], references: [id], onDelete: Restrict, map: "api_keys_user_fk")

  @@index([organizationId, status], map: "api_keys_org_status_idx")
  @@map("api_keys")
}
```

**Notes :**

- L'unicité conditionnelle d'une invitation en attente est un index partiel SQL, absent de Prisma.
- Le secret d'API n'existe qu'en mémoire au moment de la création ; seul `keyHash` est persisté.

### 5.4 Événements et billets

```prisma
model Event {
  id                          String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId              String      @map("organization_id") @db.Uuid
  name                        String      @db.VarChar(200)
  type                        EventType
  status                      EventStatus @default(DRAFT)
  startAt                     DateTime    @map("start_at") @db.Timestamptz(3)
  endAt                       DateTime    @map("end_at") @db.Timestamptz(3)
  timezone                    String      @db.VarChar(64)
  location                    String?     @db.VarChar(255)
  description                 String?
  checkInOpensOffsetMinutes   Int         @default(-120) @map("check_in_opens_offset_minutes")
  checkInClosesOffsetMinutes  Int         @default(120) @map("check_in_closes_offset_minutes")
  managerMembershipId         String?     @map("manager_membership_id") @db.Uuid
  createdAt                   DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt                   DateTime    @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt                   DateTime?   @map("deleted_at") @db.Timestamptz(3)

  organization      Organization  @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "events_org_fk")
  managerMembership Membership?   @relation("EventManager", fields: [managerMembershipId], references: [id], onDelete: SetNull, map: "events_manager_fk")
  tickets           Ticket[]
  registrations     Registration[]
  checkIns          CheckIn[]
  booths            Booth[]
  boothReservations BoothReservation[]
  imports           Import[]

  @@unique([organizationId, id], map: "events_org_id_uq")
  @@index([organizationId, status, startAt], map: "events_org_status_start_idx")
  @@index([organizationId, type], map: "events_org_type_idx")
  @@index([organizationId, managerMembershipId], map: "events_org_manager_idx")
  @@map("events")
}

model Ticket {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  eventId        String    @map("event_id") @db.Uuid
  name           String    @db.VarChar(100)
  priceAmount    Decimal   @map("price_amount") @db.Decimal(12, 2)
  currency       String    @default("EUR") @db.Char(3)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(3)

  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "tickets_org_fk")
  event         Event          @relation(fields: [eventId], references: [id], onDelete: Restrict, map: "tickets_event_fk")
  registrations Registration[]

  @@unique([organizationId, id], map: "tickets_org_id_uq")
  @@index([organizationId, eventId], map: "tickets_org_event_idx")
  @@map("tickets")
}
```

**Notes :**

- Le manager est unique par événement. Le service vérifie en plus que le membership est `ACTIVE`, de rôle `EVENT_MANAGER`, et dans la même organisation.
- Le prix du billet est un tarif de référence ; le montant facturé est figé dans `transactions.amount`.

### 5.5 Participants et inscriptions

```prisma
model Participant {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId        String    @map("organization_id") @db.Uuid
  firstName             String    @map("first_name") @db.VarChar(100)
  lastName              String    @map("last_name") @db.VarChar(100)
  email                 String    @db.Citext
  phone                 String?   @db.VarChar(30)
  country               String?   @db.VarChar(2)
  region                String?   @db.VarChar(100)
  city                  String?   @db.VarChar(100)
  birthYear             Int?      @map("birth_year") @db.SmallInt
  gender                Gender?
  anonymizedAt          DateTime? @map("anonymized_at") @db.Timestamptz(3)
  erasedAt              DateTime? @map("erased_at") @db.Timestamptz(3)
  mergedIntoParticipantId String? @map("merged_into_participant_id") @db.Uuid
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt             DateTime? @map("deleted_at") @db.Timestamptz(3)

  organization     Organization  @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "participants_org_fk")
  mergedInto       Participant?  @relation("ParticipantMerge", fields: [mergedIntoParticipantId], references: [id], onDelete: SetNull, map: "participants_merge_fk")
  mergedParticipants Participant[] @relation("ParticipantMerge")
  registrations    Registration[]
  checkIns         CheckIn[]

  @@unique([organizationId, id], map: "participants_org_id_uq")
  @@index([organizationId, email], map: "participants_org_email_idx")
  @@index([organizationId, lastName, firstName], map: "participants_org_name_idx")
  @@index([organizationId, country, region, city], map: "participants_org_geo_idx")
  @@map("participants")
}

model Registration {
  id             String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String             @map("organization_id") @db.Uuid
  eventId        String             @map("event_id") @db.Uuid
  participantId  String             @map("participant_id") @db.Uuid
  ticketId       String             @map("ticket_id") @db.Uuid
  status         RegistrationStatus @default(PENDING)
  source         RegistrationSource
  sourceDetail   String?            @map("source_detail") @db.VarChar(100)
  registeredAt   DateTime           @default(now()) @map("registered_at") @db.Timestamptz(3)
  cancelledAt    DateTime?          @map("cancelled_at") @db.Timestamptz(3)
  createdAt      DateTime           @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime           @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt      DateTime?          @map("deleted_at") @db.Timestamptz(3)

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "registrations_org_fk")
  event        Event         @relation(fields: [eventId], references: [id], onDelete: Restrict, map: "registrations_event_fk")
  participant  Participant   @relation(fields: [participantId], references: [id], onDelete: Restrict, map: "registrations_participant_fk")
  ticket       Ticket        @relation(fields: [ticketId], references: [id], onDelete: Restrict, map: "registrations_ticket_fk")
  transaction  Transaction?
  checkIns     CheckIn[]

  @@unique([organizationId, id], map: "registrations_org_id_uq")
  @@index([organizationId, eventId, status, registeredAt], map: "registrations_org_event_status_time_idx")
  @@index([organizationId, participantId, registeredAt], map: "registrations_org_participant_time_idx")
  @@index([organizationId, ticketId], map: "registrations_org_ticket_idx")
  @@map("registrations")
}
```

**Notes :**

- Aucune unicité `(eventId, participantId)` : une même personne peut avoir plusieurs inscriptions.
- L'email n'est pas unique, conformément à BR-PAR-002.
- La cohérence `ticket.eventId = registration.eventId` est garantie au niveau PostgreSQL par la FK 3 colonnes `registrations_ticket_org_event_fk`, et pas seulement par la couche service. Le service conserve la validation pour produire des erreurs métier explicites.

### 5.6 Finances

```prisma
model Transaction {
  id                  String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId      String            @map("organization_id") @db.Uuid
  eventId             String            @map("event_id") @db.Uuid
  type                TransactionType
  status              TransactionStatus @default(PENDING)
  amount              Decimal           @db.Decimal(12, 2)
  currency            String            @default("EUR") @db.Char(3)
  registrationId      String?           @map("registration_id") @db.Uuid
  boothReservationId  String?           @map("booth_reservation_id") @db.Uuid
  paidAt              DateTime?         @map("paid_at") @db.Timestamptz(3)
  createdAt           DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt           DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "transactions_org_fk")
  event            Event             @relation(fields: [eventId], references: [id], onDelete: Restrict, map: "transactions_event_fk")
  registration     Registration?     @relation(fields: [registrationId], references: [id], onDelete: Restrict, map: "transactions_registration_fk")
  boothReservation BoothReservation? @relation(fields: [boothReservationId], references: [id], onDelete: Restrict, map: "transactions_reservation_fk")
  refunds          Refund[]

  @@unique([organizationId, id], map: "transactions_org_id_uq")
  @@index([organizationId, eventId, paidAt], map: "transactions_org_event_paid_idx")
  @@index([organizationId, type, status, paidAt], map: "transactions_org_type_status_paid_idx")
  @@index([organizationId, createdAt], map: "transactions_org_created_idx")
  @@map("transactions")
}

model Refund {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String    @map("organization_id") @db.Uuid
  transactionId   String    @map("transaction_id") @db.Uuid
  amount          Decimal   @db.Decimal(12, 2)
  currency        String    @default("EUR") @db.Char(3)
  refundedAt      DateTime  @default(now()) @map("refunded_at") @db.Timestamptz(3)
  reason          String?   @db.VarChar(255)
  createdByUserId String?   @map("created_by_user_id") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "refunds_org_fk")
  transaction     Transaction  @relation(fields: [transactionId], references: [id], onDelete: Restrict, map: "refunds_transaction_fk")
  createdByUser   User?        @relation(fields: [createdByUserId], references: [id], onDelete: SetNull, map: "refunds_user_fk")

  @@unique([organizationId, id], map: "refunds_org_id_uq")
  @@index([organizationId, refundedAt], map: "refunds_org_time_idx")
  @@index([organizationId, transactionId, refundedAt], map: "refunds_org_transaction_time_idx")
  @@map("refunds")
}
```

**Notes :**

- `registrationId` n'est pas `@unique` dans Prisma : l'unicité est partielle (`WHERE type = 'TICKET'`) et ajoutée en SQL.
- Le cumul des remboursements est contrôlé par trigger, pas par Prisma.
- `Transaction` n'a ni `deletedAt` ni suppression autorisée.

### 5.7 Check-ins

```prisma
model CheckIn {
  id             String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String         @map("organization_id") @db.Uuid
  eventId        String?        @map("event_id") @db.Uuid
  participantId  String?        @map("participant_id") @db.Uuid
  registrationId String?        @map("registration_id") @db.Uuid
  status         CheckInStatus
  reason         CheckInReason?
  source         CheckInSource
  checkedInAt    DateTime       @default(now()) @map("checked_in_at") @db.Timestamptz(3)
  createdByUserId String?       @map("created_by_user_id") @db.Uuid
  createdAt      DateTime       @default(now()) @map("created_at") @db.Timestamptz(3)

  organization    Organization  @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "checkins_org_fk")
  event           Event?        @relation(fields: [eventId], references: [id], onDelete: Restrict, map: "checkins_event_fk")
  participant     Participant?  @relation(fields: [participantId], references: [id], onDelete: Restrict, map: "checkins_participant_fk")
  registration    Registration? @relation(fields: [registrationId], references: [id], onDelete: Restrict, map: "checkins_registration_fk")
  createdByUser   User?         @relation(fields: [createdByUserId], references: [id], onDelete: SetNull, map: "checkins_user_fk")

  @@unique([organizationId, id], map: "checkins_org_id_uq")
  @@index([organizationId, eventId, checkedInAt], map: "checkins_org_event_time_idx")
  @@index([organizationId, participantId, eventId], map: "checkins_org_participant_event_idx")
  @@index([organizationId, reason, checkedInAt], map: "checkins_org_reason_time_idx")
  @@index([organizationId, status, checkedInAt], map: "checkins_org_status_time_idx")
  @@map("check_ins")
}
```

**Notes :**

- Les FK nullables sont volontaires : un check-in `INVALID` pour participant inconnu doit rester traçable.
- L'unicité `VALID` par `(organizationId, eventId, participantId)` est un index partiel SQL.
- Aucun `updatedAt` : la table est append-only.

### 5.8 Exposants

```prisma
model Exhibitor {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String    @map("organization_id") @db.Uuid
  name           String    @db.VarChar(150)
  contactName    String?   @map("contact_name") @db.VarChar(150)
  email          String?   @db.Citext
  phone          String?   @db.VarChar(30)
  website        String?   @db.VarChar(255)
  description    String?
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(3)

  organization     Organization      @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "exhibitors_org_fk")
  reservations     BoothReservation[]

  @@unique([organizationId, id], map: "exhibitors_org_id_uq")
  @@index([organizationId, name], map: "exhibitors_org_name_idx")
  @@map("exhibitors")
}

model Booth {
  id             String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String      @map("organization_id") @db.Uuid
  eventId        String      @map("event_id") @db.Uuid
  code           String      @db.VarChar(50)
  zone           String?     @db.VarChar(100)
  areaSqm        Decimal?    @map("area_sqm") @db.Decimal(8, 2)
  status         BoothStatus @default(AVAILABLE)
  priceAmount    Decimal?    @map("price_amount") @db.Decimal(12, 2)
  currency       String      @default("EUR") @db.Char(3)
  createdAt      DateTime    @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt      DateTime    @updatedAt @map("updated_at") @db.Timestamptz(3)
  deletedAt      DateTime?   @map("deleted_at") @db.Timestamptz(3)

  organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "booths_org_fk")
  event        Event             @relation(fields: [eventId], references: [id], onDelete: Restrict, map: "booths_event_fk")
  reservations BoothReservation[]

  @@unique([organizationId, id], map: "booths_org_id_uq")
  @@index([organizationId, eventId, status, zone], map: "booths_org_event_status_zone_idx")
  @@map("booths")
}

model BoothReservation {
  id              String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId  String            @map("organization_id") @db.Uuid
  eventId         String            @map("event_id") @db.Uuid
  boothId         String            @map("booth_id") @db.Uuid
  exhibitorId     String            @map("exhibitor_id") @db.Uuid
  status          ReservationStatus @default(ACTIVE)
  priceAmount     Decimal?          @map("price_amount") @db.Decimal(12, 2)
  currency        String            @default("EUR") @db.Char(3)
  reservedAt      DateTime          @default(now()) @map("reserved_at") @db.Timestamptz(3)
  releasedAt      DateTime?         @map("released_at") @db.Timestamptz(3)
  createdByUserId String?           @map("created_by_user_id") @db.Uuid
  createdAt       DateTime          @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt       DateTime          @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "booth_reservations_org_fk")
  event           Event        @relation(fields: [eventId], references: [id], onDelete: Restrict, map: "booth_reservations_event_fk")
  booth           Booth        @relation(fields: [boothId], references: [id], onDelete: Restrict, map: "booth_reservations_booth_fk")
  exhibitor       Exhibitor    @relation(fields: [exhibitorId], references: [id], onDelete: Restrict, map: "booth_reservations_exhibitor_fk")
  createdByUser   User?        @relation(fields: [createdByUserId], references: [id], onDelete: SetNull, map: "booth_reservations_user_fk")
  transaction     Transaction?

  @@unique([organizationId, id], map: "booth_reservations_org_id_uq")
  @@index([organizationId, eventId, status], map: "booth_reservations_org_event_status_idx")
  @@index([organizationId, exhibitorId, status], map: "booth_reservations_org_exhibitor_status_idx")
  @@index([organizationId, boothId, status], map: "booth_reservations_org_booth_status_idx")
  @@map("booth_reservations")
}
```

**Notes :**

- Le code stand n'est pas unique dans Prisma : l'unicité est partielle et exclut les lignes supprimées.
- Une seule réservation active par stand est garantie par index partiel.
- `booths.status` est synchronisé avec la réservation active par le service, dans la même transaction.

### 5.9 Asynchrone

```prisma
model Import {
  id               String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId   String        @map("organization_id") @db.Uuid
  eventId          String?       @map("event_id") @db.Uuid
  type             ImportType
  format           ImportFormat
  status           ImportStatus  @default(PENDING)
  idempotencyKey   String        @map("idempotency_key") @db.Char(64)
  duplicateStrategy DuplicateStrategy @map("duplicate_strategy")
  originalFilename String        @map("original_filename") @db.VarChar(255)
  storageKey       String        @map("storage_key")
  previewMetadata  Json?         @map("preview_metadata") @db.JsonB
  errorReportKey   String?       @map("error_report_key")
  totalRows        Int           @default(0) @map("total_rows")
  processedRows    Int           @default(0) @map("processed_rows")
  successRows      Int           @default(0) @map("success_rows")
  errorRows        Int           @default(0) @map("error_rows")
  createdByUserId  String        @map("created_by_user_id") @db.Uuid
  startedAt        DateTime?     @map("started_at") @db.Timestamptz(3)
  completedAt      DateTime?     @map("completed_at") @db.Timestamptz(3)
  errorCode        String?       @map("error_code") @db.VarChar(50)
  errorMessage     String?       @map("error_message") @db.VarChar(500)
  createdAt        DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt        DateTime      @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "imports_org_fk")
  event         Event?       @relation(fields: [eventId], references: [id], onDelete: Restrict, map: "imports_event_fk")
  createdByUser User         @relation(fields: [createdByUserId], references: [id], onDelete: Restrict, map: "imports_user_fk")

  @@unique([organizationId, idempotencyKey], map: "imports_org_idempotency_uq")
  @@index([organizationId, status, createdAt], map: "imports_org_status_created_idx")
  @@index([organizationId, eventId], map: "imports_org_event_idx")
  @@map("imports")
}

model Export {
  id               String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId   String       @map("organization_id") @db.Uuid
  requestedByUserId String      @map("requested_by_user_id") @db.Uuid
  reportType       ReportType   @map("report_type")
  format           ExportFormat
  status           ExportStatus @default(PENDING)
  parameters       Json         @db.JsonB
  pseudonymized    Boolean      @default(false)
  storageKey       String?      @map("storage_key")
  fileSizeBytes    BigInt?      @map("file_size_bytes")
  expiresAt        DateTime?    @map("expires_at") @db.Timestamptz(3)
  generatedAt      DateTime?    @map("generated_at") @db.Timestamptz(3)
  downloadedAt     DateTime?    @map("downloaded_at") @db.Timestamptz(3)
  errorMessage     String?      @map("error_message") @db.VarChar(500)
  createdAt        DateTime     @default(now()) @map("created_at") @db.Timestamptz(3)
  updatedAt        DateTime     @updatedAt @map("updated_at") @db.Timestamptz(3)

  organization    Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "exports_org_fk")
  requestedByUser User         @relation(fields: [requestedByUserId], references: [id], onDelete: Restrict, map: "exports_user_fk")

  @@index([organizationId, status, createdAt], map: "exports_org_status_created_idx")
  @@index([organizationId, requestedByUserId, createdAt], map: "exports_org_user_created_idx")
  @@index([status, expiresAt], map: "exports_status_expires_idx")
  @@map("exports")
}
```

**Notes :**

- `parameters` est validé par Zod au dépôt du job, puis figé.
- `pseudonymized` est dérivé du rôle au moment de la demande ; il n'est jamais choisi par le client.
- L'expiration est calculée à la génération à partir de `organizations.export_retention_days`.

### 5.10 Audit

```prisma
model AuditLog {
  id             String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String        @map("organization_id") @db.Uuid
  category       AuditCategory
  actorUserId    String?       @map("actor_user_id") @db.Uuid
  actionType     String        @map("action_type") @db.VarChar(80)
  resourceType   String        @map("resource_type") @db.VarChar(50)
  resourceId     String?       @map("resource_id")
  result         AuditResult
  metadata       Json          @default("{}") @db.JsonB
  ipAddress      String?       @map("ip_address") @db.Inet
  userAgent      String?       @map("user_agent")
  createdAt      DateTime      @default(now()) @map("created_at") @db.Timestamptz(3)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict, map: "audit_logs_org_fk")
  actorUser    User?        @relation(fields: [actorUserId], references: [id], onDelete: SetNull, map: "audit_logs_user_fk")

  @@index([organizationId, createdAt(sort: Desc)], map: "audit_logs_org_created_idx")
  @@index([organizationId, category, createdAt(sort: Desc)], map: "audit_logs_org_category_created_idx")
  @@index([organizationId, actorUserId, createdAt(sort: Desc)], map: "audit_logs_org_actor_created_idx")
  @@index([organizationId, resourceType, resourceId, createdAt(sort: Desc)], map: "audit_logs_org_resource_created_idx")
  @@map("audit_logs")
}
```

**Notes :**

- Pas de `updatedAt`, pas de relation inverse de modification.
- La taille de `metadata` est contrainte en SQL (≤ 8 Ko).
- L'acteur peut être nul pour une action système (purge, job planifié).

---

## 6. Stratégie pour les contraintes non exprimables dans Prisma

Prisma ne modélise pas les index partiels, les CHECK complexes ni les triggers. Ces éléments sont ajoutés par des migrations SQL explicites, revues et versionnées.

| # | Élément | Migration cible |
|---|---|---|
| P-01 | `citext`, `pg_trgm` | `20261121225300_init_database_schema` |
| P-02 | `UNIQUE (booth_id) WHERE status = 'ACTIVE'` | `20261121225300_init_database_schema` |
| P-03 | `UNIQUE (organization_id, event_id, participant_id) WHERE status = 'VALID'` sur `check_ins` | `20261121225300_init_database_schema` |
| P-04 | `UNIQUE (registration_id) WHERE type = 'TICKET'` sur `transactions` | `20261121225300_init_database_schema` |
| P-05 | `UNIQUE (booth_reservation_id) WHERE type = 'BOOTH'` sur `transactions` | `20261121225300_init_database_schema` |
| P-06 | `UNIQUE (organization_id, event_id, code) WHERE deleted_at IS NULL` sur `booths` | `20261121225300_init_database_schema` |
| P-07 | `UNIQUE (organization_id, email) WHERE status = 'PENDING'` sur `invitations` | `20261121225300_init_database_schema` |
| P-08 | FK composites incluant `organization_id` | `20261121231500_integrity_constraints` |
| P-09 | CHECK de cohérence (transactions, check-ins, réservations, montants) | `20261121231500_integrity_constraints` |
| P-10 | Trigger plafond des remboursements (puis durcissement `search_path` et qualification) | `20261122102000_refund_cap_trigger`, `20261122107000_refund_cap_search_path` |
| P-11 | Triggers d'immuabilité | `20261122103000_immutability_triggers` |
| P-12 | Trigger `updated_at` | `20261122104000_touch_updated_at_trigger` |
| P-13 | Index trigram | `20261122105000_trgm_indexes` |
| P-14 | `api_keys.scopes` NOT NULL + CHECK | `20261122100000_api_key_scopes_constraint` |
| P-15 | FK 3 colonnes de cohérence événementielle | `20261122101000_event_integrity_constraints` |
| P-16 | Rôle groupe runtime et privilèges | `20261122106000_runtime_privileges` |

### 6.1 FK composites et relations Prisma

Prisma déclare les relations par clé simple (`eventId → events.id`). Les migrations Phase 4 :

1. Ajoutent les contraintes `UNIQUE (organization_id, id)` sur les tables parents.
2. Remplacent les FK simples par des FK composites `(organization_id, <parent_id>)` — 19 au total.
3. Ajoutent 5 contraintes uniques 3 colonnes et 6 FK 3 colonnes pour la cohérence événementielle (billet, stand, inscription, réservation, check-in).
4. Conservent les index simples nécessaires aux jointures Prisma.

Cette approche garde le schéma lisible tout en rendant le croisement d'organisations et d'événements impossible au niveau PostgreSQL.

**Risque de drift Prisma :** `prisma migrate diff` et `prisma db pull` peuvent proposer de revenir aux FK simples, de supprimer les index partiels, les CHECK ou les triggers, car ils ne sont pas représentés dans `schema.prisma`. Ces propositions ne doivent jamais être appliquées telles quelles. Le workflow sûr est :

1. `prisma migrate dev --create-only` pour générer le SQL ;
2. revue manuelle du SQL ;
3. `npm run db:check:migrations` — le scanner refuse tout `DROP` non autorisé d'un objet protégé ;
4. `prisma migrate deploy` ;
5. `npm run db:verify:integrity` — vérification du catalogue réel.

Les remplacements volontaires de FK sont marqués par une directive `-- integrity-guard: allow DROP CONSTRAINT <nom>` dans la migration concernée. Aucune migration existante n'est réécrite.

### 6.2 Index partiels — formulation conceptuelle

```
CREATE UNIQUE INDEX booth_reservations_one_active_uq
  ON booth_reservations (booth_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX checkins_valid_unique_uq
  ON check_ins (organization_id, event_id, participant_id)
  WHERE status = 'VALID';

CREATE UNIQUE INDEX transactions_ticket_registration_uq
  ON transactions (registration_id)
  WHERE type = 'TICKET';

CREATE UNIQUE INDEX transactions_booth_reservation_uq
  ON transactions (booth_reservation_id)
  WHERE type = 'BOOTH';

CREATE UNIQUE INDEX booths_org_event_code_uq
  ON booths (organization_id, event_id, code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX invitations_pending_email_uq
  ON invitations (organization_id, email)
  WHERE status = 'PENDING';
```

### 6.3 Triggers — principes

| Trigger | Comportement attendu |
|---|---|
| Plafond de remboursement | `SELECT ... FOR UPDATE` sur la transaction ; somme des remboursements + nouveau montant ≤ `transactions.amount` ; sinon exception. `search_path = pg_catalog, public` et tables qualifiées `public.` pour résister au masquage par une table temporaire ou un schéma détourné |
| Immuabilité | Exception sur `UPDATE` et `DELETE` pour `check_ins`, `refunds`, `audit_logs` |
| `updated_at` | Positionne `updated_at = now()` si la valeur est absente ou identique à l'ancienne ; une valeur explicite différente est respectée |

Le trigger `updated_at` est limité aux 14 tables mutables qui possèdent la colonne. Il n'est jamais installé sur `check_ins`, `refunds` ni `audit_logs`. Une valeur explicite identique à l'ancienne est rafraîchie, car un trigger `BEFORE UPDATE` ne distingue pas une omission d'une valeur fournie identique.

Les messages d'erreur des triggers sont techniques (`check_violation`, `restrict_violation`) ; les services traduisent en erreurs métier explicites.

---

## 7. Soft delete et requêtage

### 7.1 Principes

- Aucun middleware global ne masque `deletedAt` : le repository décide explicitement.
- Les listes par défaut filtrent `deletedAt = null`.
- Les consultations d'historique ou d'audit peuvent inclure les supprimés.
- Les contraintes d'unicité sont partielles pour permettre la réutilisation d'un code ou d'un email après suppression.

### 7.2 Entités concernées

| Modèle | Suppression logique | Condition |
|---|---|---|
| `Event` | Oui | `DRAFT` ou `CANCELLED` |
| `Participant` | Oui | Sans impact comptable direct |
| `Registration` | Oui | Aucun paiement, aucun check-in |
| `Ticket` | Oui | Aucune inscription |
| `Exhibitor` | Oui | — |
| `Booth` | Oui | Aucune réservation active |
| Autres | Non | — |

### 7.3 Anonymisation

L'anonymisation d'un participant est une écriture applicative auditée, pas une suppression. Elle remplace les PII et positionne `anonymizedAt`. Le modèle Prisma ne porte aucune logique d'anonymisation.

---

## 8. Correspondance des types

| Concept | PostgreSQL | Prisma |
|---|---|---|
| UUID | `uuid` | `String @db.Uuid` |
| Date/heure | `timestamptz(3)` | `DateTime @db.Timestamptz(3)` |
| Date seule | — | Non utilisée en V1 |
| Montant | `numeric(12,2)` | `Decimal @db.Decimal(12, 2)` |
| Devise | `char(3)` | `String @db.Char(3)` |
| Texte court | `varchar(n)` | `String @db.VarChar(n)` |
| Texte long | `text` | `String` |
| Email | `citext` | `String @db.Citext` |
| Booléen | `boolean` | `Boolean` |
| Entier | `integer` / `smallint` | `Int @db.Integer` / `Int @db.SmallInt` |
| Grand entier | `bigint` | `BigInt` |
| JSON | `jsonb` | `Json @db.JsonB` |
| Tableau texte | `text[]` | `String[]` |
| IP | `inet` | `String @db.Inet` |
| Enum | type enum nommé | enum Prisma |

---

## 9. Stratégie de migration

### 9.1 Principes

1. **Baseline unique** : la première migration crée les 20 tables, les enums et les index Prisma.
2. **Migrations additives** : extensions, index partiels, FK composites, CHECK, triggers.
3. **Aucune migration destructive automatique** en production.
4. **Revue obligatoire** de chaque migration SQL générée ou personnalisée.
5. **Aucun `db push`** sur une base partagée.

### 9.2 Ordre cible

| Ordre | Migration | Contenu |
|---|---|---|
| 1 | `20261121225300_init_database_schema` | Tables, colonnes, enums, index Prisma, index partiels, extensions |
| 2 | `20261121231500_integrity_constraints` | CHECK métier, `UNIQUE (org, id)` et FK composites |
| 3 | `20261121232000_participant_merge_tenant_fk` | FK composite de fusion des participants |
| 4 | `20261122100000_api_key_scopes_constraint` | `api_keys.scopes` NOT NULL + CHECK |
| 5 | `20261122101000_event_integrity_constraints` | Contraintes uniques et FK 3 colonnes de cohérence événementielle (remplace 5 FK 2 colonnes) |
| 6 | `20261122102000_refund_cap_trigger` | Trigger de plafond cumulatif |
| 7 | `20261122103000_immutability_triggers` | Triggers append-only |
| 8 | `20261122104000_touch_updated_at_trigger` | Trigger d'horodatage |
| 9 | `20261122105000_trgm_indexes` | Index de recherche trigram |
| 10 | `20261122106000_runtime_privileges` | Rôle groupe runtime et privilèges minimaux |
| 11 | `20261122107000_refund_cap_search_path` | Durcissement de `enforce_refund_cap()` : `search_path` fixé et qualification `public.` |

Les migrations sont **additives à l'exception des cinq remplacements de FK 2 colonnes par des FK 3 colonnes** dans `20261122101000_event_integrity_constraints`. Ces `DROP CONSTRAINT` sont volontaires, limités et couverts par des directives `-- integrity-guard: allow DROP CONSTRAINT <nom>` ; aucune autre migration existante n'a été réécrite et aucune protection n'a été retirée sans remplacement équivalent ou supérieur.

### 9.3 Compatibilité

- **Ajout d'enum :** `ALTER TYPE ... ADD VALUE` uniquement.
- **Renommage :** jamais direct ; ajout d'une nouvelle valeur, double écriture temporaire si nécessaire.
- **Colonne :** ajout nullable ou avec défaut, puis remplissage, puis contrainte.
- **Suppression :** jamais dans la même version que l'arrêt du code.

---

## 10. Traçabilité

| Élément Prisma | Source |
|---|---|
| `Session` et rotation | PRD §18.4, SECURITY_ARCHITECTURE |
| `Membership` et `Role` | PRD §11.1, matrice A.1-A.11 |
| `Event.managerMembershipId` | PRD §11.1 (manager unique) |
| `Participant.email` sans unique | BR-PAR-002 |
| `Registration.status` | BR-REG-002 |
| `Transaction` / `Refund` | BR-PAY-001 à 009 |
| `CheckIn` append-only | BR-CHK-005/006/007 |
| `BoothReservation` active unique | BR-EXH-003 |
| `Import.idempotencyKey` | BR-IMP-004 |
| `Export.expiresAt` | BR-EXP-002 |
| `AuditLog` 11 champs | BR-AUD-003 |
| Soft delete | BR-DEL-001 à 004 |

---

## 11. Points ouverts

- Support officiel du schéma multi-fichiers selon la version Prisma retenue en Phase 4 : repli sur un fichier unique prévu.
- Maintien des FK simples en parallèle des FK composites : **tranché**. Les FK composites sont conservées seules pour les relations concernées ; aucune FK simple parallèle n'est maintenue. Prisma ne modélisant pas ces contraintes, `prisma migrate diff` propose de les supprimer et de recréer des FK simples : ces propositions ne doivent jamais être appliquées (voir §6.1).
- Rétention des fichiers d'import et d'audit : non définie en Phase 1.
- Stratégie exacte de génération UUIDv7 : utilitaire partagé à spécifier en Phase 4.

---

*Fin de PRISMA_SCHEMA_DESIGN.md — Version 1.0.*
