# API_DESIGN.md — EventPulse Analytics

**Phase :** 3 — Software Architecture & Database Design

**Version :** 1.0

**Date :** 2026-11-18

**Style :** REST, JSON, versionnée

**Base :** `/api/v1`

**Compléments :** `BACKEND_ARCHITECTURE.md`, `SECURITY_ARCHITECTURE.md`, `DATABASE_DESIGN.md`

> Ce document définit les contrats. Il ne contient aucune implémentation. Les règles métier détaillées restent dans `BUSINESS_RULES.md` et ne sont pas redéfinies ici.

---

## 1. Conventions

### 1.1 URL

| Règle | Exemple |
|---|---|
| Ressources au pluriel | `/events` |
| `kebab-case` | `/check-ins`, `/booth-reservations` |
| Identifiants UUID en chemin | `/events/{eventId}` |
| Imbrication uniquement pour une appartenance forte | `/events/{eventId}/tickets` |
| Pas de verbe dans l'URL | `POST /events/{eventId}/publish` est une action d'état assumée |
| Pas de slash final | `/events` |
| Paramètres de requête en `camelCase` | `?eventId=...&from=...` |

**Actions d'état :** les transitions non couvertes par un `PATCH` sont exposées comme sous-ressources d'action (`/publish`, `/cancel`, `/release`). Elles restent idempotentes lorsque la règle métier le permet.

### 1.2 Versionnement

- Préfixe obligatoire `/api/v1`.
- Une rupture de contrat impose `/api/v2` ; aucun champ n'est supprimé en v1.
- Les ajouts de champs sont non rupturants.
- Une dépréciation est annoncée par les en-têtes `Deprecation` et `Sunset`.

### 1.3 En-têtes

| En-tête | Usage |
|---|---|
| `Authorization: Bearer <access>` | Authentification utilisateur |
| `X-API-Key: <key>` | Ingestion machine |
| `X-Request-Id` | Corrélation, généré si absent |
| `Idempotency-Key` | Imports et exports |
| `Content-Type: application/json` | Défaut |
| `Accept: application/json` | Défaut |
| `Location` | Ressource créée (201, 202) |
| `Retry-After` | 429, 503 |

---

## 2. Formats

### 2.1 Succès

Ressource unique :

```json
{
  "data": { "id": "018f...", "name": "..." }
}
```

Collection :

```json
{
  "data": [ { "id": "018f..." } ],
  "meta": {
    "limit": 25,
    "hasMore": true,
    "nextCursor": "eyJpZCI6IjAxOGYiLCJ2IjoiMjAyNi0xMS0xOFQxMDowMDowMFoifQ"
  }
}
```

Action sans contenu : **204 No Content**.

Création asynchrone : **202 Accepted** avec `Location: /api/v1/imports/{id}` ou `/exports/{id}`.

### 2.2 Montants et dates

- Montants sérialisés en **chaîne décimale** : `{ "amount": "120.00", "currency": "EUR" }`. Jamais de flottant JSON.
- Dates en **ISO 8601 UTC** : `2026-11-18T09:30:00.000Z`.
- Les paramètres `from` et `to` acceptent un offset, puis sont normalisés en UTC.
- Les identifiants sont des UUID sous forme de chaîne.

### 2.3 Erreurs

Format unique Problem Details :

```json
{
  "type": "https://api.eventpulse.dev/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "code": "AUTH_FORBIDDEN",
  "detail": "This action requires the OWNER or ADMIN role.",
  "instance": "/api/v1/organizations/current/members",
  "requestId": "req_01J...",
  "errors": []
}
```

- `errors` n'est présent que pour une validation ou un conflit multi-champs.
- Aucun détail interne, SQL, stack ou nom de table.
- Un accès cross-tenant est un **404**.
- Un rôle insuffisant sur une ressource visible est un **403**.

---

## 3. Pagination, filtres, tri, recherche

### 3.1 Pagination

- **Curseur** par défaut sur toutes les collections.
- `limit` : 1 à 100, défaut 25.
- `cursor` : opaque, encode la clé de tri et l'identifiant.
- Aucune pagination par `offset` en v1, sauf exports de rapports internes (non exposés).
- Le tri par défaut est stable et documenté par endpoint (`createdAt` ou `startAt` descendant).

### 3.2 Filtres

| Filtre | Type | Portée |
|---|---|---|
| `eventId` | UUID répétable | Ressources événementielles |
| `status` | enum répétable | Listes |
| `role` | enum | Memberships |
| `from`, `to` | ISO 8601 | Périodes semi-ouvertes `[from, to)` |
| `eventType` | enum | Événements |
| `format` | enum | Exports |
| `source` | enum | Inscriptions, check-ins |
| `country`, `region`, `city` | chaîne | Participants, audience |
| `q` | chaîne | Recherche |

**Périodes :**

- `from` inclus, `to` exclu.
- `from < to` obligatoire.
- Sans `from`/`to`, la période par défaut dépend de l'endpoint et est documentée.
- Les bornes sont interprétées dans le fuseau de l'organisation ou de l'événement, puis converties en UTC.
- Les filtres de période ne s'appliquent jamais implicitement à la date de début d'un événement.
- Les comparaisons utilisent des fenêtres de même longueur.

### 3.3 Tri

`sort=startAt` (ascendant) ou `sort=-startAt` (descendant). Les champs autorisés sont propres à chaque endpoint. Un champ inconnu retourne 400.

### 3.4 Recherche

- `q` : 2 à 100 caractères, insensible à la casse et aux accents si la collation le permet.
- Portée : `events.name`, `participants.firstName/lastName/email`, `exhibitors.name`.
- Les résultats restent soumis au RBAC et au tenant.

### 3.5 Validation

- Zod valide `params`, `query`, `body` et `headers` sensibles.
- Les paramètres inconnus sont rejetés (400) ; `cursor` et `limit` sont whitelistés.
- Les enums sont stricts.
- Les UUID sont validés avant toute requête.
- Un corps vide sur une action qui en exige un est refusé.
- Les tailles maximales sont bornées (corps JSON, fichiers).

---

## 4. Codes HTTP

| Code | Usage |
|---|---|
| 200 | Lecture ou mise à jour réussie |
| 201 | Ressource créée |
| 202 | Job accepté (import, export) |
| 204 | Suppression ou action sans contenu |
| 302 | Redirection vers URL signée de téléchargement |
| 400 | Requête mal formée, paramètre inconnu |
| 401 | Token absent, invalide, expiré |
| 403 | Rôle ou portée insuffisants |
| 404 | Ressource absente ou hors tenant |
| 405 | Méthode non supportée |
| 409 | Conflit d'état, doublon, réservation concurrente |
| 410 | Export expiré |
| 413 | Fichier ou corps trop volumineux |
| 422 | Règle métier violée |
| 429 | Limite de débit |
| 500 | Erreur interne |
| 503 | Dépendance indisponible |

**Codes métier stables :** chaque erreur expose un `code` lisible par le client (`EVT_INVALID_TRANSITION`, `CHK_DUPLICATE`, `PAY_REFUND_EXCEEDS_AMOUNT`, `IMP_DUPLICATE`, `EXP_EXPIRED`, etc.). Ils sont documentés dans OpenAPI.

---

## 5. Authentification et contexte

| Mode | En-tête | Portée |
|---|---|---|
| Utilisateur | `Authorization: Bearer` | Toutes les routes métier |
| Ingestion | `X-API-Key` | Routes `/ingestion/*` uniquement |

- L'organisation active est **dérivée de la session**, jamais d'un paramètre client non vérifié.
- `POST /auth/switch-organization` crée un nouveau couple de tokens dans la même famille et révoque l'ancien refresh.
- Le membership est rechargé à chaque requête : un changement de rôle est immédiat.
- Un token destiné à l'organisation A ne peut pas appeler une ressource de l'organisation B, même avec un identifiant valide : retour 404.
- L'API key ne donne accès à aucune route de lecture, d'export ou d'administration.

---

## 6. Endpoints — Authentification

| Méthode | Chemin | Description | Accès |
|---|---|---|---|
| POST | `/auth/login` | Connexion email/mot de passe | Public |
| POST | `/auth/refresh` | Rotation du refresh token (cookie) | Public (cookie) |
| POST | `/auth/logout` | Révoque la session courante | Authentifié |
| POST | `/auth/logout-all` | Révoque toutes les sessions de l'utilisateur | Authentifié |
| GET | `/auth/me` | Profil, organisations, rôle actif | Authentifié |
| GET | `/auth/sessions` | Sessions actives de l'utilisateur | Authentifié |
| DELETE | `/auth/sessions/{sessionId}` | Révoque une session propre | Authentifié |
| POST | `/auth/switch-organization` | Change l'organisation active | Authentifié |
| POST | `/auth/password/forgot` | Demande de réinitialisation | Public |
| POST | `/auth/password/reset` | Réinitialisation par token | Public |

**Notes :**

- `/auth/refresh` lit un cookie `HttpOnly`, `Secure` en production, `SameSite=Strict`, limité au chemin `/api/v1/auth` ; il ne prend pas de body et vérifie l'en-tête `Origin`.
- Deux refresh simultanés avec le même token : un seul aboutit ; l'autre est traité comme réutilisation et révoque la famille, y compris le token gagnant. Le frontend doit sérialiser (single-flight) ses refresh.
- La réponse de login contient l'access token et l'utilisateur, jamais le refresh token en clair.
- `POST /auth/switch-organization` vérifie un membership `ACTIVE`.
- `POST /auth/logout` accepte un bearer ou, à défaut, le cookie de refresh avec validation d'origine.
- Les échecs de connexion sont rate-limités et audités sans révéler l'existence de l'email ; le verrouillage progressif est compté par compte **et** par IP afin qu'un attaquant ne puisse pas verrouiller durablement une victime.
- Les sessions ont une expiration glissante de 7 jours plafonnée par une expiration absolue de 30 jours ; le listing des sessions est borné et n'expose aucun secret.
- `POST /auth/password/forgot` renvoie toujours `204`, même pour un email inconnu ; le quota par compte ne révoque jamais un token encore valide ; `POST /auth/password/reset` révoque toutes les sessions après succès.
- Sans fournisseur mail configuré, l'envoi est un no-op en développement et échoue en production avant toute création de token ; l'état est visible via `/health/ready` et un avertissement au démarrage.

**Codes d'erreur stables :** `AUTH_INVALID_CREDENTIALS` (401), `AUTH_TOKEN_MISSING` / `AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` / `AUTH_SESSION_REVOKED` / `AUTH_SESSION_EXPIRED` (401), `AUTH_ACCOUNT_DISABLED` / `AUTH_NO_ACTIVE_MEMBERSHIP` / `AUTH_FORBIDDEN` / `AUTH_ORIGIN_FORBIDDEN` (403), `AUTH_SESSION_NOT_FOUND` (404), `AUTH_ORGANIZATION_REQUIRED` (409), `AUTH_RESET_TOKEN_INVALID` (400), `AUTH_RATE_LIMITED` (429), `AUTH_REDIS_UNAVAILABLE` (503).

---

## 7. Endpoints — Organisations, membres, clés API

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/organizations` | Organisations de l'utilisateur | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/organizations/current` | Organisation active | ✓ | ✓ | ✓ | ✓ | ✓ |
| PATCH | `/organizations/current` | Paramètres | ✓ | ◐ | — | — | — |
| GET | `/organizations/current/members` | Liste des membres | ✓ | ✓ | — | — | — |
| PATCH | `/organizations/current/members/{membershipId}` | Rôle / statut | ✓ | ◐ | — | — | — |
| DELETE | `/organizations/current/members/{membershipId}` | Désactivation | ✓ | ◐ | — | — | — |
| GET | `/organizations/current/invitations` | Invitations | ✓ | ✓ | — | — | — |
| POST | `/organizations/current/invitations` | Inviter | ✓ | ◐ | — | — | — |
| DELETE | `/organizations/current/invitations/{invitationId}` | Révoquer | ✓ | ✓ | — | — | — |
| POST | `/invitations/accept` | Accepter avec une session existante | ✓ | ✓ | ✓ | ✓ | ✓ |
| POST | `/invitations/accept-token` | Accepter publiquement via le token email | Public + rate limit | Public | Public | Public | Public |
| GET | `/organizations/current/api-keys` | Clés API (sans secret) | ✓ | ✓ | — | — | — |
| POST | `/organizations/current/api-keys` | Créer une clé | ✓ | ✓ | — | — | — |
| POST | `/organizations/current/api-keys/{keyId}/revoke` | Révoquer | ✓ | ✓ | — | — | — |
| POST | `/organizations/current/api-keys/{keyId}/rotate` | Rotater atomiquement | ✓ | ✓ | — | — | — |

**Restrictions :**

- `PATCH /organizations/current` : OWNER pour devise, slug et paramètres critiques ; ADMIN pour nom, fuseau et rétention, dans les limites validées. Le rôle effectif est relu dans la transaction ; une rétrogradation concurrente ne peut pas être contournée.
- ADMIN ne peut ni attribuer ni modifier le rôle OWNER, ni désactiver un OWNER.
- La dernière membership OWNER active ne peut pas être dégradée ni désactivée ; le verrou d'organisation sérialise les démotions concurrentes.
- `POST /organizations/current/invitations` avec `role=OWNER` est réservé à OWNER.
- Toutes les écritures de membres et d'invitations sont filtrées par `organization_id` : une ressource d'un autre tenant retourne `404`, jamais une fuite d'existence.
- La création et la révocation d'invitations ainsi que les opérations sur les clés API acquièrent d'abord le verrou d'organisation (`SELECT ... FOR UPDATE`) puis relisent le rôle effectif de l'acteur dans la transaction, avant de verrouiller la ressource ciblée. Une rétrogradation concurrente ne peut donc pas être contournée.
- La désactivation d'une membership révoque toutes les sessions de l'utilisateur dans l'organisation **dans la même transaction** ; un échec de révocation annule la désactivation. La garde de membership verrouillée lors de la création/rotation de session empêche toute session concurrente de survivre au commit.
- Le secret d'API n'est retourné qu'une fois, à la création ou à la rotation.

**Invitations :**

- Le token brut (32 octets, base64url, 43 caractères) n'est envoyé que par email ; la base ne stocke que son hash HMAC avec `INVITATION_TOKEN_PEPPER`.
- `POST /invitations/accept` reste disponible pour un client déjà authentifié ; l'email du compte doit correspondre exactement à celui de l'invitation.
- `POST /invitations/accept-token` est public : le token est la **preuve de possession de l'adresse pour cette invitation uniquement**. Il n'existe pas de flag global `emailVerified` et le flux ne modifie jamais l'email d'un compte existant.
- Les trois cas sont supportés dans une transaction unique (compte, membership, consommation de l'invitation, session) :
  1. nouvel email → compte provisionné avec le mot de passe choisi (Argon2id), membership `ACTIVE`, session émise ;
  2. compte existant sans membership → compte réutilisé, **mot de passe existant jamais modifié**, membership créé ;
  3. compte existant déjà membre actif avec le rôle invité → token consommé, session émise, aucun doublon de membership ; rôle ou statut incompatible → `409 MEMBERSHIP_ALREADY_EXISTS` sans consommer le token.
- Le token est à usage unique. L'organisation est verrouillée (`SELECT ... FOR UPDATE`) avant la ligne d'invitation, puis statut `PENDING`, expiration et consommation sont relus et verrouillés dans la transaction : une acceptation concurrente, une révocation ou un rejeu ne peut pas produire d'état partiel et retourne selon le cas `400 INVITATION_INVALID` ou `409 MEMBERSHIP_ALREADY_EXISTS`/`INVITATION_NOT_PENDING`.
- La route publique est rate-limitée par IP (`INVITATION_ACCEPT_MAX_ATTEMPTS` / `INVITATION_ACCEPT_WINDOW_SECONDS`, défauts 20 / 900 s) et ne divulgue pas si l'email existe : token inconnu, expiré, révoqué, consommé ou compte inactif partagent le même code.
- Un échec d'envoi email révoque l'invitation créée et retourne `503 INVITATION_DELIVERY_FAILED`. La révocation est retentée (3 tentatives) ; si toutes échouent, un log structuré `INVITATION_REVOCATION_FAILED` avec `requiresManualRevocation: true` est émis. Une fenêtre résiduelle existe si le processus s'arrête entre l'échec d'envoi et la révocation : l'invitation peut alors rester `PENDING` et doit être révoquée manuellement (aucune outbox/queue introduite pour ce point).

**Clés API :**

- `expiresAt` est optionnel ; une date passée ou invalide est refusée (`400 API_KEY_EXPIRY_INVALID`) et une clé expirée n'est plus validée.
- La rotation est atomique : l'ancienne clé est verrouillée, révoquée conditionnellement, puis la nouvelle est créée dans la même transaction avec les **mêmes scopes** (nom et expiration conservés sauf surcharge valide). L'ancien secret est inutilisable dès le commit ; deux rotations concurrentes n'en laissent qu'une aboutir (`409 API_KEY_NOT_ACTIVE`).
- Aucune réponse ne contient `keyHash`, pepper ou secret après la création/rotation.

**Erreurs stables :** `MEMBERSHIP_NOT_FOUND` (404), `INVITATION_NOT_FOUND` (404), `API_KEY_NOT_FOUND` (404), `INVITATION_INVALID` (400), `API_KEY_SCOPES_INVALID` (400), `API_KEY_EXPIRY_INVALID` (400), `INVITATION_EMAIL_MISMATCH` (403), `MEMBERSHIP_ALREADY_EXISTS` (409), `LAST_OWNER_PROTECTED` (409), `INVITATION_ALREADY_PENDING` (409), `INVITATION_NOT_PENDING` (409), `API_KEY_NOT_ACTIVE` (409), `INVITATION_DELIVERY_FAILED` (503).

---

## 8. Endpoints — Événements et billets

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/events` | Liste des événements | ✓ | ✓ | ◐ | ◐ | ◐ |
| POST | `/events` | Créer | ✓ | ✓ | ✓ | — | — |
| GET | `/events/{eventId}` | Détail | ✓ | ✓ | ◐ | ◐ | ◐ |
| PATCH | `/events/{eventId}` | Modifier | ✓ | ✓ | ◐ | — | — |
| DELETE | `/events/{eventId}` | Soft delete | ✓ | ✓ | — | — | — |
| POST | `/events/{eventId}/publish` | Publier | ✓ | ✓ | ◐ | — | — |
| POST | `/events/{eventId}/start` | Passer en `ONGOING` | ✓ | ✓ | ◐ | — | — |
| POST | `/events/{eventId}/complete` | Clôturer | ✓ | ✓ | ◐ | — | — |
| POST | `/events/{eventId}/archive` | Archiver | ✓ | ✓ | ◐ | — | — |
| POST | `/events/{eventId}/cancel` | Annuler | ✓ | ✓ | ◐ | — | — |
| PATCH | `/events/{eventId}/manager` | Assigner un manager | ✓ | ✓ | — | — | — |
| GET | `/events/{eventId}/tickets` | Billets | ✓ | ✓ | ◐ | — | — |
| POST | `/events/{eventId}/tickets` | Créer un billet | ✓ | ✓ | ◐ | — | — |
| PATCH | `/events/{eventId}/tickets/{ticketId}` | Modifier | ✓ | ✓ | ◐ | — | — |
| DELETE | `/events/{eventId}/tickets/{ticketId}` | Supprimer si non utilisé | ✓ | ✓ | — | — | — |

**Portée `◐` :**

- **EVENT_MANAGER** : uniquement les événements assignés. Création auto-assignée.
- **ANALYST / VIEWER** : uniquement `PUBLISHED`, `ONGOING`, `COMPLETED`, `ARCHIVED` en lecture. `DRAFT` et `CANCELLED` invisibles.
- **EVENT_MANAGER** : voit aussi `DRAFT` et `CANCELLED` de ses événements.
- Les actions de transition renvoient 422 si la transition est invalide.
- `ARCHIVED` et `CANCELLED` sont terminaux.
- `DELETE` n'est possible que pour `DRAFT` et `CANCELLED`.
- `PATCH /events/{eventId}/manager` accepte `membershipId` (ou `null` pour retirer l'affectation), réservé à OWNER/ADMIN. Le membership doit être actif, de rôle `EVENT_MANAGER` et appartenir à la même organisation. Une réassignation remplace l'affectation : l'ancien responsable perd l'accès, le nouveau devient l'unique responsable. Aucune co-responsabilité en V1 (D-09/A-01).

**Filtres :** `status`, `eventType`, `from`, `to` (sur `startAt`), `q`, `managerMembershipId` (O/A).
**Tri :** `startAt`, `name`, `createdAt`.

---

## 9. Endpoints — Participants

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/participants` | Liste (PII) | ✓ | ✓ | ◐ | — | — |
| POST | `/participants` | Créer | ✓ | ✓ | ✓ | — | — |
| GET | `/participants/{participantId}` | Détail (PII) | ✓ | ✓ | ◐ | — | — |
| PATCH | `/participants/{participantId}` | Modifier | ✓ | ✓ | ◐ | — | — |
| DELETE | `/participants/{participantId}` | Soft delete | ✓ | ✓ | — | — | — |
| POST | `/participants/merge` | Fusionner | ✓ | ✓ | — | — | — |
| POST | `/participants/{participantId}/anonymize` | Anonymiser | ✓ | ✓ | — | — | — |
| POST | `/participants/{participantId}/erase` | Effacement définitif conditionnel | ✓ | ✓ | — | — | — |
| GET | `/participants/{participantId}/registrations` | Inscriptions du participant | ✓ | ✓ | ◐ | — | — |

**Portée `◐` EVENT_MANAGER :** `eventId` obligatoire et événement assigné. La réponse est limitée aux participants ayant une inscription sur cet événement.

**Interdits :**

- ANALYST et VIEWER n'ont **aucun** accès aux participants nominatifs. Les agrégats passent par `/analytics/*`.
- La fusion exige une confirmation explicite (`sourceParticipantId`, `targetParticipantId`, `confirm=true`).
- L'anonymisation est irréversible et auditée.
- L'effacement définitif est refusé (`409 PARTICIPANT_ERASURE_BLOCKED`) si le participant est lié à une transaction ou un remboursement ; les agrégats comptables sont toujours conservés. Sans référence métier, la ligne est supprimée ; sinon les PII sont purgées et l'identifiant technique est conservé (`erased_at`).
- L'email n'est pas unique ; aucun endpoint ne recherche « le » participant par email sans identifiant.

**Filtres :** `eventId`, `q`, `country`, `region`, `city`, `from`, `to` (création).
**Tri :** `lastName`, `createdAt`, `email`.

---

## 10. Endpoints — Inscriptions

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/registrations` | Liste (PII) | ✓ | ✓ | ◐ | — | — |
| POST | `/registrations` | Créer | ✓ | ✓ | ✓ | — | — |
| GET | `/registrations/{registrationId}` | Détail | ✓ | ✓ | ◐ | — | — |
| PATCH | `/registrations/{registrationId}` | Statut / billet | ✓ | ✓ | ◐ | — | — |
| POST | `/registrations/{registrationId}/confirm` | Confirmer | ✓ | ✓ | ◐ | — | — |
| POST | `/registrations/{registrationId}/cancel` | Annuler | ✓ | ✓ | ◐ | — | — |
| DELETE | `/registrations/{registrationId}` | Soft delete conditionnel | ✓ | ✓ | — | — | — |

**Restrictions :**

- `eventId` obligatoire pour EVENT_MANAGER.
- `DELETE` refusé si paiement ou check-in existant (422).
- Transitions invalides : 422 `REG_INVALID_TRANSITION`.
- Un billet d'un autre événement est refusé (422).
- Aucune unicité participant/événement : plusieurs inscriptions sont autorisées.

**Filtres :** `eventId`, `participantId`, `ticketId`, `status`, `source`, `from`, `to` (date d'inscription).
**Tri :** `registeredAt`, `createdAt`, `status`.

---

## 11. Endpoints — Transactions et remboursements

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/transactions` | Liste détaillée | ✓ | ✓ | ◐ | — | — |
| POST | `/transactions` | Enregistrer une transaction | ✓ | ✓ | ◐ | — | — |
| GET | `/transactions/{transactionId}` | Détail | ✓ | ✓ | ◐ | — | — |
| PATCH | `/transactions/{transactionId}` | Statut de paiement | ✓ | ✓ | ◐ | — | — |
| POST | `/transactions/{transactionId}/refunds` | Remboursement | ✓ | ✓ | ◐ | — | — |
| GET | `/refunds` | Liste des remboursements | ✓ | ✓ | ◐ | — | — |
| GET | `/refunds/{refundId}` | Détail | ✓ | ✓ | ◐ | — | — |

**Restrictions :**

- Seules les transitions `PENDING → PAID`, `PENDING → FAILED`, `PAID → PARTIALLY_REFUNDED/REFUNDED` sont admises ; EVENT_MANAGER est limité aux transitions autorisées par le PRD.
- Aucune suppression de transaction.
- Le cumul des remboursements ne peut pas dépasser le montant payé (422 `PAY_REFUND_EXCEEDS_AMOUNT`).
- Le montant d'origine est immuable.
- Un remboursement référence toujours une transaction `PAID` ou `PARTIALLY_REFUNDED`.
- Une transaction `TICKET` exige `registrationId` ; une transaction `BOOTH` exige `boothReservationId`.

**Filtres :** `eventId`, `type`, `status`, `from`, `to` (date de paiement ou de remboursement).
**Tri :** `paidAt`, `refundedAt`, `createdAt`, `amount`.

---

## 12. Endpoints — Check-ins

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/check-ins` | Liste détaillée | ✓ | ✓ | ◐ | — | — |
| POST | `/check-ins` | Enregistrer un check-in | ✓ | ✓ | ◐ | — | — |
| GET | `/check-ins/{checkInId}` | Détail | ✓ | ✓ | ◐ | — | — |

**Restrictions :**

- Aucun `PUT`, `PATCH` ni `DELETE` : la table est append-only.
- Une correction est une **nouvelle opération** via `POST /check-ins`.
- La réponse expose `status` (`VALID`/`INVALID`) et `reason` si invalide.
- Un check-in `VALID` en doublon renvoie 409 `CHK_DUPLICATE`.
- Un check-in hors fenêtre est **enregistré** en `INVALID` avec `reason=OUTSIDE_WINDOW` si la politique de saisie le permet ; le refus sec n'est pas la seule issue.
- `eventId` obligatoire pour EVENT_MANAGER.
- Les agrégats de présence passent par `/analytics/*`.

**Payload conceptuel :**

```json
{
  "eventId": "018f...",
  "participantId": "018f...",
  "registrationId": "018f...",
  "source": "MANUAL",
  "checkedInAt": "2026-11-18T09:30:00.000Z"
}
```

**Filtres :** `eventId`, `participantId`, `status`, `reason`, `source`, `from`, `to` (date de check-in).
**Tri :** `checkedInAt`, `createdAt`.

---

## 13. Endpoints — Exposants, stands, réservations

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/exhibitors` | Liste des exposants | ✓ | ✓ | ◐ | — | — |
| POST | `/exhibitors` | Créer | ✓ | ✓ | ✓ | — | — |
| GET | `/exhibitors/{exhibitorId}` | Détail | ✓ | ✓ | ◐ | — | — |
| PATCH | `/exhibitors/{exhibitorId}` | Modifier | ✓ | ✓ | ◐ | — | — |
| DELETE | `/exhibitors/{exhibitorId}` | Soft delete | ✓ | ✓ | — | — | — |
| GET | `/events/{eventId}/booths` | Liste des stands | ✓ | ✓ | ◐ | — | — |
| POST | `/events/{eventId}/booths` | Créer un stand | ✓ | ✓ | ◐ | — | — |
| PATCH | `/events/{eventId}/booths/{boothId}` | Modifier | ✓ | ✓ | ◐ | — | — |
| DELETE | `/events/{eventId}/booths/{boothId}` | Soft delete | ✓ | ✓ | — | — | — |
| GET | `/events/{eventId}/booth-reservations` | Réservations | ✓ | ✓ | ◐ | — | — |
| POST | `/events/{eventId}/booth-reservations` | Réserver | ✓ | ✓ | ◐ | — | — |
| GET | `/booth-reservations/{reservationId}` | Détail | ✓ | ✓ | ◐ | — | — |
| POST | `/booth-reservations/{reservationId}/release` | Libérer | ✓ | ✓ | ◐ | — | — |

**Restrictions :**

- Une seule réservation `ACTIVE` par stand : conflit 409 `EXH_BOOTH_ALREADY_RESERVED`.
- Un stand `UNAVAILABLE` n'est pas réservable.
- La libération est horodatée et conserve l'historique.
- Le prix du stand peut être modifié par EVENT_MANAGER sur ses événements, dans les limites PRD.
- Aucun accès nominatif pour ANALYST/VIEWER : seuls les agrégats exposés par `/analytics/exhibitors` sont disponibles.

**Filtres :** `eventId`, `status`, `zone`, `exhibitorId`, `from`, `to` (réservation).
**Tri :** `code`, `name`, `reservedAt`.

---

## 14. Endpoints — Imports et ingestion

### 14.1 Imports utilisateur

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| POST | `/imports/preview` | Analyser un fichier sans écrire | ✓ | ✓ | ◐ | — | — |
| POST | `/imports` | Démarrer un import | ✓ | ✓ | ◐ | — | — |
| GET | `/imports` | Lister les imports | ✓ | ✓ | ◐ | — | — |
| GET | `/imports/{importId}` | Statut et compteurs | ✓ | ✓ | ◐ | — | — |
| GET | `/imports/{importId}/errors` | Télécharger le rapport d'erreurs | ✓ | ✓ | ◐ | — | — |

**Restrictions :**

- `multipart/form-data` : `file`, `type`, `eventId?`, `duplicateStrategy`, `dryRun`.
- `POST /imports/preview` valide colonnes, types et doublons, sans persistance métier.
- `POST /imports` retourne **202** et un `Location`.
- `Idempotency-Key` optionnel ; la clé serveur est un hash déterministe du contenu, de l'organisation, du type d'import et de la version de schéma, **sans timestamp** (BR-IMP-004).
- Un import identique renvoie 409 `IMP_DUPLICATE` avec l'identifiant de l'import existant.
- Le rapport d'erreurs est accessible par URL signée, réservé aux rôles autorisés sur l'événement.
- Aucun accès pour ANALYST/VIEWER.

### 14.2 Ingestion machine

| Méthode | Chemin | Description | Accès |
|---|---|---|---|
| POST | `/ingestion/registrations` | Upsert par lot | API key `ingestion:write` |
| POST | `/ingestion/check-ins` | Ingestion de check-ins | API key `ingestion:write` |
| POST | `/ingestion/payments` | Ingestion de paiements | API key `ingestion:write` |

**Restrictions :**

- `X-API-Key` obligatoire, clé active, non expirée, de l'organisation cible.
- Scope `ingestion:write` uniquement ; le contrôle applicatif doit refuser `{}` et les doublons, que le `CHECK` SQL laisse passer.
- Aucune route de lecture, d'export ou d'administration accessible par API key.
- Payloads limités aux inscriptions, check-ins et paiements (BR-IMP-007) ; aucun payload participant direct.
- Lot borné (ex. 1 000 lignes), réponse par ligne (succès/erreur), idempotence par clé fournie ou dérivée du contenu.
- Rate limit spécifique.
- Chaque appel est audité dans la catégorie `INGESTION`.

---

## 15. Endpoints — Rapports et exports

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/reports/catalog` | 5 rapports prédéfinis | ✓ | ✓ | ✓ | ✓ | — |
| POST | `/exports` | Demander un export | ✓ | ✓ | ◐ | ◐ | — |
| GET | `/exports` | Historique | ✓ | ✓ | ◐ | ◐ | — |
| GET | `/exports/{exportId}` | Statut et métadonnées | ✓ | ✓ | ◐ | ◐ | — |
| GET | `/exports/{exportId}/download` | Téléchargement | ✓ | ✓ | ◐ | ◐ | — |

**Rapports prédéfinis :**

| Code | Nom |
|---|---|
| `EVENT_PERFORMANCE` | Performance d'événement |
| `FINANCIAL` | Financier |
| `ATTENDANCE` | Fréquentation |
| `EXHIBITORS` | Exposants |
| `EVENT_COMPARISON` | Comparaison inter-événements |

**Restrictions :**

- EVENT_MANAGER : exports limités à ses événements, **pseudonymisés**.
- ANALYST : exports pseudonymisés, agrégats.
- VIEWER : aucun export, y compris Revenue Analytics.
- `pseudonymized` est décidé côté serveur selon le rôle ; un client ne peut pas le désactiver.
- `GET /exports/{id}/download` vérifie l'appartenance ; retourne 302 vers une URL signée valide 15 minutes.
- Export terminé mais expiré : 410 `EXP_EXPIRED`.
- Export en cours : 409 `EXP_NOT_READY`.
- `GET /exports` : O/A voient tout ; EM/AN ne voient que les leurs.
- `Idempotency-Key` supporté pour éviter les demandes dupliquées.

**Payload conceptuel :**

```json
{
  "reportType": "FINANCIAL",
  "format": "XLSX",
  "parameters": {
    "eventIds": ["018f..."],
    "from": "2026-01-01T00:00:00+01:00",
    "to": "2026-07-01T00:00:00+02:00"
  }
}
```

Les paramètres sont validés par Zod et figés dans `exports.parameters`.

---

## 16. Endpoints — Analytique

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/analytics/kpis` | Catalogue des 24 KPI | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/analytics/overview` | Vue d'ensemble | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/analytics/events/{eventId}` | KPI d'un événement | ✓ | ✓ | ◐ | ◐ | ◐ |
| GET | `/analytics/revenue` | Revenue Analytics | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/analytics/audience` | Audience Analytics | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/analytics/exhibitors` | Exhibitor Analytics | ✓ | ✓ | ✓ | ✓ | ✓ |
| GET | `/analytics/compare` | Comparaison | ✓ | ✓ | ✓ | ✓ | ◐ |
| GET | `/analytics/advanced` | Advanced Analytics (Should) | ✓ | — | — | ✓ | — |

**Restrictions :**

- **VIEWER :** lecture seule, agrégats uniquement, aucun PII, aucun export. Comparaison limitée à un usage basique (2 événements, filtres standards). Aucun drill-down détaillé.
- **ANALYST :** agrégats, drill-down limité aux agrégats, Advanced autorisé, exports pseudonymisés.
- **EVENT_MANAGER :** événements assignés, drill-down autorisé sur ces événements.
- **OWNER/ADMIN :** périmètre complet de l'organisation.
- Aucun endpoint analytique ne retourne d'email, téléphone, nom ou identifiant participant nominatif.
- Les KPI respectent les formules de `KPI_DEFINITIONS.md` ; l'API ne crée aucune variante.
- Les réponses sont cohérentes avec les événements diffusés par Socket.IO (mêmes calculs serveur).

**Paramètres communs :**

| Paramètre | Description |
|---|---|
| `from`, `to` | Période semi-ouverte `[from, to)` |
| `eventIds` | Un ou plusieurs événements |
| `eventType` | Type d'événement |
| `compareWith` | Fenêtre de comparaison de même longueur |
| `granularity` | `day`, `week`, `month` |

**Réponse conceptuelle :**

```json
{
  "data": {
    "period": { "from": "2026-01-01T00:00:00.000Z", "to": "2026-02-01T00:00:00.000Z" },
    "kpis": [
      {
        "code": "REG-001",
        "value": 1240,
        "unit": "count",
        "status": "OK",
        "comparison": { "value": 1180, "delta": 5.08 }
      },
      {
        "code": "CHK-004",
        "value": null,
        "unit": "percent",
        "status": "N_A",
        "reason": "NO_ELIGIBLE_REGISTRATIONS"
      }
    ]
  }
}
```

`N_A` est distinct de `0` et expose toujours un motif borné.

---

## 17. Endpoints — Audit

| Méthode | Chemin | Description | O | A | EM | AN | V |
|---|---|---|---|---|---|---|---|
| GET | `/audit-logs` | Journal d'audit | ✓ | ✓ | — | — | — |
| GET | `/audit-logs/{auditLogId}` | Entrée détaillée | ✓ | ✓ | — | — | — |

**Filtres :** `category`, `actorUserId`, `actionType`, `resourceType`, `resourceId`, `result`, `from`, `to`.
**Tri :** `createdAt` descendant uniquement.
**Restrictions :**

- Aucun accès pour EVENT_MANAGER, ANALYST, VIEWER.
- Aucune écriture via API : le journal est produit par les services.
- `metadata` est borné et ne contient ni secret ni PII brute.
- L'export d'audit est une capacité Should non exposée en v1.

---

## 18. Endpoints — Santé

| Méthode | Chemin | Accès | Description |
|---|---|---|---|
| GET | `/health` | Public | Vivacité : `{ "status": "ok" }` |
| GET | `/health/ready` | Interne | État opérationnel : `status: "degraded"` et capacité `passwordResetEmail` |

`/health/ready` renvoie 200 pour ne pas retirer le trafic ; il signale les capacités volontairement absentes sans exposer de secret. Les sondes PostgreSQL/Redis restent à brancher (dette documentée).

Aucune information de version détaillée ni de configuration n'est exposée publiquement.

---

## 19. Matrice synthétique des rôles

Légende : `✓` autorisé, `—` interdit, `◐` restreint (portée assignée, agrégats, pseudonymisation ou lecture seule), `PK` API key.

| Domaine | O | A | EM | AN | V |
|---|---|---|---|---|---|
| Organisations — lecture | ✓ | ✓ | ✓ | ✓ | ✓ |
| Organisations — paramètres | ✓ | ◐ | — | — | — |
| Memberships / invitations | ✓ | ◐ | — | — | — |
| Clés API | ✓ | ✓ | — | — | — |
| Événements — lecture | ✓ | ✓ | ◐ | ◐ | ◐ |
| Événements — écriture | ✓ | ✓ | ◐ | — | — |
| Événements — suppression | ✓ | ✓ | — | — | — |
| Billets — écriture | ✓ | ✓ | ◐ | — | — |
| Billets — suppression | ✓ | ✓ | — | — | — |
| Participants — PII | ✓ | ✓ | ◐ | — | — |
| Participants — fusion/anonymisation/effacement | ✓ | ✓ | — | — | — |
| Inscriptions — PII | ✓ | ✓ | ◐ | — | — |
| Inscriptions — suppression | ✓ | ✓ | — | — | — |
| Transactions — détail | ✓ | ✓ | ◐ | — | — |
| Remboursements | ✓ | ✓ | ◐ | — | — |
| Check-ins — détail et saisie | ✓ | ✓ | ◐ | — | — |
| Check-ins — suppression | — | — | — | — | — |
| Exposants/stands — détail | ✓ | ✓ | ◐ | — | — |
| Exposants/stands — suppression | ✓ | ✓ | — | — | — |
| Imports | ✓ | ✓ | ◐ | — | — |
| Ingestion machine | PK | PK | PK | — | — |
| Dashboards analytiques | ✓ | ✓ | ✓ | ✓ | ✓ |
| Drill-down détaillé | ✓ | ✓ | ◐ | ◐ | — |
| Advanced Analytics | ✓ | — | — | ✓ | — |
| Rapports prédéfinis | ✓ | ✓ | ✓ | ✓ | — |
| Exports | ✓ | ✓ | ◐ | ◐ | — |
| Audit | ✓ | ✓ | — | — | — |

**Règles transverses :**

- Le rôle OWNER n'est jamais attribuable par un ADMIN.
- La portée EVENT_MANAGER est toujours limitée aux événements assignés.
- VIEWER ne reçoit jamais de PII, d'export, ni d'écriture.
- Un accès hors tenant est un 404.
- Les permissions sont vérifiées côté serveur, jamais uniquement côté frontend.

---

## 20. Idempotence et concurrence

| Opération | Mécanisme |
|---|---|
| Import | Hash déterministe serveur + `Idempotency-Key` optionnel ; unicité `(organizationId, idempotencyKey)` |
| Export | `Idempotency-Key` optionnel ; vérification d'un job identique en cours |
| Transaction | Contrainte d'unicité par inscription/réservation ; 409 en cas de doublon |
| Check-in | Index partiel VALID ; 409 en cas de doublon |
| Réservation de stand | Index partiel ACTIVE ; 409 en cas de course |
| Remboursement | Verrou de ligne + plafond ; 422 si dépassement |

Pas de verrouillage optimiste généralisé (`ETag`/`If-Match`) en v1. Les conflits rares sont traités par contraintes et verrous ciblés.

---

## 21. OpenAPI

### 21.1 Structure

```
openapi/
  openapi.yaml            // document racine assemblé
  paths/
    auth.yaml
    organizations.yaml
    events.yaml
    participants.yaml
    registrations.yaml
    finance.yaml
    checkins.yaml
    exhibitors.yaml
    imports.yaml
    exports.yaml
    analytics.yaml
    audit.yaml
  components/
    schemas/
    parameters/
    responses/
    securitySchemes.yaml
```

Le document est produit depuis un registre `zod-to-openapi` afin d'éviter la dérive entre validation et documentation. En Phase 3, seule la structure est définie ; aucun schéma exécutable n'est généré.

### 21.2 Conventions OpenAPI

- `openapi: 3.1`.
- `servers: [{ url: https://api.eventpulse.dev/api/v1 }]`.
- `securitySchemes` : `bearerAuth` (JWT) et `apiKeyAuth` (`X-API-Key`).
- Tags par module.
- Chaque opération documente : résumé, description, rôles autorisés (`x-roles`), paramètres, réponses, codes d'erreur métier, exemples.
- Les erreurs réutilisent les composants `ProblemDetails`, `ValidationProblem`, `ConflictProblem`.
- Les montants utilisent `type: string`, `pattern: '^-?\\d+\\.\\d{2}$'`.
- Les dates utilisent `format: date-time`.
- `410` est documenté uniquement sur le téléchargement d'export.
- `202` est documenté sur imports et exports.

### 21.3 Extensions

| Extension | Usage |
|---|---|
| `x-roles` | Rôles autorisés |
| `x-scope` | Portée EVENT_MANAGER / organisation |
| `x-pii` | Présence de données personnelles |
| `x-idempotent` | Opération idempotente |
| `x-audit-category` | Catégorie d'audit |

---

## 22. Traçabilité

| Contrat | Source |
|---|---|
| Matrice des rôles | PRD Annexe A, Q-09 |
| Viewer Revenue read-only | Arbitrage utilisateur post-Phase 2 |
| Événements `ARCHIVED` | BR-EVT-001, PRD Annexe B |
| Périodes `[from, to)` | KPI_DEFINITIONS, BR-KPI-002 |
| 5 rapports nommés | PRD §24, Q-09 |
| Export 410 | Q-14, BR-EXP-002 |
| Imports 202 et idempotence | BR-IMP-004, Q-06 |
| Check-ins append-only | BR-CHK-006 |
| 24 KPI | KPI_DEFINITIONS |
| Audit 6 catégories | PRD §18.3 |

---

## 23. Points ouverts

- Politique exacte de réponse pour un check-in hors fenêtre : enregistrement `INVALID` vs refus immédiat selon le canal.
- Limite de lot des endpoints d'ingestion : valeur cible à figer (1 000 lignes proposées).
- Filtres avancés autorisés au VIEWER dans la comparaison : périmètre exact à préciser.
- Endpoint d'annulation d'export : non exposé en v1.
- Export d'audit : Should, non exposé en v1.

---

*Fin de API_DESIGN.md — Version 1.0.*
