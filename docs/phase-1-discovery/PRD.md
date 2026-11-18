# PRD.md — EventPulse Analytics

**Version :** 1.1 — Cadrage V1 validé

**Statut :** Phase 1 — livrable finalisé et validé (matrice action × rôle Q-09 approuvée et liste des 5 rapports confirmée le 2026-11-18)

**Nature :** Projet portfolio — démonstration technique et produit, sans commercialisation en V1

**Date :** 2026-11-18

**Auteur :** Product Management / Business Analysis / Software Architecture / QA

**Langue :** Français (identifiants techniques et code en anglais)

---

## Table des matières

1. [Introduction produit](#1-introduction-produit)
2. [Vision produit](#2-vision-produit)
3. [Contexte métier](#3-contexte-métier)
4. [Problème adressé](#4-problème-adressé)
5. [Objectifs produit](#5-objectifs-produit)
6. [Objectifs business](#6-objectifs-business)
7. [Public cible](#7-public-cible)
8. [Personas](#8-personas)
9. [Rôles et principes d'autorisation](#9-rôles-et-principes-dautorisation)
10. [Vue d'ensemble fonctionnelle](#10-vue-densemble-fonctionnelle)
11. [Modules opérationnels](#11-modules-opérationnels)
12. [Modules analytiques](#12-modules-analytiques)
13. [Reporting, exports et temps réel](#13-reporting-exports-et-temps-réel)
14. [Administration](#14-administration)
15. [Parcours utilisateurs](#15-parcours-utilisateurs)
16. [Exigences non fonctionnelles](#16-exigences-non-fonctionnelles)
17. [Contraintes produit](#17-contraintes-produit)
18. [Règles métier transverses et confidentialité](#18-règles-métier-transverses-et-confidentialité)
19. [Hypothèses et décisions validées](#19-hypothèses-et-décisions-validées)
20. [Dépendances](#20-dépendances)
21. [Critères de succès et de release](#21-critères-de-succès-et-de-release)
22. [Périmètre V1 — MoSCoW](#22-périmètre-v1--moscow)
23. [Hors périmètre et opportunités futures](#23-hors-périmètre-et-opportunités-futures)
24. [Validations et points ouverts](#24-validations-et-points-ouverts)
25. [Annexes](#25-annexes)

---

## 1. Introduction produit

**EventPulse Analytics** est une plateforme SaaS B2B de gestion événementielle et d'analytique destinée aux organisateurs de salons professionnels, d'expositions, de conférences et de workshops.

Contrairement à un tableau de bord en lecture seule, EventPulse est une **application de gestion complète** : elle permet de créer et gérer les événements, participants, inscriptions, billets, paiements, remboursements, check-ins, exposants et stands, puis d'exploiter ces données via des KPI définis de manière explicite, des dashboards, des rapports et des exports.

Le produit apporte trois valeurs :

1. **Centraliser** la donnée opérationnelle de plusieurs événements dans un référentiel unique, isolé par organisation.
2. **Piloter** la performance via des KPI financiers, de fréquentation et d'occupation, calculés de manière auditable.
3. **Décider** grâce à des rapports, des comparaisons inter-événements et des exports exploitables.

---

## 2. Vision produit

> **« Transformer chaque donnée événementielle en décision mesurable, dans un environnement multi-organisation sécurisé et auditable. »**

Quatre piliers :

- **Gestion + Analytique** : un seul produit, pas deux silos.
- **Définitions KPI mathématiquement explicites** : aucun indicateur sans formule, source, période et règle d'inclusion.
- **Multi-tenant réel** : isolation vérifiée en CI, pas seulement déclarative.
- **Pragmatisme** : monolithe modulaire + worker, pas de microservices prématurés.

---

## 3. Contexte métier

Les organisateurs professionnels exploitent des données dispersées entre billetterie, CRM, fichiers Excel, systèmes de badging et outils comptables. Cette dispersion produit :

- une **fragmentation décisionnelle** : les indicateurs financiers, de fréquentation et d'exposants ne sont jamais consolidés ;
- une **opacité des calculs** : chaque service produit ses propres chiffres avec des définitions divergentes ;
- une **absence de comparaison historique fiable** : les événements ne sont pas comparés sur des bases homogènes.

Deux spécificités structurent le secteur :

- **Exposants et stands** : la valorisation de l'occupation ne se réduit pas à la billetterie ;
- **Cycle de vie long** : brouillon, publié, en cours, terminé, archivé, avec des données historiquement auditables.

---

## 4. Problème adressé

**Problème principal :** les organisateurs professionnels ne disposent pas d'une plateforme unique combinant gestion opérationnelle fiable et analytique décisionnelle explicite, sur un périmètre multi-événements et multi-organisations.

| # | Problème | Impact |
|---|---|---|
| P-1 | Données dispersées entre billetterie, CRM et fichiers | Pas de vision consolidée |
| P-2 | Définitions de KPI implicites ou contradictoires | Décisions basées sur des chiffres non comparables |
| P-3 | Absence de séparation claire entre revenus billets et stands | Sous-estimation ou double comptage |
| P-4 | Aucune traçabilité des opérations sensibles | Risque de conformité et d'audit interne |
| P-5 | Absence d'isolation forte entre organisations | Risque de fuite inter-clients |
| P-6 | Comparaison inter-événements impossible faute de périodes et statuts homogènes | Pas d'apprentissage organisationnel |

---

## 5. Objectifs produit

| Réf | Objectif produit | Mesure de réussite |
|---|---|---|
| OP-1 | Gérer les événements, participants, inscriptions, billets, paiements, remboursements, check-ins, exposants et stands | 100 % des entités du périmètre gérables via l'interface et l'API |
| OP-2 | Fournir des KPI non ambigus, reproductibles et auditables | 0 KPI sans formule, source et règle d'inclusion documentées |
| OP-3 | Garantir l'isolation multi-organisation | Tests automatisés cross-org passants en CI |
| OP-4 | Produire 5 rapports prédéfinis paramétrables exportables PDF/Excel/CSV | Exports asynchrones fiables et traçables |
| OP-5 | Tracer les actions sensibles | 100 % des actions des 6 catégories journalisées |
| OP-6 | Permettre un temps réel optionnel sans dépendance obligatoire | Dashboards opérationnels en mode polling sans Socket.IO |

---

## 6. Objectifs business

**Cadre :** EventPulse est un **projet portfolio** destiné à démontrer la maîtrise du produit, du métier et de la stack. Il n'a pas d'objectif de commercialisation en V1 : pas de pricing, de facturation, de go-to-market, de SLA contractuel ni de conformité d'exploitation commerciale. Les objectifs ci-dessous mesurent la qualité de la démonstration, pas une performance de marché.

| Réf | Objectif business | Justification |
|---|---|---|
| OB-1 | Démontrer une compétence Full Stack professionnelle | Auth, RBAC, multi-tenant, gestion métier, analytique, async, exports |
| OB-2 | Produire un référentiel de cadrage réutilisable | PRD, règles, KPI, NFR cohérents |
| OB-3 | Servir de vitrine technique sur la stack cible | React/TS/Vite/Tailwind/shadcn/Recharts + Node/Express/TS + PostgreSQL/Prisma + BullMQ/Redis |
| OB-4 | Atteindre un niveau de rigueur défendable sur les KPI | Différenciation face aux dashboards décoratifs |
| OB-5 | Démontrer la performance sur un jeu de données volumineux | Dataset synthétique reproductible |

---

## 7. Public cible

**Cœur de cible :** organisations professionnelles de taille intermédiaire (10 à 200 collaborateurs) spécialisées dans les salons, congrès, expositions et conférences, gérant plusieurs événements par an.

**Extensions :** organisateurs mono-événement à forte volumétrie ; directions commerciales et financières ; cabinets d'analyse utilisant le rôle Analyst.

**Hors cible V1 :** particuliers, associations sans volumétrie significative, plateformes de billetterie grand public.

---

## 8. Personas

### Persona 1 — Camille, Directrice d'organisation (`OWNER`)
Vision consolidée multi-événements, gouvernance des accès, conformité, pilotage financier. Attend fiabilité des KPI, isolation stricte et délégation contrôlée.

### Persona 2 — Nadia, Responsable administrative (`ADMIN`)
Gestion des utilisateurs, paramètres, exports et opérations sensibles. Attend une matrice de permissions claire, un audit lisible et des exports sécurisés.

### Persona 3 — Karim, Event Manager (`EVENT_MANAGER`)
Pilotage opérationnel des événements assignés : inscriptions, check-ins, paiements, comparaisons. Attend des dashboards événementiels et des exports ciblés.

### Persona 4 — Léa, Analyste (`ANALYST`)
Analyse des tendances et segments sur agrégats. Attend des KPI rigoureux, des filtres avancés et des exports pseudonymisés.

### Persona 5 — Thomas, Lecteur (`VIEWER`)
Consultation autonome des dashboards, sans modification, sans export et sans accès aux données personnelles.

---

## 9. Rôles et principes d'autorisation

| Rôle | Code technique | Responsabilités principales |
|---|---|---|
| Propriétaire | `OWNER` | Gouvernance complète, membres, paramètres sensibles, fusions, accès PII |
| Administrateur | `ADMIN` | Administration opérationnelle : membres, rôles (hors OWNER), exports, audit, paramètres |
| Responsable d'événement | `EVENT_MANAGER` | Gestion des événements assignés et de leurs opérations métier |
| Analyste | `ANALYST` | Analyse sur agrégats, exports pseudonymisés, aucun accès PII brute |
| Lecteur | `VIEWER` | Lecture seule, sans export, sans PII, sans administration |

**Principes structurants :**

- Les permissions sont évaluées **par membership** `(user_id, organization_id, role)`, jamais par rôle global.
- L'organisation active est choisie après authentification ; son changement renouvelle le contexte d'accès.
- Toutes les vérifications sont effectuées **côté backend**, sur chaque endpoint et service métier.
- Le rôle `EVENT_MANAGER` est scopé aux événements qui lui sont assignés.
- L'`ANALYST` ne voit que des agrégats et exports pseudonymisés ; le `VIEWER` n'a ni PII, ni export, ni administration.
- La matrice complète figure en **Annexe A** et a été **approuvée le 2026-11-18 (Q-09)**.

---

## 10. Vue d'ensemble fonctionnelle

Le produit est organisé en **15 modules** répartis en quatre domaines.

| # | Module | Domaine | Priorité |
|---|---|---|---|
| 1 | Événements | Gestion | Must |
| 2 | Participants, inscriptions et billets | Gestion | Must |
| 3 | Paiements et remboursements | Gestion | Must |
| 4 | Check-ins | Gestion | Must |
| 5 | Exposants et stands | Gestion | Must |
| 6 | Ingestion | Gestion | Must (Excel : Should) |
| 7 | Overview Dashboard | Analytique | Must |
| 8 | Event Analytics | Analytique | Must |
| 9 | Revenue Analytics | Analytique | Must |
| 10 | Audience Analytics | Analytique | Must (base) |
| 11 | Exhibitor Analytics | Analytique | Must |
| 12 | Advanced Analytics | Analytique | Should |
| 13 | Reports & Exports | Reporting | Must |
| 14 | Real-time Analytics | Temps réel | Should |
| 15 | Administration | Administration | Must (audit avancé : Should) |

**Sources d'ingestion V1 :** saisie back-office (modules 1 à 5), imports de fichiers (module 6), endpoint d'ingestion simulé authentifié par API key (module 6). Les visiteurs du site web sont hors périmètre et aucun KPI de conversion basé sur ces visiteurs n'existe.

---

## 11. Modules opérationnels

### 11.1 Module 1 — Événements

**Objectif :** gérer le référentiel des événements et leur cycle de vie.

**Utilisateurs cibles :** OWNER, ADMIN, EVENT_MANAGER (assignés), ANALYST et VIEWER en lecture d'agrégats.

**Fonctionnalités :**

- CRUD des événements (nom, type, dates de début/fin, fuseau horaire, lieu, description, fenêtre de check-in).
- Types : `EXHIBITION`, `CONFERENCE`, `WORKSHOP`, `TRADE_SHOW`, `OTHER`.
- Statuts : `DRAFT`, `PUBLISHED`, `ONGOING`, `COMPLETED`, `ARCHIVED`, `CANCELLED`.
- Transitions autorisées (BR-EVT-001) :
  - `DRAFT → PUBLISHED | CANCELLED`
  - `PUBLISHED → ONGOING | CANCELLED`
  - `ONGOING → COMPLETED | CANCELLED`
  - `COMPLETED → ARCHIVED`
  - `CANCELLED` et `ARCHIVED` sont terminaux. Aucune transition inverse ni saut d'étape.
- Publication soumise à validation : nom, type, dates cohérentes (`start < end`), fuseau valide.
- Modification des dates autorisée en `DRAFT` et `PUBLISHED` ; toute modification après publication est journalisée. Dates figées dès `ONGOING`.
- Affectation d'un Event Manager : auto-assignation à la création lorsqu'un Event Manager crée l'événement ; assignation, réassignation et retrait réservés à OWNER/ADMIN.
- Soft delete réservé à OWNER/ADMIN, uniquement pour `DRAFT` et `CANCELLED` (BR-EVT-004).
- Fenêtre de check-in configurable par événement, par offsets en minutes ; valeurs par défaut `-120` et `+120` autour de `start_at` et `end_at`.
- Fuseau horaire : stockage UTC ; affichage selon le fuseau de l'événement, sinon celui de l'organisation.

**Interactions :** création, édition, publication, transitions de statut, assignation, filtres par statut/type/période.

**Cas limites :** transition interdite → refus explicite ; événement sans inscription → dashboards en état vide, pas en erreur ; `DRAFT` et `CANCELLED` exclus des KPI de performance ; `ARCHIVED` inclus dans les analyses historiques.

**Critères d'acceptation (module) :**

1. Une transition non autorisée est rejetée sans modifier l'état.
2. Un `DRAFT` n'apparaît dans aucun KPI de performance.
3. Un événement `COMPLETED` ne peut pas être supprimé.
4. Un Event Manager ne voit et ne modifie que ses événements assignés.
5. La fenêtre de check-in par défaut est bien `[start − 2h, end + 2h]`.

**Règles :** BR-EVT-001 à BR-EVT-006. **Priorité :** Must.

---

### 11.2 Module 2 — Participants, inscriptions et billets

**Objectif :** gérer les personnes, leurs inscriptions et les billets associés.

**Utilisateurs cibles :** OWNER, ADMIN, EVENT_MANAGER (assignés), ANALYST (agrégats), VIEWER (agrégats).

**Fonctionnalités :**

- **Participants** rattachés à une organisation, identifiés par un identifiant interne. Champs principaux : identité, email, téléphone optionnel, pays/région/ville optionnels, année de naissance optionnelle, genre optionnel.
- L'email n'est **pas** une clé d'identité unique ; sa normalisation sert uniquement à proposer des correspondances.
- **Fusion manuelle** de participants réservée à OWNER/ADMIN, complète et traçable (Annexe D.1).
- **Billets** propres à un événement : nom, prix, devise EUR. Pas de gestion de stock ni de quotas en V1.
- **Inscription** = un participant + un billet + un événement. Statuts : `PENDING`, `CONFIRMED`, `CANCELLED`, `WAITLISTED`.
- Transitions d'inscription (BR-REG-002) :
  - `PENDING → CONFIRMED | CANCELLED | WAITLISTED`
  - `WAITLISTED → CONFIRMED | CANCELLED`
  - `CONFIRMED → CANCELLED`
  - `CANCELLED` terminal.
- Source d'inscription : `MANUAL`, `IMPORT`, `INGESTION_API`, `PARTNER`, `OTHER`, avec précision optionnelle.
- Une inscription annulée ne déclenche **aucun remboursement automatique** : annulation et remboursement sont deux processus distincts.
- Une inscription liée à un paiement ou à un check-in ne peut pas être supprimée, seulement annulée. Le soft delete est réservé aux inscriptions erronées sans paiement ni check-in, par OWNER/ADMIN.
- Un billet référencé par une inscription ne peut pas être supprimé. La modification du prix d'un billet n'altère pas les transactions passées (montant figé dans la transaction).

**Critères d'acceptation (module) :**

1. Deux participants avec le même email sont autorisés.
2. Seuls OWNER/ADMIN peuvent fusionner ; l'opération est auditée.
3. Une inscription référence exactement un billet et un participant.
4. Une transition de statut invalide est refusée.
5. L'annulation d'une inscription ne modifie pas le statut de la transaction.

**Règles :** BR-PAR-001 à BR-PAR-005, BR-REG-001 à BR-REG-004, BR-TIC-001 à BR-TIC-003. **Priorité :** Must.

---

### 11.3 Module 3 — Paiements et remboursements

**Objectif :** suivre les flux financiers sans traitement bancaire réel.

**Utilisateurs cibles :** OWNER, ADMIN, EVENT_MANAGER (assignés), ANALYST (agrégats uniquement).

**Fonctionnalités :**

- Transactions de type `TICKET` (liées à une inscription) ou `BOOTH` (liées à une réservation de stand).
- Statuts : `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`.
- Transitions (BR-PAY-001) :
  - `PENDING → PAID | FAILED | CANCELLED`
  - `PAID → PARTIALLY_REFUNDED → REFUNDED`
  - `PAID → REFUNDED` si remboursement total immédiat
  - `FAILED` et `CANCELLED` terminaux.
- Entité `Refund` indépendante : un remboursement référence une transaction ; une transaction peut avoir plusieurs remboursements partiels.
- Remboursement autorisé uniquement sur une transaction `PAID` ou `PARTIALLY_REFUNDED` ; cumul des remboursements ≤ montant payé.
- Devise EUR uniquement en V1 ; le champ `currency` est conservé.
- Aucun traitement bancaire réel.
- Modification manuelle du statut d'une transaction réservée aux rôles autorisés et journalisée.
- Les montants financiers sont ceux de la transaction d'origine : un remboursement ne modifie jamais le montant original.

**Définitions financières (détail dans `KPI_DEFINITIONS.md`) :**

- **Gross Revenue** = somme des montants originaux des transactions ayant atteint `PAID`, filtrée sur la date de paiement.
- **Ticket Revenue** et **Booth Revenue** = partition du Gross Revenue par type.
- **Total Refunds** = somme des remboursements, filtrée sur la date de remboursement.
- **Net Revenue** = Gross Revenue − Total Refunds.
- **Gross Revenue reste historiquement stable** après un remboursement.

**Critères d'acceptation (module) :**

1. Un remboursement sur transaction non `PAID` est refusé.
2. Le cumul des remboursements ne peut jamais dépasser le montant payé.
3. Gross Revenue ne diminue pas après un remboursement.
4. Ticket Revenue + Booth Revenue = Gross Revenue.
5. Une transaction en EUR est la seule devise acceptée en V1.

**Règles :** BR-PAY-001 à BR-PAY-008. **Priorité :** Must.

---

### 11.4 Module 4 — Check-ins

**Objectif :** gérer la présence des participants sur site, manuellement ou par import.

**Utilisateurs cibles :** OWNER, ADMIN, EVENT_MANAGER (assignés), ANALYST/VIEWER (agrégats).

**Fonctionnalités :**

- Check-in **manuel** et **import CSV** (Excel = Should).
- Vérification de l'existence du participant, de l'inscription et de l'événement.
- Éligibilité : seule une inscription `CONFIRMED` peut produire un check-in `VALID` (BR-CHK-003).
- Un seul check-in `VALID` par participant et par événement ; un doublon est `INVALID` avec motif `DUPLICATE` (BR-CHK-005).
- Statuts : `VALID`, `INVALID`.
- Tout check-in `INVALID` porte un **motif obligatoire** parmi : `OUTSIDE_WINDOW`, `DUPLICATE`, `REGISTRATION_CANCELLED`, `REGISTRATION_NOT_CONFIRMED`, `REGISTRATION_NOT_FOUND`, `PARTICIPANT_NOT_FOUND`, `EVENT_NOT_FOUND`, `EVENT_CANCELLED`.
- Fenêtre de check-in configurable par événement ; défaut `[event_start − 2h, event_end + 2h]`. Hors fenêtre → `INVALID` avec motif `OUTSIDE_WINDOW`, tracé.
- Historique complet et immuable : aucune opération n'est supprimée ni modifiée ; une correction crée une nouvelle opération auditée.
- Source : `MANUAL`, `CSV`, `INGESTION_API`.

**Critères d'acceptation (module) :**

1. Un check-in sur inscription `PENDING`, `WAITLISTED` ou `CANCELLED` est `INVALID` avec le motif correspondant.
2. Un second check-in valide pour le même participant/événement est `INVALID` (`DUPLICATE`).
3. Un check-in hors fenêtre est `INVALID` (`OUTSIDE_WINDOW`) et reste tracé.
4. Aucun check-in invalide n'est enregistré sans motif.
5. L'import CSV produit un rapport d'erreurs par ligne.

**Règles :** BR-CHK-001 à BR-CHK-007. **Priorité :** Must.

---

### 11.5 Module 5 — Exposants et stands

**Objectif :** gérer les exposants, les stands et leurs réservations.

**Utilisateurs cibles :** OWNER, ADMIN, EVENT_MANAGER (assignés), ANALYST/VIEWER (agrégats).

**Fonctionnalités :**

- **Exposant** rattaché à une organisation, pouvant participer à plusieurs événements.
- **Stand** rattaché à un événement : numéro/code, zone, surface, statut, prix optionnel, devise EUR.
- Statuts de stand : `AVAILABLE`, `RESERVED`, `UNAVAILABLE`.
- **Réservation** : un exposant peut réserver plusieurs stands ; un stand ne peut avoir qu'**une seule réservation active par événement**.
- Contrainte d'unicité en base sur la réservation active, empêchant les réservations concurrentes (BR-EXH-003).
- Libération d'un stand : la réservation passe à `RELEASED` (historique conservé) et le stand redevient `AVAILABLE`.
- Un stand `UNAVAILABLE` ne peut pas être réservé et est exclu du dénominateur du taux d'occupation.
- La valeur de réservation est optionnelle. Lorsqu'elle est renseignée, elle est rattachée à une transaction `BOOTH`.
- Aucun KPI de leads, scans de badges ou revenus exposants non disponibles n'est défini.

**Critères d'acceptation (module) :**

1. Deux réservations actives simultanées sur le même stand et le même événement sont impossibles.
2. Un stand `UNAVAILABLE` ne peut pas être réservé.
3. L'occupation exclut les stands indisponibles du dénominateur.
4. Un exposant peut réserver plusieurs stands.
5. La valeur de réservation absente n'est jamais comptée comme 0 € dans les KPI de valeur.

**Règles :** BR-EXH-001 à BR-EXH-006. **Priorité :** Must.

---

### 11.6 Module 6 — Ingestion

**Objectif :** alimenter la plateforme par imports de fichiers et endpoint simulé.

**Utilisateurs cibles :** OWNER, ADMIN, EVENT_MANAGER (périmètre assigné) pour les imports ; OWNER/ADMIN pour les API keys.

**Fonctionnalités :**

- **Saisie back-office** : couverte par les modules 1 à 5.
- **Import CSV** (Must) et **Excel** (Should) avec :
  - upload et analyse du fichier ;
  - validation de schéma et de contenu ;
  - aperçu obligatoire avant confirmation ;
  - détection des doublons ;
  - stratégie au choix : `SKIP`, `UPDATE`, `ERROR` ;
  - rapport d'erreurs détaillé par ligne ;
  - traitement asynchrone via BullMQ ;
  - statuts `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
- **Endpoint d'ingestion simulé** (Must) :
  - authentification par **API key par organisation** ;
  - scope minimal `ingestion:write` ;
  - payloads batch pour inscriptions, check-ins et paiements ;
  - validation stricte (Zod) ;
  - clé d'idempotence fournie par le client ou dérivée du contenu ;
  - traitement asynchrone via BullMQ ;
  - réponse avec identifiant de job et statut ;
  - appels journalisés dans l'audit.
- **Idempotence** (BR-IMP-004) : clé déterministe = hash du contenu + organisation + type d'import + version de schéma. Aucun timestamp dans la clé.
- Toute ingestion est journalisée (catégorie « Ingestion » de l'audit).

**Critères d'acceptation (module) :**

1. Un fichier rejoué avec la même clé d'idempotence ne crée aucun doublon.
2. Une API key absente, révoquée, expirée ou sans scope `ingestion:write` est rejetée.
3. Un import volumineux est traité de façon asynchrone et son statut est consultable.
4. L'aperçu précède obligatoirement la confirmation.
5. Les erreurs de validation sont listées par ligne avec un motif.

**Règles :** BR-IMP-001 à BR-IMP-007. **Priorité :** Must (Excel : Should).

---

## 12. Modules analytiques

### 12.1 Module 7 — Overview Dashboard

**Objectif :** vue consolidée de la performance de l'organisation sur une période.

**Utilisateurs :** tous les rôles, selon permissions.

**Fonctionnalités :**

- Cartes KPI : inscriptions confirmées, participants uniques, Registration Confirmation Rate, Ticket Revenue, Booth Revenue, Gross Revenue, Total Refunds, Net Revenue, taux d'occupation des stands, taux de présence.
- Tableau des événements avec KPI clés par événement.
- Répartition Ticket vs Booth et évolution temporelle des revenus.
- Tendances inscriptions et présences.
- **Recent Activity** (Must, indépendant de l'audit log) : inscriptions, check-ins, paiements, remboursements et réservations de stands récents ; nombre limité et configurable côté backend ; limitée à l'organisation active ; filtrée par permissions ; générée côté backend.
- Filtres de période libre et comparaison à une période précédente de longueur égale.
- Règles d'inclusion : Annexe B. Filtres temporels basés sur les dates réelles d'activité.

**Cas limites :** période sans données → « N/A », jamais 0 ; organisation sans événement → état vide explicite ; `DRAFT`/`CANCELLED` exclus.

**Critères d'acceptation (module) :**

1. Les KPI respectent l'Annexe B.
2. La comparaison utilise deux fenêtres de même longueur.
3. Recent Activity ne contient que des activités de l'org active.
4. Un Analyst ne voit aucune PII dans Recent Activity.
5. Une période vide affiche « N/A ».

**Règles :** BR-KPI-001 à BR-KPI-004. **Priorité :** Must.

---

### 12.2 Module 8 — Event Analytics

**Objectif :** analyser un événement et comparer plusieurs événements.

**Utilisateurs :** EVENT_MANAGER (assignés), ANALYST, OWNER, ADMIN ; VIEWER en lecture.

**Fonctionnalités :**

- KPI synthétiques par événement : inscriptions, confirmation, présences, revenus, occupation.
- Évolution des inscriptions et points de rupture.
- Statistiques de présence : check-ins valides, invalides par motif, no-show.
- Taux internes : Registration Confirmation Rate, Attendance Rate, No-Show Rate.
- Comparaison inter-événements (jusqu'à 5 événements) avec indicateurs homogènes et avertissement si types ou durées diffèrent.
- Filtres de statut avec règles d'inclusion.

**Cas limites :** événement sans inscription → « N/A » ; comparaison de types différents autorisée avec avertissement ; comparaison avec événement `DRAFT` refusée.

**Critères d'acceptation (module) :**

1. Le KPI de confirmation utilise la formule Q-01.
2. Les check-ins invalides sont détaillés par motif.
3. Une comparaison avec un événement exclu est refusée.
4. Les événements de types différents déclenchent un avertissement.
5. Aucun KPI n'est calculé sur un `DRAFT`.

**Règles :** BR-EVT-001, BR-EVT-002, BR-KPI-003. **Priorité :** Must.

---

### 12.3 Module 9 — Revenue Analytics

**Objectif :** lecture financière rigoureuse, séparant billets et stands.

**Utilisateurs :** OWNER, ADMIN, EVENT_MANAGER, ANALYST (agrégats).

**Fonctionnalités :**

- Ticket Revenue, Booth Revenue, Gross Revenue, Total Refunds, Net Revenue.
- Revenue par événement et par période.
- Nombre de transactions `TICKET` payées et Average Ticket Value.
- Répartition des transactions par statut.
- Remboursements totaux et partiels, cumul plafonné.
- Tendances temporelles.

**Cas limites :** transaction partiellement remboursée → reste remboursable affiché ; remboursement sur transaction non `PAID` interdit ; période avec remboursements supérieurs au Gross de la période → Net négatif possible et affiché tel quel (pas de plancher artificiel).

**Critères d'acceptation (module) :**

1. Gross = Ticket + Booth.
2. Gross reste stable après remboursement.
3. Net = Gross − Total Refunds.
4. Aucun montant n'est compté deux fois.
5. Un remboursement partiel n'apparaît pas comme un revenu.

**Règles :** BR-PAY-001 à BR-PAY-008. **Priorité :** Must.

---

### 12.4 Module 10 — Audience Analytics

**Objectif :** comprendre qui participe, d'où et à quelle fréquence.

**Utilisateurs :** ANALYST (agrégats), EVENT_MANAGER, OWNER, ADMIN ; VIEWER en lecture.

**Fonctionnalités :**

- Participants uniques (identité interne, H-02).
- Distribution démographique par tranche d'âge et genre, **si renseignés**.
- Distribution géographique (pays, région, ville), si renseignés.
- Distribution par source d'inscription.
- Segmentation par type d'événement, cohorte et statut.
- Comportement de présence : présents, no-show, récidivistes.
- Returning Attendee Rate basé sur l'identité interne, jamais sur l'email.

**Cas limites :** données non renseignées → « non renseigné » explicite, jamais 0 ; dimension inconnue exclue du dénominateur de pourcentage et reportée séparément.

**Critères d'acceptation (module) :**

1. Un participant avec deux emails différents reste une seule identité.
2. Les distributions excluent les valeurs inconnues du dénominateur.
3. Aucun email n'est utilisé comme clé de décompte.
4. L'Analyst ne voit que des agrégats.
5. Les champs optionnels absents n'écrasent pas les KPI.

**Règles :** BR-PAR-001, BR-PAR-002, BR-PAR-005, BR-KPI-005. **Priorité :** Must (base).

---

### 12.5 Module 11 — Exhibitor Analytics

**Objectif :** piloter l'occupation et la valorisation des stands.

**Utilisateurs :** EVENT_MANAGER, OWNER, ADMIN, ANALYST ; VIEWER en lecture.

**Fonctionnalités :**

- Nombre d'exposants actifs.
- Stands réservés, disponibles, indisponibles.
- Taux d'occupation = stands réservés / (total − indisponibles).
- Valeur des réservations lorsqu'elle est renseignée.
- Répartition par événement.
- Comparaison inter-événements.

**Cas limites :** événement sans stand (ex. `CONFERENCE`) → module désactivé pour cet événement ; valeur absente → « N/A », jamais 0 € ; dénominateur nul → « N/A ».

**Critères d'acceptation (module) :**

1. Un stand ne compte qu'une fois par réservation active.
2. Les stands indisponibles sont exclus du dénominateur.
3. La valeur de réservation absente n'est pas comptée comme 0 €.
4. Le module est masqué lorsqu'aucun stand n'existe.
5. Aucun KPI de leads ou de scans n'est affiché.

**Règles :** BR-EXH-001 à BR-EXH-006, BR-KPI-006. **Priorité :** Must.

---

### 12.6 Module 12 — Advanced Analytics

**Objectif :** exploration analytique avancée sur agrégats.

**Utilisateurs :** ANALYST, OWNER, ADMIN.

**Fonctionnalités :** filtres multi-dimensions, comparaisons de périodes de longueur égale, analyses croisées contrôlées, drill-down permission-aware, segmentation personnalisée, plages de dates libres.

**Cas limites :** croisement non supporté → message explicite ; tentative de drill-down PII par Analyst → refus.

**Critères d'acceptation (module) :**

1. L'Analyst ne voit jamais de PII, même en drill-down.
2. Les comparaisons utilisent des fenêtres égales.
3. Un croisement non supporté est refusé proprement.

**Règles :** BR-ORG-002, BR-EXP-004, BR-KPI-001. **Priorité :** Should.

---

## 13. Reporting, exports et temps réel

### 13.1 Module 13 — Reports & Exports

**Objectif :** produire des rapports prédéfinis paramétrables et des exports traçables.

**Utilisateurs :** OWNER, ADMIN, EVENT_MANAGER, ANALYST (pseudonymisé).

**Fonctionnalités :**

- **5 rapports prédéfinis** (liste validée le 2026-11-18) : Performance d'événement, Financier, Fréquentation, Exposants, Comparaison inter-événements.
- Paramétrage : période, événements, KPI.
- Exports **PDF, Excel, CSV** (Must).
- Génération **asynchrone** BullMQ avec statuts `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
- Stockage privé et sécurisé ; URL signée temporaire (15 minutes par défaut).
- Rétention 30 jours par défaut, configurable par organisation par OWNER/ADMIN ; purge automatique par worker BullMQ.
- Suivi technique des exports côté backend (Must) : indispensable à la purge, à l'audit et au téléchargement.
- **Interface d'historique des exports = SHOULD** (consultation par utilisateur, type, format, date, statut, période, organisation).
- Pseudonymisation systématique pour ANALYST.
- Notification avant expiration = Should.
- Exports expirés inaccessibles (HTTP 410 Gone).

**Critères d'acceptation (module) :**

1. Un export volumineux bascule en asynchrone sans bloquer l'interface.
2. Une URL expirée est refusée.
3. Un export ANALYST ne contient aucune PII.
4. La purge supprime les fichiers expirés.
5. Le suivi backend existe même sans interface d'historique.

**Règles :** BR-EXP-001 à BR-EXP-006. **Priorité :** Must (interface d'historique : Should).

---

### 13.2 Module 14 — Real-time Analytics

**Objectif :** actualiser en direct les KPI essentiels pendant un événement.

**Utilisateurs :** EVENT_MANAGER, ADMIN, OWNER.

**Fonctionnalités :** inscriptions et check-ins en temps réel, participants présents, flux d'activité récente, mise à jour des cartes KPI. Fonctionnement dégradé en polling si Socket.IO est indisponible.

**Cas limites :** déconnexion réseau → bascule polling ; charge élevée → limitation de fréquence.

**Critères d'acceptation (module) :**

1. Les KPI REST et temps réel utilisent la même source de calcul.
2. Sans Socket.IO, les dashboards restent opérationnels.
3. Une reconnexion resynchronise l'état.

**Règles :** BR-RT-001, BR-RT-002. **Priorité :** Should.

---

## 14. Module 15 — Administration

**Objectif :** gouverner l'organisation, les utilisateurs, les rôles, les paramètres et l'audit.

**Utilisateurs :** OWNER, ADMIN.

**Fonctionnalités :**

- Gestion des utilisateurs et invitations.
- Gestion des memberships et des rôles (matrice Annexe A).
- Paramètres d'organisation : fuseau horaire, devise EUR, rétention des exports.
- Gestion des API keys : création, rotation, révocation, scopes.
- **Audit log minimal (Must)** : 6 catégories, 11 champs, UTC, métadonnées bornées, sans secrets ni PII inutile, actions système identifiables, journal protégé en lecture et en écriture.
- **Consultation basique de l'audit (Must)** pour OWNER/ADMIN.
- **Interface d'audit avancée (Should)** : filtres, recherche, exports.

**Règles de gouvernance :**

- Le dernier `OWNER` ne peut être supprimé ni rétrogradé.
- Un `ADMIN` ne peut pas modifier le rôle d'un `OWNER` ni attribuer le rôle `OWNER`.
- Toute modification de rôle est auditée.

**Critères d'acceptation (module) :**

1. La suppression/rétrogradation du dernier OWNER est refusée.
2. Un ADMIN ne peut pas modifier un OWNER.
3. Les 6 catégories d'actions sensibles sont journalisées.
4. Aucun mot de passe, token ou secret d'API key n'apparaît dans l'audit.
5. La rétention des exports est configurable par OWNER/ADMIN.

**Règles :** BR-ORG-001 à BR-ORG-007, BR-AUD-001 à BR-AUD-005. **Priorité :** Must (UI avancée : Should).

---

## 15. Parcours utilisateurs

### 15.1 Onboarding d'une organisation
1. L'OWNER crée ou rejoint l'organisation ; le membership est créé.
2. L'OWNER invite ADMIN, EVENT_MANAGER, ANALYST, VIEWER.
3. L'organisation est configurée (fuseau horaire, rétention des exports).
4. Les API keys d'ingestion sont créées si nécessaire.

### 15.2 Création et publication d'un événement
1. Un EVENT_MANAGER ou un ADMIN crée un événement `DRAFT` (type, dates, fuseau).
2. L'Event Manager est auto-assigné à la création par un EVENT_MANAGER.
3. Les billets et la fenêtre de check-in sont configurés.
4. L'événement est publié (`PUBLISHED`) après validation.
5. Le jour J, il passe `ONGOING`, puis `COMPLETED`, puis `ARCHIVED`.

### 15.3 Inscription manuelle et paiement
1. Un opérateur crée le participant et l'inscription (`PENDING`).
2. L'inscription est confirmée (`CONFIRMED`).
3. Une transaction `TICKET` est enregistrée puis passée à `PAID`.
4. Le KPI de confirmation et les revenus sont mis à jour.

### 15.4 Import CSV d'inscriptions
1. L'utilisateur téléverse un CSV.
2. Le système valide le schéma et produit un aperçu avec erreurs et doublons.
3. L'utilisateur choisit la stratégie `SKIP`, `UPDATE` ou `ERROR`.
4. Le job BullMQ traite le fichier ; le statut et le rapport d'erreurs sont consultables.
5. L'import est audité et idempotent.

### 15.5 Check-in le jour de l'événement
1. L'opérateur recherche le participant ou importe un CSV.
2. Le système vérifie participant, inscription, événement, fenêtre et doublon.
3. Le check-in est `VALID` si l'inscription est `CONFIRMED`, dans la fenêtre et premier du couple participant/événement.
4. Sinon, il est `INVALID` avec motif obligatoire.
5. L'historique est immuable ; les KPI de présence se mettent à jour.

### 15.6 Remboursement partiel
1. Un opérateur ouvre une transaction `PAID`.
2. Il enregistre un `Refund` partiel.
3. Le cumul est vérifié ; la transaction passe `PARTIALLY_REFUNDED`.
4. Gross reste stable ; Net diminue ; l'action est auditée.

### 15.7 Réservation de stands
1. L'organisateur crée les stands de l'événement.
2. Un exposant est créé ou sélectionné.
3. Une réservation active est créée sur un stand disponible.
4. Le prix éventuel est enregistré et rattaché à une transaction `BOOTH`.
5. L'occupation et la valeur des réservations sont mises à jour.

### 15.8 Analyse et export
1. L'Analyst ouvre le dashboard et filtre la période.
2. Il consulte des agrégats sans PII.
3. Il génère un rapport prédéfini.
4. L'export est traité de façon asynchrone et pseudonymisé.
5. Il télécharge via une URL signée avant expiration.

### 15.9 Audit d'une action sensible
1. L'ADMIN consulte le journal d'audit.
2. Il filtre par catégorie, acteur, ressource, résultat et dates.
3. Il identifie les actions échouées et les opérations financières.
4. Il ne voit jamais de secret ni de PII inutile.

---

## 16. Exigences non fonctionnelles

| Domaine | Engagement |
|---|---|
| **Sécurité** | JWT access court + refresh avec rotation ; Argon2 ; RBAC backend strict ; API key par organisation (scope, rotation, révocation) ; secrets jamais journalisés ; exports via URL signée |
| **Multi-tenant** | Isolation par organisation sur toutes les opérations ; tests cross-org en CI |
| **Performance** | Dashboards < 2 s sur 50 000 inscriptions / 30 000 check-ins ; imports/exports asynchrones ; index ciblés ; cache Redis optionnel |
| **Scalabilité** | Monolithe modulaire, worker séparé ; pas de microservices en V1 |
| **Fiabilité** | Idempotence des imports et exports ; reprise sur erreur BullMQ ; statuts explicites |
| **Disponibilité** | Cible pragmatique de portfolio ; aucun SLA d'entreprise simulé |
| **Accessibilité** | Objectif WCAG 2.1 AA sur les parcours clés |
| **Responsive** | Desktop et tablette ; mobile non prioritaire |
| **Intégrité** | Contraintes SQL, transactions, soft delete, audit |
| **Confidentialité** | Minimisation, pseudonymisation, droit à l'effacement, journalisation |
| **Observabilité** | Logs structurés, Sentry, métriques BullMQ |
| **Sauvegarde** | Backups PostgreSQL documentés ; pas de réplication multi-région V1 |
| **Tests** | Unitaires (Vitest), intégration (Supertest), isolation cross-org, E2E (Playwright) |
| **Documentation** | OpenAPI, README, ADR |

---

## 17. Contraintes produit

- **Stack imposée** : React + TypeScript + Vite + Tailwind + shadcn/ui + Recharts ; Node + Express + TypeScript ; PostgreSQL + Prisma ; JWT + Zod ; Socket.IO + Redis + BullMQ ; Vitest + Supertest + Playwright ; Swagger/OpenAPI + Docker + GitHub Actions + Sentry.
- **Architecture** : monolithe modulaire + worker dédié ; microservices exclus.
- **Langue** : livrables en français, code et identifiants en anglais.
- **Finalité** : projet portfolio ; aucune commercialisation ni traitement de données réelles en V1.
- **Données** : synthétiques, reproductibles par seed, aucune PII réelle.
- **Devise** : EUR uniquement en V1 ; champ `currency` conservé.
- **Timezones** : stockage UTC ; affichage selon le fuseau de l'événement, sinon de l'organisation.
- **Périmètre V1 figé** : aucun élément Should/Could ne devient obligatoire sans validation explicite.

---

## 18. Règles métier transverses et confidentialité

Le détail complet figure dans `BUSINESS_RULES.md`. Les règles structurantes sont :

### 18.1 Isolation multi-organisation
- Toute entité métier porte `organization_id`.
- Aucune requête ne traverse les organisations.
- Les tests d'isolation sont obligatoires en CI.

### 18.2 Cycle de vie des données
| Niveau | Déclencheur | Effet | Réversible |
|---|---|---|---|
| Soft delete | Action métier ordinaire | Marquage `deleted_at`, données conservées | Oui |
| Anonymisation | Demande RGPD ou rétention | Remplacement des PII par des valeurs pseudonymisées | Non |
| Effacement définitif | Demande RGPD, contrainte légale levée | Suppression physique des PII ; données comptables agrégées conservées | Non |

Les événements `COMPLETED` et les transactions financières ne sont jamais supprimés physiquement.

### 18.3 Audit log

**6 catégories d'actions sensibles :**

1. **Authentification et sessions** : connexion réussie/échouée, déconnexion, refresh token, changement d'organisation active, demande et exécution de réinitialisation du mot de passe.
2. **Utilisateurs et rôles** : création, invitation, modification de membership, modification de rôle, suppression d'un membre, désactivation/réactivation, modification de permissions.
3. **Organisation et configuration** : modification des paramètres critiques, création/rotation/révocation des API keys.
4. **Données sensibles** : export de données personnelles, fusion de participants, soft delete, anonymisation, effacement définitif.
5. **Opérations financières** : création/modification/annulation d'un remboursement, modification manuelle du statut d'une transaction.
6. **Ingestion** : import de données, appels à l'endpoint d'ingestion.

**11 champs minimaux :** `id`, `timestamp` (UTC), `organization_id`, `actor_user_id` (nullable), `action_type`, `resource_type`, `resource_id`, `result` (`SUCCESS`/`FAILURE`), `metadata` (JSON borné, sans PII brute), `ip_address` (optionnel), `user_agent` (optionnel).

**Règles de sécurité :** jamais de mots de passe, tokens ou valeurs secrètes d'API keys ; seuls un identifiant ou fingerprint d'API key sont conservés ; pas de PII brute inutile ; actions système et workers identifiables ; journal protégé contre les accès et modifications non autorisés.

### 18.4 Recent Activity
- Construite à partir des événements métier : inscriptions, check-ins, paiements, remboursements, réservations de stands.
- Nombre limité, org active uniquement, filtrée par permissions, générée côté backend.
- Indépendante de l'interface avancée d'audit.

### 18.5 Timezones
- Stockage UTC.
- Affichage selon le fuseau de l'événement s'il est défini, sinon celui de l'organisation.
- Tests DST obligatoires.

### 18.6 Idempotence
- Imports : clé déterministe sans timestamp.
- Exports : un même job rejoué ne produit pas de doublon.
- Worker : reprise sans double application.

---

## 19. Hypothèses et décisions validées

| Réf | Décision validée |
|---|---|
| H-01 | Organisation active par session ; changement avec renouvellement du contexte ; RBAC par membership |
| H-02 | Participants rattachés à l'organisation ; email non unique ; identité interne |
| H-03 | Gross Revenue historiquement stable |
| H-04 | EUR uniquement ; champ `currency` conservé |
| H-05 | Stockage UTC ; affichage TZ événement/organisation ; tests DST |
| H-06 | Soft delete, anonymisation et effacement définitif distincts |
| H-07 | BullMQ Must ; Redis infrastructure Must pour BullMQ, cache Should |
| H-08 | CSV Must ; Excel Should ; exports PDF/Excel/CSV Must |
| H-09 | Exports Analyst pseudonymisés par défaut ; PII restreinte |
| H-10 | Rétention des exports 30 jours par défaut, configurable |
| H-11 | API key par organisation avec création, rotation, révocation et scopes |
| H-12 | JWT access + refresh avec rotation ; Argon2 ; pas de SSO V1 |
| H-13 | Dataset synthétique reproductible : ~20 événements, ~50 000 inscriptions, ~30 000 check-ins, ~200 exposants, ~500 stands, 24 mois |
| H-14 | Aucune PII réelle ; données fictives marquées « données de démonstration » |

Les décisions Q-01 à Q-14 sont rappelées en **Annexe E**.

---

## 20. Dépendances

| Dépendance | Nature | Impact |
|---|---|---|
| PostgreSQL + Prisma | Technique | Modèle de données, migrations, tests |
| BullMQ + Redis | Technique | Imports, exports, purge, workers |
| Socket.IO | Technique | Module 14 (Should) |
| Moteur de génération PDF | Technique | Exports PDF |
| Stockage objet ou disque sécurisé | Technique | Exports |
| GitHub Actions | CI | Tests, build, lint |
| Sentry | Observabilité | Suivi des erreurs |
| Dataset synthétique (seed) | Fonctionnel | Démo et tests de performance |
| OpenAPI | Documentation | Contrat API |

---

## 21. Critères de succès et de release

### 21.1 Release gate V1
- Démonstration portfolio de bout en bout : création d'événement, import, check-in, dashboard, rapport et export sur le dataset synthétique.
- 100 % des Must Have livrés et testés.
- Tests d'isolation cross-org passants.
- 0 KPI sans formule documentée dans `KPI_DEFINITIONS.md`.
- 0 endpoint sans vérification backend de permission.
- Exports PDF/Excel/CSV fonctionnels et pseudonymisés pour ANALYST.
- Audit minimal opérationnel sur les 6 catégories.
- OpenAPI, README et ADR livrés.
- CI verte (lint, tests, build).

### 21.2 Critères de qualité
- Exactitude des KPI vérifiable par tests sur jeux de données de référence.
- Dataset synthétique reproductible.
- Absence de PII dans les exports ANALYST (test automatisé).
- Dashboards < 2 s sur la volumétrie cible.
- Aucun moyen de contournement du backend pour les permissions.

---

## 22. Périmètre V1 — MoSCoW

### 22.1 MUST HAVE

**Socle**
- Authentification JWT Access + Refresh.
- Hash Argon2.
- Gestion des utilisateurs.
- Organisations et Membership.
- Isolation réelle entre organisations.
- Tests d'isolation multi-organisation dans la CI.
- RBAC à cinq rôles.

**Gestion métier**
- CRUD des événements.
- Cycle de vie et transitions autorisées.
- Types d'événements.
- Soft delete.
- Gestion des participants.
- Gestion des inscriptions et statuts.
- Gestion des billets.
- Suivi des paiements.
- Entité `Refund`.
- Remboursements partiels et totaux.
- Check-ins manuels et CSV.
- Validation, doublons, motifs d'invalidité et historique.
- Gestion des exposants.
- Gestion des stands et réservations avec contrainte d'unicité.

**Analytics**
- Overview Dashboard.
- Event Analytics.
- Revenue Analytics.
- Audience Analytics de base.
- Exhibitor Analytics.
- Règles d'inclusion Q-13.
- Revenue : Gross, Total Refunds, Net, Ticket, Booth.

**Ingestion et reporting**
- Import CSV avec validation, aperçu, détection des doublons et rapport d'erreurs.
- Traitement asynchrone BullMQ.
- Endpoint d'ingestion authentifié par API key par organisation.
- 5 rapports prédéfinis paramétrables.
- Exports PDF, Excel et CSV.
- Exports asynchrones.
- Stockage sécurisé.
- URLs signées.
- Purge automatique après expiration (avec suivi technique backend des exports).
- Masquage et pseudonymisation des PII pour Analyst.

**Transversal**
- Gestion UTC et fuseaux horaires.
- Tests DST.
- Pseudonymisation et minimisation.
- Audit Log minimal.
- Soft delete.
- Tests unitaires.
- Tests d'intégration.
- Tests d'isolation cross-org.
- Tests E2E.
- Documentation OpenAPI.
- README.
- ADR.
- Docker.
- GitHub Actions.

### 22.2 SHOULD HAVE
- Socket.IO pour les KPI essentiels en temps réel.
- Import Excel.
- Advanced Analytics.
- Cache Redis si les performances le justifient.
- Interface avancée d'audit.
- Interface d'historique des exports.
- Comparaisons avancées entre événements.
- Notifications d'expiration des exports.

### 22.3 COULD HAVE
- Check-in par QR Code.
- Plan interactif des stands.
- Constructeur de rapports personnalisés.
- Intégration Stripe.
- Intégration Google Analytics ou Matomo.
- Notifications par email.
- Analyses prédictives.

### 22.4 WON'T HAVE
- Architecture microservices.
- Application mobile native.
- Traitement réel des paiements bancaires et conformité PCI.
- Tracking natif des visiteurs du site web.
- Intelligence artificielle prédictive.
- Intégrations réelles tierces obligatoires.

---

## 23. Hors périmètre et opportunités futures

**Hors périmètre V1 :** cf. section 22.4. S'y ajoutent, du fait du caractère portfolio : commercialisation (pricing, facturation, go-to-market), SLA contractuels, DPA et conformité d'exploitation réelle. Le produit utilise uniquement des données synthétiques.

**Opportunités futures (hors périmètre, sans engagement) :** connecteurs billetterie/CRM/comptabilité, prévision d'affluence, portail exposant, application mobile, scan QR, facturation par organisation, collaboration sur dashboards, internationalisation et multi-devises.

---

## 24. Validations et points ouverts

1. **Matrice action × rôle (Annexe A)** : approuvée le 2026-11-18 (Q-09). Elle constitue la référence des autorisations V1.
2. **Liste nominative des 5 rapports prédéfinis** : confirmée le 2026-11-18 — Performance d'événement, Financier, Fréquentation, Exposants, Comparaison inter-événements.
3. **Détails de mise en œuvre à traiter en Phase 2/3** : modèle de données physique, contrat OpenAPI détaillé, choix du stockage objet, moteur PDF, dimensionnement Redis, planification exacte de la purge, politique de rétention de l'audit. Aucun de ces points ne modifie le périmètre fonctionnel V1.
4. **Nature du projet** : portfolio — confirmée le 2026-11-18. Les sujets de commercialisation et de conformité d'exploitation réelle sont hors périmètre V1.

---

## 25. Annexes

### Annexe A — Matrice action × rôle (approuvée — Q-09, 2026-11-18)

**Légende :** Oui = autorisé ; Non = interdit ; Restreint = autorisé avec restriction (périmètre assigné, agrégats, pseudonymisation, non-OWNER, etc.) ; N/A = non applicable.

> Cette matrice a été **approuvée par le Product Owner le 2026-11-18**. Elle constitue la référence des autorisations de la V1.

#### A.1 Organisations et memberships

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Voir l'organisation active | Oui | Oui | Oui | Oui | Oui |
| Changer d'organisation active | Oui | Oui | Oui | Oui | Oui |
| Modifier les paramètres critiques | Oui | Restreint | Non | Non | Non |
| Gérer les memberships | Oui | Oui (hors OWNER) | Non | Non | Non |
| Attribuer le rôle OWNER | Oui | Non | Non | Non | Non |
| Attribuer/modifier les autres rôles | Oui | Oui (non-OWNER) | Non | Non | Non |
| Désactiver/réactiver un membre | Oui | Restreint (non-OWNER) | Non | Non | Non |

#### A.2 Événements

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Lire les événements (agrégats) | Oui | Oui | Oui | Oui | Oui |
| Lire le détail d'un événement | Oui | Oui | Restreint (assignés) | Oui (publiés/archivés) | Oui (publiés/archivés) |
| Voir DRAFT/CANCELLED | Oui | Oui | Restreint (assignés) | Non | Non |
| Créer un événement | Oui | Oui | Oui (auto-assigné) | Non | Non |
| Modifier un événement | Oui | Oui | Restreint (assignés) | Non | Non |
| Supprimer (soft delete) | Oui | Oui | Non | Non | Non |
| Assigner/réassigner un Event Manager | Oui | Oui | Non | Non | Non |
| Exporter | Oui | Oui | Restreint (assignés) | Restreint (pseudonymisé) | Non |

#### A.3 Participants

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Lire les participants (PII) | Oui | Oui | Restreint (assignés) | Non | Non |
| Lire les participants (agrégats) | Oui | Oui | Oui | Oui | Oui |
| Créer un participant | Oui | Oui | Oui | Non | Non |
| Modifier un participant | Oui | Oui | Restreint (assignés) | Non | Non |
| Fusionner des participants | Oui | Oui | Non | Non | Non |
| Anonymiser / effacer | Oui | Oui | Non | Non | Non |
| Supprimer (soft delete) | Oui | Oui | Non | Non | Non |
| Exporter | Oui | Oui | Restreint (pseudonymisé) | Restreint (pseudonymisé) | Non |

#### A.4 Inscriptions et billets

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Lire les inscriptions (PII) | Oui | Oui | Restreint (assignés) | Non | Non |
| Lire les inscriptions (agrégats) | Oui | Oui | Oui | Oui | Oui |
| Créer une inscription | Oui | Oui | Oui | Non | Non |
| Modifier le statut | Oui | Oui | Oui (assignés) | Non | Non |
| Annuler une inscription | Oui | Oui | Oui (assignés) | Non | Non |
| Créer/modifier un billet | Oui | Oui | Oui (assignés) | Non | Non |
| Supprimer un billet non utilisé | Oui | Oui | Non | Non | Non |
| Supprimer une inscription (soft delete, sans paiement/check-in) | Oui | Oui | Non | Non | Non |
| Exporter | Oui | Oui | Restreint (pseudonymisé) | Restreint (pseudonymisé) | Non |

#### A.5 Paiements et remboursements

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Lire les transactions (détail) | Oui | Oui | Restreint (assignés) | Non | Non |
| Lire les transactions (agrégats) | Oui | Oui | Oui | Oui | Oui |
| Créer une transaction | Oui | Oui | Oui (assignés) | Non | Non |
| Modifier le statut manuellement | Oui | Oui | Restreint (transitions limitées) | Non | Non |
| Enregistrer un remboursement | Oui | Oui | Oui (assignés) | Non | Non |
| Supprimer une transaction | Non | Non | Non | Non | Non |
| Exporter | Oui | Oui | Restreint (pseudonymisé) | Restreint (pseudonymisé) | Non |

#### A.6 Check-ins

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Lire les check-ins (détail) | Oui | Oui | Restreint (assignés) | Non | Non |
| Lire les check-ins (agrégats) | Oui | Oui | Oui | Oui | Oui |
| Créer un check-in manuel | Oui | Oui | Oui (assignés) | Non | Non |
| Importer des check-ins CSV | Oui | Oui | Oui (assignés) | Non | Non |
| Corriger via une nouvelle opération | Oui | Oui | Oui (assignés) | Non | Non |
| Supprimer un check-in | Non | Non | Non | Non | Non |
| Exporter | Oui | Oui | Restreint (pseudonymisé) | Restreint (pseudonymisé) | Non |

#### A.7 Exposants et stands

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Lire les exposants/stands (détail) | Oui | Oui | Restreint (assignés) | Non | Non |
| Lire les exposants/stands (agrégats) | Oui | Oui | Oui | Oui | Oui |
| Créer/modifier un exposant | Oui | Oui | Oui (assignés) | Non | Non |
| Créer/modifier un stand | Oui | Oui | Oui (assignés) | Non | Non |
| Réserver/libérer un stand | Oui | Oui | Oui (assignés) | Non | Non |
| Modifier le prix d'un stand | Oui | Oui | Restreint (assignés) | Non | Non |
| Supprimer (soft delete) | Oui | Oui | Non | Non | Non |
| Exporter | Oui | Oui | Restreint (pseudonymisé) | Restreint (pseudonymisé) | Non |

#### A.8 Ingestion

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Lancer un import | Oui | Oui | Restreint (assignés) | Non | Non |
| Voir les jobs d'import | Oui | Oui | Restreint (assignés) | Non | Non |
| Exporter le rapport d'erreurs | Oui | Oui | Restreint (assignés) | Non | Non |
| Gérer les API keys | Oui | Oui | Non | Non | Non |
| Appeler l'endpoint d'ingestion | API key | API key | API key | Non | Non |

#### A.9 Analytique

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Voir les dashboards | Oui | Oui | Oui | Oui | Oui |
| Filtrer et comparer | Oui | Oui | Oui | Oui | Restreint (basique) |
| Drill-down détaillé | Oui | Oui | Restreint (assignés) | Restreint (agrégats) | Non |
| Advanced Analytics | Oui | Oui | Non | Oui | Non |
| Exporter | Oui | Oui | Restreint (pseudonymisé) | Restreint (pseudonymisé) | Non |

#### A.10 Rapports et exports

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Générer un rapport prédéfini | Oui | Oui | Oui | Oui | Non |
| Exporter PDF/Excel/CSV | Oui | Oui | Restreint (pseudonymisé) | Restreint (pseudonymisé) | Non |
| Voir l'historique des exports | Oui | Oui | Restreint (les siens) | Restreint (les siens) | Non |
| Configurer la rétention | Oui | Oui | Non | Non | Non |

#### A.11 Administration et audit

| Action | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Gérer utilisateurs et invitations | Oui | Oui | Non | Non | Non |
| Gérer les rôles | Oui | Restreint (non-OWNER) | Non | Non | Non |
| Paramètres d'organisation | Oui | Restreint | Non | Non | Non |
| Gérer les API keys | Oui | Oui | Non | Non | Non |
| Consulter l'audit (basique) | Oui | Oui | Non | Non | Non |
| Interface d'audit avancée (Should) | Oui | Oui | Non | Non | Non |

**Règles de gouvernance :** dernier OWNER protégé ; un ADMIN ne peut pas modifier un OWNER ; toute modification de rôle est auditée.

---

### Annexe B — Inclusion des événements dans les KPI

| Statut | KPI de performance courante | Analyses historiques | Vue dédiée |
|---|---|---|---|
| `DRAFT` | Exclu | Exclu | Vue brouillons |
| `PUBLISHED` | Inclus selon le KPI | Inclus | — |
| `ONGOING` | Inclus selon le KPI | Inclus | — |
| `COMPLETED` | Inclus | Inclus | — |
| `ARCHIVED` | Exclu par défaut des vues de performance courante | **Inclus** | Vue archives |
| `CANCELLED` | Exclu | Exclu | Vue annulés dédiée |

**Règles de période :**
- Inscriptions : date d'inscription.
- Présence : date de check-in.
- Revenus : date de paiement.
- Remboursements : date de remboursement.
- Réservations de stands : date de réservation.
- Les filtres de période ne s'appliquent **jamais** automatiquement à la date de début de l'événement.
- Les comparaisons utilisent des fenêtres de longueur égale.
- Les bornes sont calculées dans le fuseau de l'organisation/événement puis converties en UTC.

---

### Annexe C — Distinction Redis / BullMQ

BullMQ repose techniquement sur Redis. En conséquence :

| Usage de Redis | Classification | Justification |
|---|---|---|
| Backend de files BullMQ | Must (infrastructure) | BullMQ impose Redis |
| Cache applicatif (dashboards, agrégats) | Should | Optionnel, activé si les performances l'exigent |

**Conséquence :** le déploiement V1 inclut Redis comme infrastructure obligatoire ; son usage en cache reste optionnel. Cette interprétation de H-07 est confirmée.

---

### Annexe D — Workflows transverses

#### D.1 Fusion de participants (Q-02)
1. OWNER/ADMIN ouvre la fiche participant.
2. Le système propose des correspondances par email normalisé (jamais de fusion automatique).
3. L'utilisateur sélectionne les participants et l'identité conservée.
4. Le système rattache inscriptions, check-ins et références au participant conservé.
5. L'opération est auditée avec les identifiants conservés et absorbés.
6. Les participants absorbés sont marqués fusionnés (soft delete), jamais supprimés physiquement.
7. Fusion partielle interdite ; fusion d'un participant anonymisé refusée.

#### D.2 Anonymisation et effacement (H-06)
Trois niveaux distincts : soft delete (réversible), anonymisation (irréversible, PII remplacées), effacement définitif (PII supprimées, données comptables agrégées conservées). Réservé à OWNER/ADMIN, audité. Un événement `COMPLETED` ou une transaction financière n'est jamais supprimé.

#### D.3 Imports (idempotence)
1. Upload → calcul d'une clé d'idempotence déterministe (hash du contenu + organisation + type + version de schéma).
2. `PENDING → PROCESSING` (BullMQ) `→ COMPLETED | FAILED`.
3. Aperçu obligatoire : validation, rapport d'erreurs, doublons avec stratégie `SKIP`/`UPDATE`/`ERROR`.
4. Un même fichier rejoué avec la même clé ne produit aucun doublon.
5. Import audité avec référence fichier, statut final et volumétrie.

#### D.4 Endpoint d'ingestion simulé (H-11)
1. L'appelant présente une API key d'organisation avec le scope `ingestion:write`.
2. Le payload batch est validé (Zod) ; la clé d'idempotence est vérifiée.
3. Un job BullMQ est créé ; la réponse contient l'identifiant du job.
4. Le traitement est asynchrone ; le statut est consultable.
5. L'appel et le résultat sont audités.
6. Une clé absente, révoquée, expirée ou sans scope est rejetée.

#### D.5 Génération et rétention des exports (Q-14)
1. Demande → job BullMQ `PENDING`.
2. Génération asynchrone `PROCESSING → COMPLETED | FAILED`.
3. URL signée temporaire (15 minutes par défaut).
4. Purge automatique après 30 jours (configurable par OWNER/ADMIN).
5. Export expiré → HTTP 410 Gone.
6. Notification avant expiration = Should.
7. Le suivi backend de l'export est Must ; l'interface d'historique est Should.

#### D.6 Cycle d'un check-in (Q-08)
1. Source manuelle, CSV ou endpoint d'ingestion.
2. Vérification participant, inscription, événement.
3. Vérification de l'éligibilité (`CONFIRMED`), de la fenêtre et du doublon.
4. Enregistrement `VALID` ou `INVALID` avec motif obligatoire.
5. Aucune modification ni suppression : une correction crée une nouvelle opération auditée.

#### D.7 Remboursement (Q-04)
1. Transaction `PAID` ou `PARTIALLY_REFUNDED`.
2. Création d'un `Refund` indépendant.
3. Vérification du cumul ≤ montant payé.
4. Passage `PARTIALLY_REFUNDED` ou `REFUNDED`.
5. Gross inchangé ; Net recalculé ; action auditée.
6. L'annulation d'une inscription/transaction reste distincte du remboursement.

---

### Annexe E — Décisions Q-01 à Q-14 et hypothèses H-01 à H-14

#### Décisions produit

| Réf | Décision |
|---|---|
| Q-01 | `Registration Confirmation Rate` = `CONFIRMED / (PENDING + CONFIRMED) × 100` ; CANCELLED/WAITLISTED exclus ; N/A si dénominateur nul ; jamais appelé Conversion Rate |
| Q-02 | Email normalisé non fusionnant ; suggestions ; fusion manuelle OWNER/ADMIN ; traçabilité |
| Q-03 | Statuts inscription : `PENDING`, `CONFIRMED`, `CANCELLED`, `WAITLISTED` |
| Q-04 | Transaction (`PENDING`, `PAID`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`) + `Refund` 1..n + plafond ; Gross stable ; Net = Gross − Refunds ; annulation ≠ remboursement |
| Q-05 | `Transaction.type = TICKET | BOOTH` ; revenus séparés ; remboursement rattaché au type d'origine |
| Q-06 | BullMQ Must (imports, exports, purge, statuts, idempotence, reprise) |
| Q-07 | CSV Must / Excel Should / Exports PDF·Excel·CSV Must |
| Q-08 | Fenêtre check-in configurable, défaut `[start − 2h, end + 2h]` ; hors fenêtre → invalide + motif + traçabilité ; doublons ; historique |
| Q-09 | Matrice 5 rôles × modules × actions approuvée le 2026-11-18 (Annexe A), vérifiée backend |
| Q-10 | Auto-assignation à la création + assignation/réassignation/retrait OWNER/ADMIN |
| Q-11 | Viewer lecture seule org-wide ; pas d'export, pas de PII, pas d'admin |
| Q-12 | Audit minimal Must (6 catégories, 11 champs, UTC, métadonnées bornées, actions système identifiables, API keys par empreinte) ; UI avancée Should |
| Q-13.1 | Recent Activity Must, indépendant de l'audit, filtré par permissions |
| Q-13.2 | DRAFT/CANCELLED exclus ; ARCHIVED inclus dans l'historique ; filtres = dates réelles d'activité |
| Q-14 | Rétention 30 jours configurable, purge BullMQ, URLs signées, notification = Should |

#### Hypothèses transverses

| Réf | Hypothèse |
|---|---|
| H-01 | Organisation active par session ; RBAC par membership |
| H-02 | Participant scopé par organisation ; email non unique |
| H-03 | Gross Revenue stable historiquement |
| H-04 | EUR + champ `currency` |
| H-05 | Stockage UTC + TZ événement/organisation + tests DST |
| H-06 | Soft delete + anonymisation + effacement définitif |
| H-07 | BullMQ Must ; Redis infra Must, cache Should |
| H-08 | CSV Must / Excel Should / Exports Must |
| H-09 | Exports Analyst pseudonymisés par défaut |
| H-10 | Rétention exports 30 jours par défaut |
| H-11 | API key par organisation (rotation, révocation, scopes) |
| H-12 | JWT access + refresh rotation, Argon2, pas de SSO |
| H-13 | Dataset reproductible : 20/50k/30k/200/500/24 mois |
| H-14 | Aucune PII réelle ; données fictives marquées |

---

### Annexe F — Conventions d'identifiants et traçabilité

- Règles métier : `BR-<DOMAINE>-<NNN>` (ex. `BR-PAY-002`).
- KPI : `KPI-<DOMAINE>-<NNN>` (ex. `KPI-REV-003`).
- User stories : `US-<MODULE>-<NNN>` (ex. `US-CHK-001`).
- Chaque exigence du PRD est reliée à une ou plusieurs règles (`BUSINESS_RULES.md`), un ou plusieurs KPI (`KPI_DEFINITIONS.md`) et une ou plusieurs user stories (`USER_STORIES.md`).

---

*Fin du PRD.md — Version 1.1 — Phase 1 validée le 2026-11-18 (matrice Q-09 approuvée).*
