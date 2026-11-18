# KPI_DEFINITIONS.md — EventPulse Analytics

**Version :** 1.0 — Phase 1

**Statut :** Finalisé et validé — cohérent avec le PRD v1.1 et `BUSINESS_RULES.md`

**Date :** 2026-11-18

**Langue :** Français (identifiants et enums en anglais)

---

## 0. Conventions communes

### 0.1 Portée (scope)
Tout KPI est calculé dans la portée :
- **organisation active** (obligatoire) ;
- **événement(s)** (optionnel ; un ou plusieurs) ;
- **période** `[from, to)` (optionnel ; bornes demi-ouvertes, début inclus, fin exclue).

Les bornes de période sont calculées dans le fuseau de l'organisation ou de l'événement, puis converties en UTC.

### 0.2 Inclusion des événements
| Statut | Performance courante | Analyse historique | Vue dédiée |
|---|---|---|---|
| `DRAFT` | Exclu | Exclu | Brouillons |
| `PUBLISHED` | Inclus | Inclus | — |
| `ONGOING` | Inclus | Inclus | — |
| `COMPLETED` | Inclus | Inclus | — |
| `ARCHIVED` | Exclu par défaut | Inclus | Archives |
| `CANCELLED` | Exclu | Exclu | Annulés |

### 0.3 Dates de référence
| Activité | Date utilisée |
|---|---|
| Inscription | `registered_at` |
| Check-in | `checked_in_at` |
| Paiement | `paid_at` |
| Remboursement | `refunded_at` |
| Réservation de stand | `reserved_at` |

Aucun KPI n'utilise la date de début d'événement par défaut.

### 0.4 Règles de calcul communes
- Aucun arrondi intermédiaire ; arrondi final à 2 décimales pour les pourcentages et les montants EUR.
- Devise unique : EUR. Aucun KPI multi-devises en V1.
- Ne jamais utiliser l'email comme clé de décompte : l'identité interne du participant fait foi.
- Un enregistrement annulé logiquement (`deleted_at` non nul) est exclu.
- Aucun double comptage : voir §0.6.

### 0.5 Absence de données, zéro et N/A
- **N/A** : aucune donnée source pertinente dans le scope, ou dénominateur nul.
- **0** : valeur réelle calculée alors que des données source existent (ex. 0 remboursement avec des paiements).
- Une valeur inconnue n'est jamais convertie en 0 ; elle est exclue des dénominateurs et signalée « non renseigné ».
- « N/A » n'est jamais affiché comme 0 et inversement.

### 0.6 Anti-double comptage
- `Gross Revenue = Ticket Revenue + Booth Revenue` : chaque transaction est comptée une seule fois, dans un seul type.
- Les remboursements ne réduisent jamais le Gross ; ils sont soustraits une seule fois dans le Net.
- Les participants uniques sont décomptés par identité interne.
- Dans un agrégat multi-événements, les taux de présence utilisent des **paires participant-événement** : un participant présent à deux événements compte deux fois dans l'agrégat (choix documenté).
- Un stand ne compte qu'une fois par réservation active.

### 0.7 Portée des taux de cohorte
Les taux **Attendance Rate** et **No-Show Rate** sont des taux de cohorte **event-scoped** : le dénominateur est la population des inscriptions confirmées de l'événement, le numérateur la population des participants effectivement présents. Ils ne sont pas recalculés sur une période glissante, afin d'éviter de comparer deux populations différentes. Le filtre de période sélectionne les événements inclus, pas les individus.

---

## 1. Catalogue synthétique

| ID | KPI | Unité | Formule courte |
|---|---|---|---|
| KPI-REG-001 | Confirmed Registrations | count | inscriptions `CONFIRMED` créées dans la période |
| KPI-REG-002 | Registration Confirmation Rate | % | `CONFIRMED / (PENDING + CONFIRMED) × 100` |
| KPI-PAR-001 | Unique Participants | count | participants distincts avec ≥ 1 inscription non annulée |
| KPI-CHK-001 | Valid Check-ins | count | check-ins `VALID` dans la période |
| KPI-CHK-002 | Attendance Rate | % | participants présents / participants confirmés (event-scoped) |
| KPI-CHK-003 | No-Show Rate | % | `100 − Attendance Rate` (event-scoped) |
| KPI-CHK-004 | Invalid Check-ins | count | check-ins `INVALID` par motif |
| KPI-CHK-005 | Unique Attendees | count | participants distincts avec ≥ 1 check-in `VALID` |
| KPI-PAR-002 | Returning Attendee Rate | % | présents déjà présents à un événement antérieur / présents |
| KPI-REV-001 | Ticket Revenue | EUR | somme des transactions `TICKET` ayant atteint `PAID` |
| KPI-REV-002 | Booth Revenue | EUR | somme des transactions `BOOTH` ayant atteint `PAID` |
| KPI-REV-003 | Gross Revenue | EUR | `Ticket Revenue + Booth Revenue` |
| KPI-REV-004 | Total Refunds | EUR | somme des remboursements |
| KPI-REV-005 | Net Revenue | EUR | `Gross Revenue − Total Refunds` |
| KPI-REV-006 | Paid Tickets | count | transactions `TICKET` ayant atteint `PAID` |
| KPI-REV-007 | Average Ticket Value | EUR | `Ticket Revenue / Paid Tickets` |
| KPI-REV-008 | Transactions by Status | count / EUR | répartition des transactions par statut |
| KPI-EXH-001 | Total Exhibitors | count | exposants distincts avec ≥ 1 réservation active |
| KPI-EXH-002 | Stands Booked | count | stands distincts avec réservation active |
| KPI-EXH-003 | Stand Booking Value | EUR | somme des prix de réservation renseignés |
| KPI-EXH-004 | Stand Occupancy Rate | % | stands réservés / stands réservables |
| KPI-AUD-001 | Demographic Distribution | % | répartition par âge/genre sur valeurs connues |
| KPI-AUD-002 | Geographic Distribution | % | répartition pays/région/ville sur valeurs connues |
| KPI-AUD-003 | Registration Source Distribution | % | répartition des inscriptions non annulées par source |

---

## 2. KPI d'inscriptions et de participants

### KPI-REG-001 — Confirmed Registrations
- **Objectif métier :** mesurer le volume d'inscriptions confirmées.
- **Définition :** nombre d'inscriptions au statut `CONFIRMED`, créées dans la période et rattachées à des événements inclus.
- **Formule :** `COUNT(registrations WHERE status = CONFIRMED AND registered_at ∈ [from, to) AND event inclus)`.
- **Sources :** `registrations.status`, `registrations.registered_at`, `registrations.event_id`, `events.status`.
- **Filtres :** événement, type d'événement, billet, source.
- **Période :** `registered_at`.
- **Inclusion/exclusion :** `DRAFT` et `CANCELLED` exclus ; `ARCHIVED` inclus en analyse historique ; inscriptions `deleted_at` exclues.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucune inscription n'existe dans le scope ; sinon 0 est une valeur valide.
- **Limites :** compte des inscriptions, pas des participants uniques ; un participant peut avoir plusieurs inscriptions.
- **Exemple :** 300 inscriptions `CONFIRMED` sur 500 inscriptions créées sur la période.
- **Règles :** BR-KPI-001, BR-KPI-003, BR-REG-002.

### KPI-REG-002 — Registration Confirmation Rate
- **Objectif métier :** mesurer la part d'inscriptions confirmées parmi les inscriptions actives.
- **Définition :** ratio des inscriptions `CONFIRMED` sur la somme des `PENDING` et `CONFIRMED`.
- **Formule :** `CONFIRMED / (PENDING + CONFIRMED) × 100`.
- **Sources :** `registrations.status`, `registrations.registered_at`.
- **Filtres :** événement, type, billet, source.
- **Période :** `registered_at`.
- **Inclusion/exclusion :** `CANCELLED` et `WAITLISTED` exclus du calcul ; `DRAFT`/`CANCELLED` (événements) exclus.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si le dénominateur est nul.
- **Limites :** ce n'est pas un `Conversion Rate` ; ne mesure ni la présence ni le paiement.
- **Exemple :** 300 `CONFIRMED`, 100 `PENDING` → `300 / 400 × 100 = 75 %`.
- **Règles :** Q-01, BR-KPI-002.

### KPI-PAR-001 — Unique Participants
- **Objectif métier :** mesurer le nombre de personnes distinctes inscrites.
- **Définition :** participants distincts (identité interne) ayant au moins une inscription non annulée créée dans la période.
- **Formule :** `COUNT(DISTINCT participant_id WHERE registration.status ∈ {PENDING, CONFIRMED, WAITLISTED} AND registered_at ∈ [from, to))`.
- **Sources :** `registrations.participant_id`, `registrations.status`, `registrations.registered_at`.
- **Filtres :** événement, type, billet, source, segment participant.
- **Période :** `registered_at`.
- **Inclusion/exclusion :** inscriptions `CANCELLED` et soft-deleted exclues.
- **Valeurs nulles :** aucun.
- **N/A :** N/A si aucune inscription dans le scope.
- **Limites :** participants inscrits, pas présents ; l'email n'est jamais utilisé ; un participant multi-inscriptions n'est compté qu'une fois par scope.
- **Exemple :** 500 inscriptions non annulées portées par 270 participants distincts → 270.
- **Règles :** H-02, BR-PAR-001, BR-KPI-005.

---

## 3. KPI de présence

### KPI-CHK-001 — Valid Check-ins
- **Objectif métier :** mesurer le volume de check-ins valides.
- **Définition :** nombre d'opérations de check-in au statut `VALID`, effectuées dans la période, sur événements inclus.
- **Formule :** `COUNT(check_ins WHERE status = VALID AND checked_in_at ∈ [from, to) AND event inclus)`.
- **Sources :** `check_ins.status`, `check_ins.checked_in_at`, `events.status`.
- **Filtres :** événement, type, source de check-in.
- **Période :** `checked_in_at`.
- **Inclusion/exclusion :** événements `DRAFT`/`CANCELLED` exclus ; `ARCHIVED` inclus en historique.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucun check-in n'existe dans le scope ; sinon 0 est valide.
- **Limites :** compte des opérations, pas des participants uniques ; un participant peut avoir des check-ins valides sur plusieurs événements.
- **Exemple :** 210 check-ins `VALID`.
- **Règles :** Q-08, BR-CHK-001 à BR-CHK-005.

### KPI-CHK-002 — Attendance Rate
- **Objectif métier :** mesurer la part de participants confirmés effectivement présents.
- **Définition :** taux de cohorte event-scoped.
- **Formule :** `participants distincts avec ≥ 1 check-in VALID pour l'événement / participants distincts avec ≥ 1 inscription CONFIRMED pour l'événement × 100`.
- **Sources :** `check_ins` (`VALID`, `participant_id`, `event_id`), `registrations` (`CONFIRMED`, `participant_id`, `event_id`).
- **Filtres :** événement ; type ; source de check-in.
- **Période :** aucune au niveau individuel (cohorte de l'événement). En vue multi-événements, le filtre de période sélectionne les événements inclus.
- **Inclusion/exclusion :** événements `DRAFT`/`CANCELLED` exclus ; `ARCHIVED` inclus en historique ; un participant avec plusieurs inscriptions confirmées ne compte qu'une fois.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucun participant confirmé dans le scope.
- **Limites :** taux de cohorte, non comparable à un taux de présence calculé sur une période glissante ; en agrégat multi-événements, un participant présent à deux événements compte deux fois (paires participant-événement).
- **Exemple :** 300 participants confirmés, 210 participants présents → `210 / 300 × 100 = 70 %`.
- **Règles :** Q-13.2, BR-CHK-003, BR-KPI-005.

### KPI-CHK-003 — No-Show Rate
- **Objectif métier :** mesurer la part de confirmés non présents.
- **Définition :** complément de l'Attendance Rate, event-scoped.
- **Formule :** `(participants confirmés − participants présents) / participants confirmés × 100`, ou `100 − Attendance Rate`.
- **Sources :** identiques à KPI-CHK-002.
- **Filtres :** événement ; type.
- **Période :** cohorte event-scoped ; filtre de période sur les événements inclus.
- **Inclusion/exclusion :** identiques à KPI-CHK-002 ; un participant confirmé sans check-in est no-show.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucun participant confirmé.
- **Limites :** ne distingue pas les absences justifiées ; un check-in `INVALID` ne vaut pas présence.
- **Exemple :** 300 confirmés, 210 présents → `90 / 300 × 100 = 30 %`.
- **Règles :** BR-CHK-003, BR-KPI-005.

### KPI-CHK-004 — Invalid Check-ins
- **Objectif métier :** mesurer et expliquer les rejets de check-in.
- **Définition :** nombre d'opérations `INVALID`, par motif, dans la période.
- **Formule :** `COUNT(check_ins WHERE status = INVALID AND checked_in_at ∈ période)`, groupé par `reason`.
- **Sources :** `check_ins.status`, `check_ins.reason`, `check_ins.checked_in_at`.
- **Filtres :** événement, motif, source.
- **Période :** `checked_in_at`.
- **Inclusion/exclusion :** événements selon §0.2.
- **Valeurs nulles :** un motif sans occurrence vaut 0 si des check-ins existent.
- **N/A :** N/A si aucun check-in dans le scope.
- **Limites :** un check-in invalide n'alimente jamais la présence ; plusieurs tentatives invalides sont comptées séparément.
- **Exemple :** 18 invalides : 6 `OUTSIDE_WINDOW`, 5 `DUPLICATE`, 4 `REGISTRATION_NOT_CONFIRMED`, 3 `REGISTRATION_CANCELLED`.
- **Règles :** BR-CHK-004.

### KPI-CHK-005 — Unique Attendees
- **Objectif métier :** mesurer le nombre de personnes distinctes présentes.
- **Définition :** participants distincts avec au moins un check-in `VALID` dans la période.
- **Formule :** `COUNT(DISTINCT participant_id WHERE check_in.status = VALID AND checked_in_at ∈ période)`.
- **Sources :** `check_ins.participant_id`, `check_ins.status`, `check_ins.checked_in_at`.
- **Filtres :** événement, type.
- **Période :** `checked_in_at`.
- **Inclusion/exclusion :** événements selon §0.2.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucun check-in dans le scope.
- **Limites :** un participant présent à plusieurs événements de la période n'est compté qu'une fois dans l'agrégat org-wide, mais une fois par événement en vue event-scoped.
- **Exemple :** 210 participants distincts présents.
- **Règles :** BR-CHK-005, BR-KPI-005.

### KPI-PAR-002 — Returning Attendee Rate
- **Objectif métier :** mesurer la fidélité des participants entre événements.
- **Définition :** part des présents du scope qui avaient déjà assisté à un **autre événement** antérieur.
- **Formule :** `présents du scope avec ≥ 1 check-in VALID sur un autre événement avant le début du scope / présents distincts du scope × 100`.
- **Sources :** `check_ins` (`participant_id`, `event_id`, `status`, `checked_in_at`), `events` (dates, statut).
- **Filtres :** événement(s), type, période.
- **Période :** check-ins du scope courant ; antériorité = date de check-in strictement antérieure au début du scope (début d'événement en mode événement, début de période en mode org).
- **Inclusion/exclusion :** seuls les check-ins `VALID` sur événements inclus ; le même événement ne compte pas comme antériorité.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucun présent dans le scope.
- **Limites :** dépend de l'identité interne ; un participant fusionné est compté sur l'identité conservée ; les événements antérieurs doivent être inclus dans les données.
- **Exemple :** 210 présents, dont 60 ayant déjà assisté à un autre événement → `60 / 210 × 100 = 28,57 %`.
- **Règles :** H-02, BR-PAR-001, BR-KPI-005.

---

## 4. KPI financiers

### KPI-REV-001 — Ticket Revenue
- **Objectif métier :** mesurer les revenus des billets.
- **Définition :** somme des montants originaux des transactions `TICKET` ayant atteint `PAID`, dont la date de paiement est dans la période.
- **Formule :** `SUM(amount WHERE type = TICKET AND paid_at IS NOT NULL AND paid_at ∈ période)`.
- **Sources :** `transactions.type`, `transactions.amount`, `transactions.paid_at`, `transactions.status`.
- **Filtres :** événement, billet, période.
- **Période :** `paid_at`.
- **Inclusion/exclusion :** transactions `PARTIALLY_REFUNDED` et `REFUNDED` incluses (elles ont atteint `PAID`) ; `PENDING`, `FAILED`, `CANCELLED` exclues ; événements selon §0.2.
- **Valeurs nulles :** aucune.
- **N/A :** N/A s'il n'existe aucune transaction `TICKET` dans le scope ; sinon 0 est valide.
- **Limites :** montant brut, non net de remboursements ; aucun double comptage avec Booth.
- **Exemple :** 220 transactions `TICKET` payées à 100 € → 22 000 €.
- **Règles :** Q-04, Q-05, BR-PAY-003.

### KPI-REV-002 — Booth Revenue
- **Objectif métier :** mesurer les revenus des stands.
- **Définition :** somme des montants originaux des transactions `BOOTH` ayant atteint `PAID`, dont la date de paiement est dans la période.
- **Formule :** `SUM(amount WHERE type = BOOTH AND paid_at IS NOT NULL AND paid_at ∈ période)`.
- **Sources :** `transactions`, `stand_reservations`.
- **Filtres :** événement, zone de stand, période.
- **Période :** `paid_at`.
- **Inclusion/exclusion :** mêmes règles que KPI-REV-001.
- **Valeurs nulles :** aucune.
- **N/A :** N/A s'il n'existe aucune transaction `BOOTH` dans le scope ; sinon 0 est valide.
- **Limites :** uniquement les montants effectivement enregistrés ; une réservation sans prix ne crée pas de revenu.
- **Exemple :** 20 transactions `BOOTH` payées à 1 000 € → 20 000 €.
- **Règles :** Q-05, BR-EXH-005.

### KPI-REV-003 — Gross Revenue
- **Objectif métier :** mesurer le revenu brut avant remboursements.
- **Définition :** somme des montants originaux de toutes les transactions ayant atteint `PAID`.
- **Formule :** `Ticket Revenue + Booth Revenue`.
- **Sources :** `transactions`.
- **Filtres :** événement, type, période.
- **Période :** `paid_at`.
- **Inclusion/exclusion :** transactions remboursées incluses ; `PENDING`, `FAILED`, `CANCELLED` exclues.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucune transaction `PAID` ni aucune transaction source dans le scope.
- **Limites :** ne diminue jamais après remboursement ; ne doit pas être confondu avec le Net.
- **Exemple :** 22 000 € + 20 000 € = 42 000 €.
- **Règles :** Q-04, H-03, BR-PAY-003.

### KPI-REV-004 — Total Refunds
- **Objectif métier :** mesurer les sommes remboursées.
- **Définition :** somme des remboursements enregistrés dans la période, rattachés à des transactions du scope.
- **Formule :** `SUM(refunds.amount WHERE refunded_at ∈ période AND transaction.event ∈ scope)`.
- **Sources :** `refunds.amount`, `refunds.refunded_at`, `refunds.transaction_id`, `transactions.event_id`.
- **Filtres :** événement, type de transaction d'origine, période.
- **Période :** `refunded_at`.
- **Inclusion/exclusion :** tous les remboursements valides ; cumul ≤ montant payé garanti par BR-PAY-002.
- **Valeurs nulles :** 0 est valide si des transactions existent et qu'aucun remboursement n'est enregistré.
- **N/A :** N/A si aucune transaction source dans le scope.
- **Limites :** filtré sur la date de remboursement ; peut concerner des transactions payées avant la période.
- **Exemple :** 3 000 € remboursés.
- **Règles :** Q-04, BR-PAY-002, BR-PAY-004.

### KPI-REV-005 — Net Revenue
- **Objectif métier :** mesurer le revenu net de remboursements.
- **Définition :** Gross Revenue diminué du Total Refunds.
- **Formule :** `Gross Revenue − Total Refunds`.
- **Sources :** `transactions`, `refunds`.
- **Filtres :** événement, type, période.
- **Période :** `paid_at` pour le Gross, `refunded_at` pour les remboursements.
- **Inclusion/exclusion :** identiques aux deux composantes.
- **Valeurs nulles :** aucune.
- **N/A :** N/A uniquement si Gross Revenue est N/A.
- **Limites :** peut être négatif sur une période (remboursements supérieurs aux paiements de la période) ; aucun plancher artificiel.
- **Exemple :** 42 000 € − 3 000 € = 39 000 €.
- **Règles :** Q-04, BR-PAY-006.

### KPI-REV-006 — Paid Tickets
- **Objectif métier :** mesurer le nombre de billets effectivement payés.
- **Définition :** nombre de transactions `TICKET` ayant atteint `PAID` dans la période.
- **Formule :** `COUNT(transactions WHERE type = TICKET AND paid_at ∈ période)`.
- **Sources :** `transactions`.
- **Filtres :** événement, billet, période.
- **Période :** `paid_at`.
- **Inclusion/exclusion :** transactions remboursées incluses (base brute).
- **Valeurs nulles :** aucune.
- **N/A :** N/A si aucune transaction `TICKET` dans le scope ; sinon 0 est valide.
- **Limites :** une inscription = un billet = une transaction en V1 ; pas de notion de quantité multiple par transaction.
- **Exemple :** 220.
- **Règles :** BR-REG-001, BR-PAY-003.

### KPI-REV-007 — Average Ticket Value
- **Objectif métier :** mesurer le panier moyen par billet payé.
- **Définition :** revenu moyen d'un billet payé, sur base brute.
- **Formule :** `Ticket Revenue / Paid Tickets`.
- **Sources :** KPI-REV-001, KPI-REV-006.
- **Filtres :** événement, billet, période.
- **Période :** `paid_at`.
- **Inclusion/exclusion :** transactions remboursées incluses dans le numérateur et le dénominateur.
- **Valeurs nulles :** aucune.
- **N/A :** N/A si Paid Tickets = 0.
- **Limites :** indicateur brut ; ne reflète pas les remboursements.
- **Exemple :** 22 000 € / 220 = 100 €.
- **Règles :** BR-PAY-003.

### KPI-REV-008 — Transactions by Status
- **Objectif métier :** comprendre la répartition des transactions.
- **Définition :** nombre et montant des transactions par statut, dans la période.
- **Formule :** `COUNT(*)` et `SUM(amount)` groupés par `status`.
- **Sources :** `transactions`.
- **Filtres :** événement, type, période.
- **Période :** `created_at` de la transaction (date de création, homogène pour tous les statuts).
- **Inclusion/exclusion :** événements selon §0.2.
- **Valeurs nulles :** un statut sans occurrence vaut 0 si des transactions existent.
- **N/A :** N/A si aucune transaction dans le scope.
- **Limites :** indicateur de répartition, pas un revenu ; ne pas additionner les montants de statuts distincts comme un revenu.
- **Exemple :** 220 `PAID`, 40 `PENDING`, 20 `CANCELLED`, 20 `REFUNDED`.
- **Règles :** Q-04, BR-PAY-001.

---

## 5. KPI exposants et stands

### KPI-EXH-001 — Total Exhibitors
- **Objectif métier :** mesurer le nombre d'exposants actifs.
- **Définition :** exposants distincts ayant au moins une réservation `ACTIVE` sur les événements inclus.
- **Formule :** `COUNT(DISTINCT exhibitor_id WHERE reservation.status = ACTIVE AND event inclus)`. Si un filtre de période est appliqué : `reserved_at ∈ période`.
- **Sources :** `stand_reservations.exhibitor_id`, `stand_reservations.status`, `events.status`.
- **Filtres :** événement, type, période.
- **Période :** snapshot courant sans filtre ; `reserved_at` si filtre explicite.
- **Inclusion/exclusion :** réservations actives uniquement ; événements selon §0.2.
- **Valeurs nulles :** aucun.
- **N/A :** N/A si l'événement n'a aucun stand.
- **Limites :** un exposant avec plusieurs stands ne compte qu'une fois ; un exposant sans réservation n'apparaît pas.
- **Exemple :** 45 exposants avec au moins un stand actif.
- **Règles :** BR-EXH-001.

### KPI-EXH-002 — Stands Booked
- **Objectif métier :** mesurer le nombre de stands réservés.
- **Définition :** stands distincts ayant une réservation `ACTIVE` sur les événements inclus.
- **Formule :** `COUNT(DISTINCT stand_id WHERE reservation.status = ACTIVE AND event inclus)`. Si période : `reserved_at ∈ période`.
- **Sources :** `stand_reservations`, `stands`.
- **Filtres :** événement, zone, période.
- **Période :** snapshot courant ; `reserved_at` si filtre.
- **Inclusion/exclusion :** une seule réservation active par stand/événement.
- **Valeurs nulles :** aucun.
- **N/A :** N/A si l'événement n'a aucun stand.
- **Limites :** ne compte pas les stands disponibles ; ne compte pas deux fois un stand.
- **Exemple :** 55 stands réservés.
- **Règles :** BR-EXH-003.

### KPI-EXH-003 — Stand Booking Value
- **Objectif métier :** mesurer la valeur des réservations de stands.
- **Définition :** somme des prix de réservation renseignés pour les réservations actives.
- **Formule :** `SUM(price_amount WHERE reservation.status = ACTIVE AND price_amount IS NOT NULL)`.
- **Sources :** `stand_reservations.price_amount`, `stand_reservations.status`.
- **Filtres :** événement, zone, période.
- **Période :** snapshot courant ; `reserved_at` si filtre.
- **Inclusion/exclusion :** seules les réservations actives ; montants non renseignés exclus de la somme mais signalés.
- **Valeurs nulles :** les null ne sont jamais convertis en 0.
- **N/A :** N/A si aucune réservation active ne possède de prix renseigné.
- **Limites :** valeur partielle si certaines réservations n'ont pas de prix ; afficher la couverture (« X réservations sur Y valorisées »).
- **Exemple :** 40 réservations valorisées à 1 000 € = 40 000 €, sur 55 réservations actives → valeur partielle, 15 non valorisées.
- **Règles :** BR-EXH-005.

### KPI-EXH-004 — Stand Occupancy Rate
- **Objectif métier :** mesurer l'occupation des stands réservables.
- **Définition :** part des stands réservés parmi les stands réservables.
- **Formule :** `stands avec réservation ACTIVE / (total stands − stands UNAVAILABLE) × 100`.
- **Sources :** `stands.status`, `stand_reservations.status`.
- **Filtres :** événement, zone.
- **Période :** snapshot courant ; filtre de période sur les événements inclus.
- **Inclusion/exclusion :** stands `UNAVAILABLE` exclus du dénominateur ; seules les réservations actives comptent.
- **Valeurs nulles :** aucun.
- **N/A :** N/A si le dénominateur est nul.
- **Limites :** event-scoped ; en agrégat, sommer les numérateurs et dénominateurs par événement.
- **Exemple :** 100 stands, 10 indisponibles, 55 réservés → `55 / 90 × 100 = 61,11 %`.
- **Règles :** BR-EXH-004, BR-KPI-006.

---

## 6. KPI d'audience

### KPI-AUD-001 — Demographic Distribution
- **Objectif métier :** comprendre la composition démographique des participants.
- **Définition :** répartition des participants uniques par tranche d'âge et/ou genre.
- **Formule :** pour chaque modalité, `participants avec modalité connue / participants avec valeur connue pour la dimension × 100`.
- **Sources :** `participants.birth_year`, `participants.gender`, `registrations` (population de base).
- **Filtres :** événement, type, période, dimension.
- **Période :** `registered_at` de l'inscription de référence.
- **Inclusion/exclusion :** participants uniques avec au moins une inscription non annulée ; valeurs inconnues exclues du dénominateur et reportées « non renseigné ».
- **Tranches d'âge :** `< 18`, `18–24`, `25–34`, `35–44`, `45–54`, `55–64`, `65+`, `UNKNOWN` ; âge calculé à la date de référence (début d'événement ou fin de période).
- **Genres :** `FEMALE`, `MALE`, `NON_BINARY`, `UNDISCLOSED`, `UNKNOWN`.
- **Valeurs nulles :** jamais converties en 0 ; exclues du dénominateur.
- **N/A :** N/A si aucun participant ne possède de valeur connue pour la dimension.
- **Limites :** données déclaratives optionnelles ; les pourcentages ne totalisent pas 100 % si des valeurs sont inconnues (elles sont affichées séparément).
- **Exemple :** 200 participants avec âge connu, dont 80 en `25–34` → 40 % des connus ; 70 participants sans âge affichés « non renseigné ».
- **Règles :** BR-PAR-005, BR-ORG-007.

### KPI-AUD-002 — Geographic Distribution
- **Objectif métier :** comprendre la provenance géographique des participants.
- **Définition :** répartition des participants uniques par pays, région ou ville.
- **Formule :** `participants avec modalité connue / participants avec valeur connue pour la dimension × 100`.
- **Sources :** `participants.country`, `participants.region`, `participants.city`, `registrations`.
- **Filtres :** événement, type, période, niveau géographique.
- **Période :** `registered_at`.
- **Inclusion/exclusion :** identiques à KPI-AUD-001 ; valeurs inconnues exclues et reportées.
- **Valeurs nulles :** jamais converties en 0.
- **N/A :** N/A si aucun participant ne possède de valeur connue pour le niveau choisi.
- **Limites :** les libellés géographiques doivent être normalisés ; les participants sans pays sont reportés « non renseigné ».
- **Exemple :** 150 participants avec pays connu, dont 100 en France → 66,67 % des connus.
- **Règles :** BR-PAR-005.

### KPI-AUD-003 — Registration Source Distribution
- **Objectif métier :** comprendre les canaux d'acquisition des inscriptions.
- **Définition :** répartition des inscriptions non annulées par source.
- **Formule :** `inscriptions d'une source / inscriptions avec source connue × 100`.
- **Sources :** `registrations.source`, `registrations.status`, `registrations.registered_at`.
- **Filtres :** événement, type, période, source.
- **Période :** `registered_at`.
- **Inclusion/exclusion :** inscriptions `CANCELLED` exclues ; sources `MANUAL`, `IMPORT`, `INGESTION_API`, `PARTNER`, `OTHER` ; source inconnue exclue du dénominateur et reportée.
- **Valeurs nulles :** source inconnue jamais convertie en 0.
- **N/A :** N/A si aucune inscription avec source connue.
- **Limites :** ne mesure pas les visiteurs du site web, hors périmètre V1 ; `PARTNER` peut nécessiter un détail optionnel.
- **Exemple :** 450 inscriptions non annulées avec source connue, dont 180 `IMPORT` → 40 %.
- **Règles :** BR-IMP-001, BR-KPI-001.

---

## 7. Dimensions et filtres transverses

| Dimension | Valeurs / source | S'applique à |
|---|---|---|
| Organisation | org active | Tous |
| Événement | id, nom | Tous |
| Type d'événement | `EXHIBITION`, `CONFERENCE`, `WORKSHOP`, `TRADE_SHOW`, `OTHER` | Tous |
| Période | `[from, to)` | Selon date d'activité |
| Statut d'événement | §0.2 | Tous |
| Billet | id, nom | Inscriptions, revenus |
| Source d'inscription | enum | Inscriptions, audience |
| Motif de check-in | enum | Check-ins |
| Zone de stand | texte normalisé | Stands |
| Pays / région / ville | champs participant | Audience |
| Tranche d'âge / genre | champs participant | Audience |

---

## 8. Matrice KPI → écrans

| Écran | KPI principaux |
|---|---|
| Overview | KPI-REG-001, KPI-REG-002, KPI-PAR-001, KPI-REV-003 à 005, KPI-EXH-004, KPI-CHK-002 |
| Event Analytics | KPI-REG-001, KPI-REG-002, KPI-CHK-001 à 005, KPI-REV-003, KPI-EXH-004 |
| Revenue Analytics | KPI-REV-001 à 008 |
| Audience Analytics | KPI-PAR-001, KPI-PAR-002, KPI-AUD-001 à 003, KPI-CHK-002/003/005 |
| Exhibitor Analytics | KPI-EXH-001 à 004 |
| Advanced Analytics | Tous, avec filtres avancés |
| Recent Activity | Aucun KPI (flux d'événements métier) |

---

## 9. Tests de référence

Les jeux de données de test doivent couvrir au minimum :

1. Période sans aucune donnée → N/A.
2. Période avec données mais dénominateur nul → N/A pour les taux.
3. Transaction remboursée → Gross stable, Net diminué.
4. Remboursements cumulés égaux au montant payé → statut `REFUNDED`.
5. Participant multi-événements → décompte correct en unique et en paires.
6. Check-in hors fenêtre, doublon, inscription non confirmée, événement annulé.
7. Stand indisponible exclu du dénominateur.
8. Réservation sans prix → valeur partielle, pas 0 €.
9. Valeurs démographiques inconnues exclues des pourcentages.
10. Frontières de période et changement d'heure (DST).

---

*Fin de KPI_DEFINITIONS.md — Version 1.0.*
