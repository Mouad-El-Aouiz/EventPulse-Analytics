# INFORMATION_ARCHITECTURE.md — EventPulse Analytics

**Phase :** 2 — UI/UX Design Essentials

**Version :** 1.0

**Date :** 2026-11-18

**Référence :** `docs/PRD.md` v1.1 (Annexe A — matrice Q-09), `docs/USER_STORIES.md` v1.0, `docs/BUSINESS_RULES.md` v1.0

---

## 1. Modèle mental

L'application s'organise autour de **trois niveaux de contexte** :

```
Organisation active
└── Contexte transversal : période analytique
    └── Événement sélectionné (optionnel)
        └── Module → écran → entité (participant, inscription, transaction…)
```

- **Organisation** : périmètre racine de toutes les données, permissions, paramètres et audits.
- **Événement** : contexte opérationnel et analytique ; un utilisateur `EVENT_MANAGER` est limité à ses événements assignés.
- **Période** : filtre transversal des analyses ; fenêtre semi-ouverte `[du, au)`.

Aucune donnée d'une autre organisation ne doit être visible, y compris via un sélecteur ou une URL directe.

---

## 2. Structure globale

| Zone | Contenu | Comportement |
|---|---|---|
| **Sidebar** (240 px / 64 px repliée) | Navigation principale par sections | Repli mémorisé par utilisateur ; off-canvas < 1024 px |
| **Header** (56 px) | Sélecteur d'organisation, sélecteur d'événement, breadcrumbs, menu utilisateur | Collant en haut ; sélecteurs toujours accessibles |
| **Zone de contenu** | Titre de page, filtres, contenu, actions | Largeur max 1440 px ; padding 24 px |
| **Zone d'actions** | Action primaire de page, actions secondaires | À droite du titre ; barre collante sur mobile pour les formulaires |
| **Overlays** | Dialogues, drawers, menus, toasts | Un seul dialogue modal à la fois |

---

## 3. Sidebar principale

### 3.1 Arbre de navigation

```
EventPulse Analytics
├── Vue d'ensemble                         /overview
├── Gestion
│   ├── Événements                         /events
│   ├── Participants                       /participants
│   ├── Inscriptions                       /registrations
│   ├── Paiements & remboursements         /payments
│   ├── Check-ins                          /check-ins
│   ├── Exposants & stands                 /exhibitors
│   └── Ingestion                          /ingestion
├── Analyse
│   ├── Analytics événements               /analytics/events
│   ├── Analytics revenus                  /analytics/revenue
│   ├── Analytics audience                 /analytics/audience
│   ├── Analytics exposants                /analytics/exhibitors
│   └── Analytics avancées (Should)        /analytics/advanced
├── Rapports
│   └── Rapports & exports                 /reports
└── Administration
    ├── Membres & rôles                    /admin/members
    ├── Paramètres de l'organisation       /admin/settings
    └── Journal d'audit                    /admin/audit
```

### 3.2 Règles de la sidebar

- Les sections vides pour le rôle courant sont entièrement masquées (pas de titre orphelin).
- L'item actif est visible avec fond `brand-100`, texte `brand-700` et bordure gauche `brand-600`.
- Les modules non autorisés ne sont jamais affichés, même désactivés : l'utilisateur ne doit pas découvrir un module inaccessible.
- Les modules `Should` sont identifiés par un badge discret « Bêta » ou « Optionnel » dans l'infobulle, pas dans le libellé principal.
- Le repli passe en icônes seules avec infobulles ; les sections deviennent des séparateurs.
- Sur mobile, la sidebar devient un panneau off-canvas déclenché par un bouton menu dans le header ; fermeture par overlay ou `Échap`.

### 3.3 Sous-navigation locale

| Écran | Onglets / sous-vues |
|---|---|
| Event Details | Vue d'ensemble · Participants · Inscriptions · Paiements · Check-ins · Exposants · Analytics |
| Participants | Liste · Doublons potentiels (OWNER/ADMIN) |
| Payments | Transactions · Remboursements |
| Exhibitors | Exposants · Stands · Réservations |
| Ingestion | Imports de fichiers · Jobs · Clés API (OWNER/ADMIN) |
| Analytics | Onglet actif dans la section Analyse, pas de sous-onglets |
| Admin Settings | Général · Exports & rétention · Clés API · Audit (lien) |

Les onglets sont reflétés dans l'URL (`?tab=...`) pour permettre le partage et le retour arrière.

---

## 4. Header

### 4.1 Composition (de gauche à droite)

1. Bouton menu (mobile/tablette).
2. **Breadcrumbs** (desktop) ou titre court (mobile).
3. **Sélecteur d'organisation** : nom + chevron ; liste des organisations accessibles ; option « Gérer » si OWNER/ADMIN.
4. **Sélecteur d'événement** : « Tous les événements » par défaut, recherche, événements récents, statut affiché ; limité au périmètre autorisé. Masqué sur les écrans où il n'a pas de sens (`/admin/*`, `/events/new`, `/organizations`).
5. **Menu utilisateur** : nom, email, rôle dans l'organisation active, « Paramètres du compte », « Changer d'organisation », « Se déconnecter ».

Aucune recherche globale n'est prévue en V1. Les recherches locales sont intégrées aux listes.

### 4.2 Règles des sélecteurs

- Le changement d'organisation recharge toutes les données et réinitialise le contexte événement.
- Le changement d'événement met à jour l'URL et recharge la vue courante sans perdre la période sélectionnée lorsque celle-ci reste valide.
- Un événement `DRAFT` ou `CANCELLED` n'est proposé qu'aux rôles autorisés (OWNER, ADMIN, EVENT_MANAGER assigné).
- Si un seul événement est accessible, le sélecteur reste affiché pour la clarté du contexte.
- Si aucun événement n'existe, le sélecteur affiche « Aucun événement » avec un lien de création pour les rôles autorisés.

---

## 5. Breadcrumbs

Format : `Organisation / Module / [Événement] / Entité`.

| Écran | Fil d'Ariane |
|---|---|
| Overview | `Organisation / Vue d'ensemble` |
| Events List | `Organisation / Événements` |
| Event Details | `Organisation / Événements / Nom de l'événement` |
| Create/Edit Event | `Organisation / Événements / Nouvel événement` ou `… / Modifier` |
| Participant Details | `Organisation / Participants / Nom du participant` |
| Registrations | `Organisation / Inscriptions` (événement dans le filtre, pas dans le fil) |
| Revenue Analytics | `Organisation / Analyse / Analytics revenus` |
| Admin | `Organisation / Administration / Membres & rôles` |

- Le dernier segment n'est pas cliquable.
- Les noms longs sont tronqués à 32 caractères avec infobulle.
- Au-delà de 4 niveaux, les niveaux intermédiaires sont regroupés dans un menu « … ».

---

## 6. Navigation par rôle

### 6.1 Principe

La navigation est **calculée à partir de la matrice Annexe A**, pas d'une liste statique. Le rôle est celui de l'utilisateur dans l'organisation active. Un utilisateur peut avoir des rôles différents selon l'organisation.

### 6.2 Visibilité des sections

| Section / écran | OWNER | ADMIN | EVENT_MANAGER | ANALYST | VIEWER |
|---|---|---|---|---|---|
| Vue d'ensemble | Oui | Oui | Oui | Oui | Oui |
| Événements (liste) | Oui | Oui | Oui (assignés) | Oui (publiés/archivés) | Oui (publiés/archivés) |
| Créer / modifier un événement | Oui | Oui | Oui (création auto-assignée ; édition assignés) | Non | Non |
| Participants | Oui (PII) | Oui (PII) | Oui (assignés, PII) | Non (agrégats via Analytics audience) | Non (agrégats via Analytics audience) |
| Inscriptions | Oui (PII) | Oui (PII) | Oui (assignés, PII) | Non (agrégats) | Non (agrégats) |
| Paiements & remboursements | Oui | Oui | Oui (assignés) | Non (agrégats via Analytics revenus) | Non |
| Check-ins | Oui | Oui | Oui (assignés) | Non (agrégats via Analytics événements) | Non (agrégats) |
| Exposants & stands | Oui | Oui | Oui (assignés) | Non (agrégats via Analytics exposants) | Non (agrégats) |
| Ingestion | Oui | Oui | Oui (assignés) | Non | Non |
| Analytics événements | Oui | Oui | Oui (assignés) | Oui | Oui (lecture) |
| Analytics revenus | Oui | Oui | Oui (assignés) | Oui (agrégats) | Oui (lecture seule) |
| Analytics audience | Oui | Oui | Oui | Oui (agrégats) | Oui (lecture) |
| Analytics exposants | Oui | Oui | Oui | Oui | Oui (lecture) |
| Analytics avancées (Should) | Oui | Oui | Non | Oui | Non |
| Rapports & exports | Oui | Oui | Oui (pseudonymisé) | Oui (pseudonymisé) | Non |
| Membres & rôles | Oui | Oui (hors OWNER) | Non | Non | Non |
| Paramètres organisation | Oui | Restreint | Non | Non | Non |
| Journal d'audit | Oui | Oui | Non | Non | Non |

### 6.3 Résumé par rôle

**OWNER** — accès complet, y compris attribution du rôle OWNER, paramètres critiques, exports non pseudonymisés, audit. Le dernier OWNER est protégé.

**ADMIN** — accès complet sauf : attribuer ou modifier un OWNER, rétrograder un OWNER, certaines actions critiques des paramètres. Exports non pseudonymisés.

**EVENT_MANAGER** — navigation opérationnelle limitée aux événements assignés ; création d'événement avec auto-assignation ; analytics sur son périmètre ; rapports et exports pseudonymisés ; aucune administration.

**ANALYST** — navigation analytique : Overview, Event Analytics, Revenue Analytics, Audience Analytics, Exhibitor Analytics, Advanced Analytics, Rapports (exports pseudonymisés). Aucun écran opérationnel nominatif, aucune PII, aucun drill-down PII, aucun accès administration. Les listes Participants/Inscriptions/Paiements/Check-ins/Exposants sont masquées.

**VIEWER** — lecture seule : Overview, Event Analytics, Revenue Analytics, Audience Analytics, Exhibitor Analytics, Events en lecture sur les événements publiés/archivés. Aucun export, aucune PII, aucune administration, filtres basiques et pas de drill-down détaillé. L'accès à Revenue Analytics est limité aux agrégats, sans aucune donnée nominative (arbitrage PO du 2026-11-18, voir §10.1).

### 6.4 Adaptations d'interface par permission

- Une action interdite n'est pas rendue cliquable : elle est absente, ou désactivée avec infobulle si son absence nuirait à la compréhension.
- Les colonnes PII sont absentes des tableaux pour ANALYST et VIEWER ; elles ne sont pas masquées visuellement côté client.
- Les exports sont absents pour VIEWER ; pour ANALYST et EVENT_MANAGER, le libellé indique « Export pseudonymisé ».
- Le menu utilisateur affiche le rôle dans l'organisation active pour éviter toute confusion.
- Un accès direct à une URL interdite affiche un état « Accès non autorisé » avec retour à l'écran autorisé le plus proche, sans révéler l'existence des données.

---

## 7. Parcours d'entrée et contexte

### 7.1 Connexion

```
Login réussi
├── 1 organisation  → /overview
├── N organisations → /organizations (sélection)
└── 0 organisation  → écran d'invitation requise / contact OWNER
```

### 7.2 Sélection d'organisation

- Affichée uniquement si l'utilisateur appartient à plusieurs organisations.
- Chaque carte affiche : nom, rôle, fuseau horaire, nombre d'événements accessibles (si disponible).
- L'organisation active est mémorisée pour la session ; un changement ultérieur passe par le sélecteur du header.
- L'URL `/organizations` reste accessible via le menu utilisateur.

### 7.3 Persistance du contexte

| Contexte | Persistance | Réinitialisation |
|---|---|---|
| Organisation active | Session + préférence locale | Déconnexion, changement d'organisation |
| Événement sélectionné | URL et état de page | Changement d'organisation, navigation hors module |
| Période analytique | URL (`from`, `to`) | Retour à la période par défaut du module |
| Filtres de liste | URL | Bouton « Réinitialiser » |
| Repli de la sidebar | Préférence locale | Jamais automatiquement |

---

## 8. Paramètres et profil

### 8.1 Menu utilisateur

- **Profil** : nom, email, rôle, organisation active. Modification du nom et du mot de passe uniquement (pas de gestion d'avatar en V1).
- **Préférences** : langue de l'interface (si implémentée), format de date, fuseau d'affichage personnel.
- **Changer d'organisation** → `/organizations`.
- **Se déconnecter** : confirmation si un formulaire non enregistré est ouvert.

### 8.2 Organisation Settings

Réservé OWNER (complet) et ADMIN (restreint) :
- Informations générales : nom, fuseau horaire, devise EUR (non modifiable).
- Exports & rétention : durée de rétention, notification avant expiration (Should).
- Clés API : création, rotation, révocation, scopes ; secret affiché une seule fois.
- Accès au journal d'audit.

---

## 9. Cartographie des écrans et routes

| # | Écran | Route | Contexte |
|---|---|---|---|
| 1 | Login | `/login` | Public |
| 2 | Sélection d'organisation | `/organizations` | Authentifié |
| 3 | Overview Dashboard | `/overview` | Organisation + période |
| 4 | Events List | `/events` | Organisation |
| 5 | Create/Edit Event | `/events/new`, `/events/:eventId/edit` | Organisation |
| 6 | Event Details | `/events/:eventId` | Événement |
| 7 | Participants List | `/participants` | Organisation + filtre événement |
| 8 | Participant Details | `/participants/:participantId` | Organisation |
| 9 | Registrations List | `/registrations` | Organisation + filtre événement |
| 10 | Payments & Refunds | `/payments` | Organisation + filtre événement |
| 11 | Check-ins | `/check-ins` | Événement requis |
| 12 | Exhibitors & Booths | `/exhibitors` | Événement recommandé |
| 13 | Event Analytics | `/analytics/events` | Organisation + événement(s) |
| 14 | Revenue Analytics | `/analytics/revenue` | Organisation + période |
| 15 | Audience Analytics | `/analytics/audience` | Organisation + période |
| 16 | Exhibitor Analytics | `/analytics/exhibitors` | Organisation + événement(s) |
| 17 | Reports & Exports | `/reports` | Organisation |
| 18 | Imports & Ingestion | `/ingestion` | Organisation + filtre événement |
| 19 | Users & Roles | `/admin/members` | Organisation |
| 20 | Organization Settings | `/admin/settings` | Organisation |

Écran complémentaire non listé comme écran principal : **Journal d'audit** (`/admin/audit`), accessible depuis Administration et depuis les Paramètres. Il est spécifié comme sous-vue dans SCREEN_SPECIFICATIONS.md.

---

## 10. Points de cohérence signalés

### 10.1 VIEWER et Revenue Analytics — résolu

- La **matrice Annexe A.9** autorise génériquement « Voir les dashboards » à VIEWER.
- Le **module 9 (PRD §12.3)** et **US-REV-01** ne listent pas VIEWER parmi les rôles de Revenue Analytics.
- **Arbitrage du Product Owner (2026-11-18) :** VIEWER peut consulter les dashboards, **y compris Revenue Analytics**, uniquement en **lecture seule**, sans PII, sans export et sans administration.
- **Traduction dans l'interface :** entrée de navigation visible ; KPI et graphiques agrégés affichés ; filtres basiques ; aucun drill-down détaillé ; aucune action d'export ; aucune colonne nominative.
- Les documents Phase 1 ne sont pas modifiés dans le cadre de la Phase 2 ; la précision devra être reportée dans une révision ultérieure de la Phase 1.

### 10.2 EVENT_MANAGER et Revenue Analytics

- PRD §12.3 indique « EVENT_MANAGER » sans qualifier ; US-REV-01 précise « assigné ».
- **Décision de conception :** appliquer « assigné » — un EVENT_MANAGER ne voit que les revenus de ses événements.

### 10.3 Analytics avancées

- Module Should. L'entrée de navigation est présente mais marquée optionnelle ; aucune autre partie de l'interface n'en dépend.
- Si le module n'est pas livré, l'entrée est simplement absente sans impact sur les autres écrans.

### 10.4 Temps réel

- Module Should, sans écran dédié. L'actualisation temps réel est un état des écrans Event Details et Event Analytics (indicateur « En direct »), pas un module de navigation.

### 10.5 Historique des exports

- Interface SHOULD. Elle est intégrée à l'écran Rapports & exports comme onglet secondaire ; le suivi backend reste obligatoire indépendamment de l'interface.

---

## 11. Traçabilité

| Élément | Source |
|---|---|
| Rôles et restrictions | PRD §9, Annexe A (Q-09) |
| Périmètre EVENT_MANAGER | PRD §11.1, Annexe A.2 |
| Modules et priorités | PRD §10 |
| Exports pseudonymisés | PRD §13.1, Annexe A.10 |
| Analytics avancées Should | PRD §12.6, §10 |
| Temps réel Should | PRD §13.2 |
| Audit OWNER/ADMIN | PRD §14, Annexe A.11 |

---

*Fin de INFORMATION_ARCHITECTURE.md — Version 1.0.*
