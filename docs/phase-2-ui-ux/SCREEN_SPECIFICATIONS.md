# SCREEN_SPECIFICATIONS.md — EventPulse Analytics

**Phase :** 2 — UI/UX Design Essentials

**Version :** 1.0

**Date :** 2026-11-18

**Référence :** `DESIGN_SYSTEM.md`, `INFORMATION_ARCHITECTURE.md`, `docs/PRD.md` v1.1, `docs/KPI_DEFINITIONS.md` v1.0, `docs/BUSINESS_RULES.md` v1.0

---

## 1. Conventions communes

### 1.1 Structure de page

```
[Header global : org · événement · breadcrumbs · utilisateur]
Titre de page + badge de statut + actions principales
[Barre de filtres]
[Contenu : cartes, graphiques, tableaux, formulaire]
[Pagination / pied de tableau]
```

- Un seul H1 par page.
- L'action primaire est unique ; les actions secondaires sont dans un menu.
- Les filtres sont visibles et réinitialisables.
- Les états de chargement utilisent des skeletons respectant la mise en page finale.
- Les erreurs de chargement sont locales à la zone concernée, avec bouton « Réessayer ».
- Les états vides expliquent la cause et proposent une action seulement si elle est autorisée.

### 1.2 Rôles — notation

`O` = OWNER, `A` = ADMIN, `EM` = EVENT_MANAGER (assigné), `AN` = ANALYST, `V` = VIEWER.
« Lecture » signifie consultation sans action de modification.

### 1.3 Règles de données

- Périodes analytiques : `[du, au)` ; affichage explicite de la borne de fin exclusive.
- `0` = valeur réelle nulle ; `N/A` = donnée indisponible ; « Non renseigné » = valeur déclarative absente.
- Aucun montant négatif n'est masqué : un Net Revenue négatif est affiché tel quel.
- Les tableaux financiers alignent les montants à droite.
- Les actions destructives demandent confirmation et nomment l'objet.

---

## 2. Spécifications des 20 écrans

### Écran 1 — Login

**Objectif :** authentifier un utilisateur disposant d'au moins un membership.
**Rôles :** public.

**Structure :** page centrée, panneau unique ≤ 420 px, logo, titre, formulaire, liens secondaires.

**Informations :** email, mot de passe, message d'erreur, mention de session sécurisée.

**Actions :** « Se connecter », « Mot de passe oublié ? », soumission par `Entrée`.

**Composants :** Input email, Input mot de passe avec affichage/masquage, Button primaire, alerte inline, lien.

**Filtres :** aucun.

**États :**
- Chargement : bouton en état loading, champs désactivés.
- Erreur d'identifiants : message générique « Email ou mot de passe incorrect » ; ne pas révéler l'existence du compte.
- Compte désactivé : « Accès suspendu. Contactez un administrateur. »
- Aucun membership : « Aucune organisation associée à ce compte. »
- Succès : redirection selon le nombre d'organisations (voir parcours 1).
- Verrouillage temporaire après tentatives répétées : message avec délai restant, si le backend l'expose.

**Accessibilité :** labels visibles, autocomplete `email` et `current-password`, focus initial sur l'email, erreurs reliées aux champs.

---

### Écran 2 — Sélection de l'organisation

**Objectif :** choisir l'organisation active lorsque l'utilisateur en possède plusieurs.
**Rôles :** tout utilisateur authentifié avec memberships multiples.

**Structure :** titre, sous-titre, grille de cartes (1–3 colonnes), lien « Se déconnecter ».

**Informations par carte :** nom, rôle dans l'organisation, fuseau horaire, nombre d'événements accessibles si disponible.

**Actions :** sélectionner une carte (clic ou `Entrée`) ; menu utilisateur pour se déconnecter.

**Composants :** Card interactive, Badge de rôle, Empty State.

**Filtres :** recherche locale si plus de 6 organisations.

**États :**
- Une seule organisation : écran non affiché, redirection directe vers `/overview`.
- Aucune organisation : état vide « Aucune organisation accessible » + instruction de contact.
- Organisation désactivée : carte non sélectionnable avec explication.
- Chargement : skeletons de cartes.

---

### Écran 3 — Overview Dashboard

**Objectif :** vue consolidée de la performance de l'organisation sur une période, avec comparaison.
**Rôles :** O, A, EM, AN, V (lecture).

**Structure :** barre de période et comparaison ; rangée de KPI cards ; grille de graphiques ; tableau des événements ; Recent Activity.

**Informations :**
- KPI cards : `KPI-REG-001` Confirmed Registrations, `KPI-REG-002` Registration Confirmation Rate, `KPI-PAR-001` Unique Participants, `KPI-REV-003` Gross Revenue, `KPI-REV-004` Total Refunds, `KPI-REV-005` Net Revenue, `KPI-EXH-004` Stand Occupancy Rate, `KPI-CHK-002` Attendance Rate.
- Graphiques : évolution des revenus (Ticket vs Booth empilés) ; évolution des inscriptions et présences ; répartition Ticket/Booth.
- Tableau des événements : nom, type, statut, dates, inscriptions confirmées, présence, brut, net, occupation.
- Recent Activity : inscriptions, check-ins, paiements, remboursements, réservations de stands ; limitée à l'organisation active, filtrée par permissions, sans PII pour AN/V.

**Actions :** changer la période, activer la comparaison, cliquer une KPI card pour ouvrir l'analyse correspondante (si autorisé), cliquer un événement pour ouvrir son détail.

**Composants :** KPI Card, Select période, Switch comparaison, LineChart/BarChart (Recharts), Table, Badge, Empty State, Tooltip d'infobulle KPI.

**Filtres :** période libre avec raccourcis (7 j, 30 j, ce mois, trimestre, année) ; comparaison à une période précédente de même longueur ; type d'événement ; statut d'événement (selon droits).

**États :**
- Période sans donnée : toutes les valeurs `N/A`, message « Aucune donnée sur cette période ».
- Organisation sans événement : Empty State avec CTA « Créer un événement » si O/A/EM.
- Données partielles : chaque carte gère son propre `N/A`.
- AN/V : Recent Activity sans noms ni emails ; V sans exports ni drill-down.
- Chargement : skeletons par carte et par graphique.

**Détail de disposition :**
```
[Période ▾] [Comparer à la période précédente ▾]
[KPI][KPI][KPI][KPI]
[KPI][KPI][KPI][KPI]
[Revenus : Ticket vs Booth — 8 col] [Répartition Ticket/Booth — 4 col]
[Inscriptions & présences — 8 col]   [Recent Activity — 4 col]
[Tableau des événements — 12 col]
```

---

### Écran 4 — Events List

**Objectif :** retrouver, filtrer et gérer les événements.
**Rôles :** O, A (tous) ; EM (assignés, création autorisée) ; AN, V (publiés/archivés en lecture).

**Structure :** titre + bouton « Créer un événement » (O/A/EM) ; barre de filtres ; tableau ; pagination.

**Informations :** nom, type, statut, dates de début/fin, fuseau, lieu, Event Manager(s), inscriptions confirmées, présence, occupation (si stands), dernière mise à jour.

**Actions :** créer ; ouvrir ; modifier (O/A/EM selon statut) ; transition de statut ; supprimer (O/A, DRAFT/CANCELLED uniquement) ; assigner un EM (O/A).

**Composants :** Table avec tri, Badge de statut, Dropdown d'actions de ligne, Button, filtres Select/date, Empty State.

**Filtres :** recherche par nom ; statut ; type ; période ; Event Manager (O/A) ; « Mes événements » (EM).

**États :**
- Aucun événement : Empty State (création si autorisé, sinon explicatif).
- Aucun résultat de filtre : « Aucun événement ne correspond aux filtres » + réinitialiser.
- DRAFT/CANCELLED invisibles pour AN/V.
- Événement archivé : actions d'édition masquées, badge « Archivé ».
- Suppression impossible : action absente avec explication dans le menu (statut non éligible).

**Règles visibles :** les transitions proposées dépendent du statut courant ; aucune transition inverse n'est affichée.

---

### Écran 5 — Create/Edit Event

**Objectif :** créer ou modifier un événement, configurer sa fenêtre de check-in.
**Rôles :** O, A ; EM (création avec auto-assignation, édition des événements assignés).

**Structure :** formulaire en sections sur une page ; barre d'actions collante (Annuler, Enregistrer le brouillon, Publier si DRAFT).

**Informations / champs :**
- Nom (obligatoire).
- Type : `EXHIBITION`, `CONFERENCE`, `WORKSHOP`, `TRADE_SHOW`, `OTHER` (obligatoire).
- Date/heure de début et de fin + fuseau horaire (obligatoires).
- Lieu (texte).
- Description (textarea).
- Fenêtre de check-in : offsets en minutes, défaut `-120` / `+120` autour du début et de la fin.
- Event Manager(s) : affichage en édition pour O/A ; auto-assignation en création par EM.
- Statut : lecture seule (géré par les actions de transition).

**Actions :** enregistrer brouillon ; publier (DRAFT) ; annuler ; changer d'onglet sans perte (avertissement si modifications non enregistrées).

**Composants :** Input, Select, Date/time picker, Textarea, Number input, fieldset, alerte de validation, Dialog de confirmation de publication.

**Filtres :** aucun.

**États :**
- Validation : nom requis ; type requis ; `start < end` ; fuseau valide ; offsets numériques cohérents.
- Publication : contrôle de complétude ; erreurs affichées en résumé + champs.
- Dates figées dès `ONGOING` : champs désactivés avec explication.
- Modification après publication : avertissement « Cette modification sera journalisée ».
- EM non assigné : accès refusé.
- Formulaire modifié + navigation : dialogue « Quitter sans enregistrer ? ».

**Règles :** BR-EVT-001 à BR-EVT-006 ; aucune création hors de ces statuts.

---

### Écran 6 — Event Details

**Objectif :** piloter un événement : informations, statut, KPI et accès à ses sous-modules.
**Rôles :** O, A ; EM (assignés) ; AN, V (événements publiés/archivés, lecture).

**Structure :** en-tête d'événement (nom, type, statut, dates, lieu, EM) ; barre d'actions ; résumé KPI ; onglets Vue d'ensemble / Participants / Inscriptions / Paiements / Check-ins / Exposants / Analytics.

**Informations :** identité de l'événement, fenêtre de check-in, fuseau, KPI clés (`REG-001`, `REG-002`, `CHK-002`, `CHK-003`, `REV-003`, `REV-005`, `EXH-004`), activité récente.

**Actions :** modifier ; publier ; démarrer ; terminer ; annuler ; archiver ; assigner un EM ; supprimer (DRAFT/CANCELLED, O/A) ; accéder aux modules.

**Composants :** header de page, Badge, Tabs, KPI Cards, Timeline de statut, Dropdown d'actions, Dialog de confirmation.

**Filtres :** période pour le résumé KPI ; aucun filtre sur l'en-tête.

**États :**
- Vue partielle selon rôle : onglets non autorisés absents.
- Événement CANCELLED : bandeau d'alerte, actions de transition limitées.
- Événement ARCHIVED : lecture seule, édition masquée.
- Aucune inscription : KPI `N/A`, CTA vers inscription si autorisé.
- Événement sans stand : onglet Exposants affiché avec Empty State, analytics exposants désactivées.
- Temps réel (Should) : indicateur « En direct » sur les KPI pendant ONGOING, sinon statique.

---

### Écran 7 — Participants List

**Objectif :** gérer les personnes rattachées à l'organisation et leurs inscriptions.
**Rôles :** O, A (PII) ; EM (assignés, PII). AN/V : aucun accès nominatif ; agrégats via Audience Analytics.

**Structure :** titre + bouton « Ajouter un participant » ; filtres ; tableau ; pagination.

**Informations :** nom, email, téléphone (optionnel), pays/ville (optionnels), nombre d'inscriptions, dernier événement, date de création.

**Actions :** ajouter ; ouvrir la fiche ; modifier ; fusionner (O/A) ; anonymiser/effacer (O/A) ; supprimer logiquement (O/A).

**Composants :** Table, Input de recherche, filtres, Badge, Dropdown, Dialog de fusion, Empty State.

**Filtres :** recherche nom/email ; événement ; source ; pays ; période de création.

**États :**
- Email identique : autorisé ; indication « Correspondance possible » sans blocage.
- Fusion : dialogue de comparaison champ par champ, confirmation explicite, résultat audité.
- Suppression : uniquement sans inscriptions actives ; sinon renvoyer vers l'anonymisation ou l'annulation.
- Aucun participant : Empty State.
- Aucun résultat : message + réinitialiser.
- AN/V : écran inaccessible ; ne pas afficher de tableau vide trompeur.

---

### Écran 8 — Participant Details

**Objectif :** consulter l'identité, les inscriptions et l'historique d'un participant.
**Rôles :** O, A (PII) ; EM (assignés, PII).

**Structure :** en-tête (nom, email, identifiant) ; actions ; cartes d'information ; onglets Inscriptions / Check-ins / Transactions / Exposants.

**Informations :** identité, coordonnées, champs démographiques optionnels (année de naissance, genre, pays/région/ville), inscriptions par événement avec statut, billets, check-ins, transactions liées, réservations d'exposant.

**Actions :** modifier ; fusionner (O/A) ; anonymiser (O/A) ; supprimer (O/A) ; ouvrir une inscription ou une transaction.

**Composants :** Card, Tabs, Table compacte, Badge, Timeline, Dialog destructif.

**Filtres :** événement dans les onglets.

**États :**
- Champs optionnels absents : « Non renseigné », jamais 0.
- Participant sans inscription : Empty State par onglet.
- Participant anonymisé : bandeau, données nominatives remplacées, historique conservé.
- Fusion : redirection vers la fiche fusionnée.

---

### Écran 9 — Registrations List

**Objectif :** suivre et gérer les inscriptions et leurs billets.
**Rôles :** O, A (PII) ; EM (assignés, PII). AN/V : agrégats uniquement via analytics.

**Structure :** titre + « Nouvelle inscription » ; filtres ; tableau ; pagination.

**Informations :** participant, événement, billet, statut, source, date d'inscription, montant de transaction liée (lecture), présence.

**Actions :** créer ; changer le statut selon transitions autorisées ; annuler ; modifier le billet ; supprimer (O/A, sans paiement ni check-in) ; ouvrir le participant ou la transaction.

**Composants :** Table, Badge, Dropdown de transitions, Dialog de confirmation, filtres.

**Filtres :** événement ; statut ; billet ; source ; période d'inscription ; présence.

**États :**
- Transition invalide : option absente.
- Annulation : confirmation indiquant qu'aucun remboursement automatique n'est déclenché.
- Inscription liée à un paiement/check-in : suppression absente, annulation seule.
- Aucune inscription : Empty State avec CTA.
- Conflit de statut (mise à jour concurrente) : message et rechargement de la ligne.

---

### Écran 10 — Payments & Refunds

**Objectif :** suivre les transactions et enregistrer les remboursements sans traitement bancaire réel.
**Rôles :** O, A ; EM (assignés, transitions limitées). AN : agrégats via Revenue Analytics. V : aucun accès.

**Structure :** titre ; KPI financiers compacts (`REV-001` à `REV-005`) ; onglets Transactions / Remboursements ; filtres ; tableau.

**Informations :** identifiant, type `TICKET`/`BOOTH`, référence (inscription ou réservation), montant original, devise EUR, statut, date de paiement, remboursements cumulés, reste remboursable.

**Actions :** créer une transaction ; faire évoluer le statut (selon rôle et transitions) ; enregistrer un remboursement ; ouvrir la référence ; exporter (pseudonymisé pour EM/AN, jamais pour V).

**Composants :** Tabs, KPI Cards, Table, Badge, Dialog de remboursement, formulaire de montant, filtres, Empty State.

**Filtres :** événement ; type ; statut ; période de paiement ou de remboursement ; montant.

**États :**
- Remboursement impossible : action absente si transaction non `PAID`/`PARTIALLY_REFUNDED`.
- Montant supérieur au reste remboursable : validation bloquante avec maximum affiché.
- Remboursement total : statut passe à `REFUNDED` après confirmation.
- Gross reste inchangé après remboursement : explication dans l'infobulle.
- Net négatif : affiché tel quel, sans correction.
- Aucune transaction : Empty State.

---

### Écran 11 — Check-ins

**Objectif :** enregistrer et suivre les présences sur site.
**Rôles :** O, A ; EM (assignés). AN/V : agrégats via Event Analytics.

**Structure :** événement requis dans l'en-tête ; actions « Check-in manuel » et « Importer CSV » ; KPI (`CHK-001`, `CHK-004`, `CHK-002`, `CHK-003`) ; filtres ; tableau de l'historique.

**Informations :** participant, inscription, billet, date/heure, résultat `VALID`/`INVALID`, motif, source, opérateur.

**Actions :** check-in manuel par recherche de participant/inscription ; import CSV ; correction par nouvelle opération (jamais de modification/suppression) ; ouvrir la fiche participant.

**Composants :** recherche avec résultats, Dialog de check-in, KPI Cards, Table, Badge, filtre de motif, alerte de résultat.

**Filtres :** résultat ; motif ; période ; source ; billet.

**États :**
- Inscription non `CONFIRMED` : check-in enregistré `INVALID` avec motif correspondant, message explicite.
- Doublon : `INVALID` / `DUPLICATE`, message « Ce participant est déjà enregistré ».
- Hors fenêtre : `INVALID` / `OUTSIDE_WINDOW`, affichage de la fenêtre autorisée.
- Participant/inscription/événement introuvable : motifs dédiés.
- Événement annulé : check-ins refusés avec motif `EVENT_CANCELLED`.
- Aucun check-in : Empty State + actions.

---

### Écran 12 — Exhibitors & Booths

**Objectif :** gérer les exposants, les stands et les réservations.
**Rôles :** O, A ; EM (assignés). AN/V : agrégats via Exhibitor Analytics.

**Structure :** titre ; onglets Exposants / Stands / Réservations ; filtres ; tableau ou grille ; actions.

**Informations :**
- Exposant : nom, contact, secteur, événements.
- Stand : numéro, zone, surface, statut, prix optionnel (EUR).
- Réservation : exposant, stand, date, statut `ACTIVE`/`RELEASED`, valeur.

**Actions :** créer/modifier un exposant ; créer/modifier un stand ; réserver ; libérer ; modifier le prix (O/A ; EM selon droits) ; supprimer logiquement (O/A).

**Composants :** Tabs, Table, Badge, Dialog de réservation, formulaire, Empty State.

**Filtres :** événement ; zone ; statut du stand ; statut de réservation.

**États :**
- Stand déjà réservé : action « Réserver » absente ; message de conflit si concurrence.
- Stand `UNAVAILABLE` : non réservable, exclu du dénominateur d'occupation (mention dans l'infobulle).
- Réservation libérée : historique conservé, stand repasse `AVAILABLE`.
- Valeur absente : « N/A », jamais 0 €.
- Aucun stand : onglet Stands en Empty State ; Analytics exposants affiche l'état « module indisponible pour cet événement ».

---

### Écran 13 — Event Analytics

**Objectif :** analyser un événement et comparer jusqu'à cinq événements.
**Rôles :** O, A, EM (assignés), AN (agrégats), V (lecture).

**Structure :** sélecteur d'événements (1 à 5) ; bandeau d'avertissement de comparaison ; KPI cards ; graphiques ; tableau de présence ; détail des check-ins invalides.

**Informations :**
- KPI : `REG-001`, `REG-002`, `CHK-001` à `CHK-005`, `REV-003`, `EXH-004`.
- Évolution des inscriptions et points de rupture.
- Présence : check-ins valides, invalides par motif, no-show.
- Taux internes : `CHK-002`, `CHK-003`.
- Comparaison : mêmes indicateurs, périodes homogènes.

**Actions :** choisir un ou plusieurs événements ; filtrer par statut ; afficher les données sous forme de tableau ; ouvrir le détail d'un événement ; exporter (si autorisé).

**Composants :** Multi-select (max 5), KPI Cards, LineChart, BarChart, Table, Badge, alerte, Tooltip.

**Filtres :** événement(s) ; statut ; période d'activité ; type.

**Comparaison :** jusqu'à 5 événements ; avertissement si types ou durées diffèrent ; `DRAFT` refusé ; périodes de même longueur.

**États :**
- Événement sans inscription : `N/A` et Empty State par graphique.
- Comparaison avec événement exclu : refus explicite, pas de résultat partiel silencieux.
- Aucun événement sélectionné : invitation à en choisir un.
- V : pas de drill-down, pas d'export, filtres basiques.
- AN : agrégats uniquement, aucun nominatif.

---

### Écran 14 — Revenue Analytics

**Objectif :** lire les revenus en séparant billets, stands, brut, remboursements et net.
**Rôles :** O, A ; EM (assignés) ; AN (agrégats) ; V (lecture seule, agrégats uniquement).

**Structure :** période + comparaison ; 5 KPI cards principales ; graphiques ; tableau par événement ; répartition par statut.

**Informations :**
- KPI : `REV-001` Ticket Revenue, `REV-002` Booth Revenue, `REV-003` Gross Revenue, `REV-004` Total Refunds, `REV-005` Net Revenue, `REV-006` Paid Tickets, `REV-007` Average Ticket Value, `REV-008` Transactions by Status.
- Évolution temporelle : Ticket vs Booth empilés, brut, remboursements, net.
- Tableau par événement : Ticket, Booth, Gross, Refunds, Net, transactions payées.

**Actions :** changer période ; comparer ; filtrer par événement/type ; afficher les données ; exporter (pseudonymisé pour EM/AN ; jamais pour V).

**Composants :** KPI Cards, AreaChart/BarChart, Table, Badge, Select période, Switch comparaison.

**Filtres :** période ; comparaison ; événement ; type de transaction.

**Infobulles :** formule exacte du KPI, période appliquée, distinction « Gross stable après remboursement », mention du Net négatif possible.

**États :**
- Aucune transaction : `N/A`, pas 0 €.
- Refunds > Gross sur la période : Net négatif affiché avec couleur danger et explication.
- Transaction partiellement remboursée : reste remboursable visible.
- `DRAFT` exclu.
- EM : uniquement ses événements.
- AN : agrégats, aucun identifiant de transaction nominatif.
- V : lecture seule, agrégats uniquement ; filtres basiques ; ni export, ni drill-down détaillé, ni PII.

---

### Écran 15 — Audience Analytics

**Objectif :** comprendre la composition, l'origine et la fidélité de l'audience.
**Rôles :** O, A, EM, AN (agrégats), V (lecture).

**Structure :** période ; KPI ; distributions démographiques ; géographie ; sources ; comportement de présence.

**Informations :**
- KPI : `PAR-001` Unique Participants, `PAR-002` Returning Attendee Rate, `AUD-001` Demographic Distribution, `AUD-002` Geographic Distribution, `AUD-003` Registration Source Distribution, `CHK-002`, `CHK-003`, `CHK-005`.
- Graphiques : barres par tranche d'âge, genre ; barres ou carte simple par pays/région ; répartition par source ; présents/no-show/récidivistes.

**Actions :** filtrer ; comparer deux périodes ; afficher les données ; exporter (si autorisé).

**Composants :** KPI Cards, BarChart, carte ou barres géographiques, Table, Badge « Non renseigné ».

**Filtres :** période ; événement(s) ; type d'événement ; source ; segment.

**États :**
- Valeurs inconnues : exclues du dénominateur, affichées séparément « Non renseigné ».
- Aucune valeur connue : `N/A`.
- Aucun participant : Empty State.
- Aucun nominatif pour AN/V.
- Échantillon faible : mention si le backend expose un seuil ; ne pas inventer de seuil en UI.

---

### Écran 16 — Exhibitor Analytics

**Objectif :** piloter l'occupation et la valeur des stands.
**Rôles :** O, A, EM, AN, V (lecture).

**Structure :** sélection d'événement(s) ; KPI ; graphiques d'occupation ; tableau par événement ; comparaison.

**Informations :**
- KPI : `EXH-001` Total Exhibitors, `EXH-002` Stands Booked, `EXH-003` Stand Booking Value, `EXH-004` Stand Occupancy Rate.
- Répartition réservés/disponibles/indisponibles.
- Valeur des réservations lorsque renseignée.

**Actions :** filtrer ; comparer ; afficher les données ; ouvrir l'événement.

**Composants :** KPI Cards, BarChart empilé, Table, Badge, Empty State.

**Filtres :** événement(s) ; zone ; période.

**États :**
- Événement sans stand : module désactivé pour cet événement avec message.
- Valeur absente : `N/A`, jamais 0 €.
- Dénominateur nul : `N/A`.
- Aucun exposant : Empty State.
- Aucune donnée de leads/scans : ne jamais afficher de KPI inexistant.

---

### Écran 17 — Reports & Exports

**Objectif :** générer les 5 rapports prédéfinis et suivre les exports.
**Rôles :** O, A ; EM, AN (pseudonymisé). V : non autorisé.

**Structure :** onglet « Générer » et onglet « Historique » (Should) ; formulaire de paramétrage ; suivi des jobs.

**Informations :**
- Rapports : Performance d'événement, Financier, Fréquentation, Exposants, Comparaison inter-événements.
- Paramètres : période, événements, KPI.
- Formats : PDF, Excel, CSV.
- Statuts : `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
- Historique : utilisateur, type, format, date, statut, période, organisation.

**Actions :** sélectionner un rapport ; paramétrer ; générer ; suivre le statut ; télécharger via URL signée ; réessayer en cas d'échec ; consulter l'historique.

**Composants :** Card de rapport, formulaire, Select multiples, Progress/Status badge, Table d'historique, Toast.

**Filtres :** historique par type, format, statut, période.

**États :**
- Génération asynchrone : statut et progression ; navigation possible sans bloquer.
- Succès : notification et lien de téléchargement ; URL valable 15 minutes.
- Échec : motif et bouton « Réessayer » ; conserver les paramètres.
- URL expirée : message « Export expiré » (HTTP 410), proposition de régénérer.
- EM/AN : mention « Contenu pseudonymisé » avant génération.
- Historique non implémenté (Should absent) : le backend reste source de vérité ; ne pas afficher de faux historique.

---

### Écran 18 — Imports & Ingestion

**Objectif :** importer des données CSV/Excel et suivre les jobs, gérer les clés API.
**Rôles :** O, A ; EM (imports sur événements assignés). Clés API : O/A uniquement.

**Structure :** onglets Imports / Jobs / Clés API ; zone de dépôt de fichier ; aperçu ; confirmation ; tableau des jobs.

**Informations :**
- Type d'import : participants, inscriptions, check-ins, paiements.
- Fichier, taille, lignes détectées, colonnes reconnues/inconnues.
- Stratégie de doublons : `SKIP`, `UPDATE`, `ERROR`.
- Aperçu obligatoire avant confirmation.
- Job : identifiant, statut, progression, lignes traitées, erreurs.
- Rapport d'erreurs par ligne avec motif.

**Actions :** télécharger le modèle ; déposer un fichier ; analyser ; prévisualiser ; confirmer ; annuler ; consulter le rapport d'erreurs ; créer/rotation/révoquer une clé API.

**Composants :** Dropzone, Table d'aperçu, Select de stratégie, Progress, Badge de statut, Table de jobs, Dialog de confirmation, alerte.

**Filtres :** type d'import ; statut du job ; période ; événement.

**États :**
- Format invalide : refus avant upload ou à l'analyse, message explicite.
- Aperçu non confirmé : import impossible.
- Fichier rejoué avec la même clé d'idempotence : aucun doublon, message « Import déjà traité ».
- Excel : option Should, absente si non livrée, sans bloquer le CSV.
- Job en cours : progression et sortie de page sans interruption.
- Erreurs partielles : lignes valides traitées selon stratégie, rapport détaillé.
- Clé API : secret affiché une seule fois, copie explicite, jamais réaffichable.
- EM : pas d'onglet Clés API.

---

### Écran 19 — Users & Roles

**Objectif :** gérer les memberships, invitations, rôles et états des comptes.
**Rôles :** O (complet) ; A (hors OWNER).

**Structure :** titre + « Inviter un membre » ; filtres ; tableau ; panneau de détail ou dialogue.

**Informations :** nom, email, rôle, statut (actif/invité/désactivé), date d'ajout, dernier accès, événements assignés (EM).

**Actions :** inviter (email + rôle) ; modifier le rôle ; désactiver/réactiver ; retirer un membre ; réinviter une invitation expirée.

**Composants :** Table, Badge de rôle/statut, Dialog d'invitation, Dropdown d'actions, alerte de gouvernance.

**Filtres :** rôle ; statut ; recherche email/nom.

**États :**
- Dernier OWNER : rétrogradation/suppression impossible, option désactivée avec explication.
- ADMIN ciblant un OWNER : actions absentes.
- Invitation en attente : badge et action de renvoi.
- Désactivation : confirmation ; les refresh tokens sont révoqués (message).
- Email déjà membre : erreur explicite.
- Rôle attribué : succès + mention « Action auditée ».
- Aucun membre hors OWNER : affichage normal.

---

### Écran 20 — Organization Settings

**Objectif :** configurer l'organisation, la rétention des exports et les clés API.
**Rôles :** O (complet) ; A (restreint). Journal d'audit accessible aux deux.

**Structure :** onglets Général / Exports & rétention / Clés API / (lien Audit).

**Informations :** nom de l'organisation, fuseau horaire, devise EUR (lecture seule), date de création, identifiant ; rétention des exports (30 jours par défaut) ; notification avant expiration (Should) ; clés API (nom, scopes, dernière utilisation, statut).

**Actions :** modifier le nom et le fuseau ; enregistrer ; configurer la rétention ; créer/rotation/révoquer une clé ; copier le secret une fois.

**Composants :** Tabs, formulaire, Input, Select, Card, Dialog de confirmation, Badge, Table de clés.

**Filtres :** aucun (ou recherche de clé).

**États :**
- ADMIN : champs critiques désactivés avec explication ; aucune action OWNER-only.
- Validation du fuseau : liste IANA, valeur obligatoire.
- Devise EUR : non modifiable, explication « V1 ».
- Rétention : valeur numérique positive, portée annoncée.
- Clé révoquée : inutilisable immédiatement, mention explicite.
- Secret : affiché une seule fois, avec avertissement de copie.
- Modifications : toast de succès et mention d'audit pour les actions sensibles.

---

### Sous-vue — Journal d'audit

**Objectif :** consulter les actions sensibles de l'organisation.
**Rôles :** O, A.

**Structure :** table chronologique (UTC), filtres, détail en drawer.

**Informations :** date/heure UTC, acteur, action, catégorie (6 catégories), cible, résultat `SUCCESS`/`FAILURE`, adresse IP si exposée, métadonnées bornées.

**Actions :** filtrer ; ouvrir le détail ; exporter si l'interface avancée (Should) est livrée.

**Filtres :** catégorie ; acteur ; résultat ; période ; recherche.

**États :**
- Aucun événement : Empty State.
- Métadonnées sensibles : jamais de secret, token, mot de passe ou PII inutile.
- Audit avancé Should absent : consultation basique uniquement.

---

## 3. Wireframes basse fidélité

### 3.1 Overview Dashboard

```
+----------------------------------------------------------------------------------+
| [≡] Org ▾ | Event ▾ | Org / Vue d'ensemble              [Période ▾] [User ▾]      |
+--------+-------------------------------------------------------------------------+
| Sidebar|  Vue d'ensemble                                    [Exporter] (si autorisé)|
|        |  +---------------------+ +---------------------+ +---------------------+ |
| Over.  |  | Confirmées          | | Taux confirmation   | | Participants uniq.  | |
| --     |  | 1 240    ▲ 8,2 %   | | 75,0 %   ▲ 2,1 pt  | | 980      ▲ 4,0 %   | |
| Gestion|  +---------------------+ +---------------------+ +---------------------+ |
| Events |  +---------------------+ +---------------------+ +---------------------+ |
| Partic.|  | Gross Revenue       | | Total Refunds       | | Net Revenue         | |
| Inscr. |  | 42 000 €  ▲ 5,0 %  | | 3 000 €  ▲ 1,0 %   | | 39 000 €  ▲ 5,4 %  | |
| Paiem. |  +---------------------+ +---------------------+ +---------------------+ |
| Check  |  +---------------------+ +---------------------+ +---------------------+ |
| Exhib. |  | Occupation stands   | | Attendance Rate     | | [comparaison]       | |
| Ingest.|  | 61,11 %   N/A       | | 70,0 %   ▲ 1,2 pt  | | vs période préc.    | |
|        |  +---------------------+ +---------------------+ +---------------------+ |
| Analyse|  +------------------------------------------+ +--------------------------+ |
| Events |  | Revenus : Ticket vs Booth (aires/barres) | | Répartition Ticket/Booth | |
| Revenue|  |                                          | |   (barres horizontales)  | |
| Audien.|  +------------------------------------------+ +--------------------------+ |
| Exhib. |  +------------------------------------------+ +--------------------------+ |
| Adv.   |  | Inscriptions & présences (lignes)        | | Recent Activity          | |
|        |  |                                          | | • Inscription ...        | |
| Rapports| |                                          | | • Check-in ...           | |
|        |  +------------------------------------------+ +--------------------------+ |
| Admin  |  +------------------------------------------------------------------------+ |
|        |  | Événements : Nom | Type | Statut | Dates | Confirmées | Prés. | Brut  | |
|        |  |             ... pagination ...                                     | |
|        |  +------------------------------------------------------------------------+ |
+--------+--------------------------------------------------------------------------+
```

---

### 3.2 Events List

```
+----------------------------------------------------------------------------------+
| Org ▾ | Event ▾ | Org / Événements                         [Créer un événement]   |
+--------+-------------------------------------------------------------------------+
| Sidebar|  Événements                                                             |
|        |  [Recherche nom........] [Statut ▾] [Type ▾] [Période ▾] [Réinitialiser]|
|        |  +------------------------------------------------------------------------+ |
|        |  | Nom            | Type       | Statut    | Dates          | EM  | Inscr.| |
|        |  |----------------|------------|-----------|----------------|-----|-------| |
|        |  | Salon Tech     | EXHIBITION | PUBLISHED | 12–14 mai 2026 | S.  | 1 240 | |
|        |  | Data Conf      | CONFERENCE | DRAFT     | 02–03 juin 2026| M.  | 0     | |
|        |  | Atelier UX     | WORKSHOP   | ONGOING   | 18 nov. 2026   | A.  | 80    | |
|        |  | ...                                                              [⋯]   | |
|        |  +------------------------------------------------------------------------+ |
|        |  Lignes 1–25 sur 48                                   [<] 1 2 [>]        |
+--------+--------------------------------------------------------------------------+
```

---

### 3.3 Event Details

```
+----------------------------------------------------------------------------------+
| Org ▾ | Event ▾ | Org / Événements / Salon Tech              [Actions ▾] [⋯]    |
+--------+-------------------------------------------------------------------------+
| Sidebar|  Salon Tech   [PUBLISHED]   EXHIBITION   12–14 mai 2026   Paris          |
|        |  Fenêtre check-in : 10:00–12:00 (J1) · Fuseau Europe/Paris · EM: S.     |
|        |  [Modifier] [Démarrer] [Annuler] [Archiver]                             |
|        |  +---------------------+ +---------------------+ +---------------------+ |
|        |  | Inscriptions conf.  | | Taux confirmation   | | Attendance Rate     | |
|        |  | 1 240               | | 75,0 %              | | 70,0 %              | |
|        |  +---------------------+ +---------------------+ +---------------------+ |
|        |  +---------------------+ +---------------------+ +---------------------+ |
|        |  | Gross / Net         | | Occupation stands   | | No-Show Rate        | |
|        |  | 42 000 € / 39 000 € | | 61,11 %             | | 30,0 %              | |
|        |  +---------------------+ +---------------------+ +---------------------+ |
|        |  [Vue d'ensemble] [Participants] [Inscriptions] [Paiements] [Check-ins]|
|        |  [Exposants] [Analytics]                                                |
|        |  +----------------------------------------+ +----------------------------+ |
|        |  | Évolution inscriptions (ligne)         | | Activité récente           | |
|        |  +----------------------------------------+ +----------------------------+ |
+--------+--------------------------------------------------------------------------+
```

---

### 3.4 Participants List

```
+----------------------------------------------------------------------------------+
| Org ▾ | Event ▾ | Org / Participants                    [Ajouter un participant] |
+--------+-------------------------------------------------------------------------+
| Sidebar|  Participants                                                           |
|        |  [Recherche nom ou email....] [Événement ▾] [Source ▾] [Pays ▾] [Reset] |
|        |  +------------------------------------------------------------------------+ |
|        |  | ☐ | Nom          | Email               | Ville   | Inscr. | Dernier év. | |
|        |  |---|--------------|---------------------|---------|--------|-------------| |
|        |  | ☐ | A. Martin    | a.martin@mail.com   | Paris   | 3      | Salon Tech  | |
|        |  | ☐ | L. Bernard   | l.bernard@mail.com  | Lyon    | 1      | Data Conf   | |
|        |  | ☐ | S. Petit     | s.petit@mail.com    | —       | 2      | Atelier UX  | |
|        |  | ...                                                              [⋯]   | |
|        |  +------------------------------------------------------------------------+ |
|        |  Lignes 1–25 sur 312                                  [<] 1 2 … [>]       |
|        |  Actions groupées : [Fusionner] (O/A)                                   |
+--------+--------------------------------------------------------------------------+
```

---

### 3.5 Revenue Analytics

```
+----------------------------------------------------------------------------------+
| Org ▾ | Event ▾ | Org / Analyse / Analytics revenus    [Période ▾] [Comparer ▾]  |
+--------+-------------------------------------------------------------------------+
| Sidebar|  Analytics revenus                                                      |
|        |  +-------------+ +-------------+ +-------------+ +-------------+         |
|        |  | Ticket Rev. | | Booth Rev.  | | Gross Rev.  | | Total Ref.  |         |
|        |  | 22 000 €    | | 20 000 €    | | 42 000 €    | | 3 000 €     |         |
|        |  +-------------+ +-------------+ +-------------+ +-------------+         |
|        |  +-------------+ +-----------------------------+ +---------------------+ |
|        |  | Net Revenue | | Évolution Brut / Refunds /  | | Transactions par    | |
|        |  | 39 000 €    | | Net (aires ou lignes)       | | statut (barres)     | |
|        |  +-------------+ +-----------------------------+ +---------------------+ |
|        |  +------------------------------------------------------------------------+ |
|        |  | Événement      | Ticket | Booth | Gross | Refunds | Net   | Payées    | |
|        |  | Salon Tech     | 22 000 | 20 000| 42 000| 3 000   |39 000 | 550       | |
|        |  | Data Conf      | 12 000 | 8 000 | 20 000| 500     |19 500 | 300       | |
|        |  +------------------------------------------------------------------------+ |
|        |  Infobulle KPI : formule, période, note « Gross stable après remboursement »|
+--------+--------------------------------------------------------------------------+
```

---

## 4. Parcours UX essentiels

### 4.1 Connexion et sélection de l'organisation

1. L'utilisateur ouvre `/login`, saisit email et mot de passe.
2. Validation locale : champs requis, format email ; erreurs inline.
3. Soumission : bouton loading, champs désactivés, pas de double soumission.
4. Succès :
   - 1 organisation → `/overview` ;
   - N organisations → `/organizations` ;
   - 0 organisation → écran explicatif.
5. Sur `/organizations`, sélection d'une carte → chargement des données de l'organisation → `/overview`.
6. Erreurs : identifiants invalides (message générique), compte désactivé, réseau (message + réessayer).
7. Expiration de session : au prochain appel, redirection vers `/login` avec conservation de l'URL cible ; après reconnexion, retour à l'écran demandé si autorisé.
8. Changement d'organisation via le header : confirmation si formulaire modifié ; réinitialisation du contexte événement.

**Confirmation :** déconnexion si formulaire non enregistré.

---

### 4.2 Création d'un événement

1. `/events` → « Créer un événement » (O/A/EM).
2. Formulaire vide : nom, type, début, fin, fuseau ; valeurs par défaut de fenêtre de check-in.
3. Validation :
   - nom et type requis ;
   - `start < end` ;
   - fuseau IANA valide ;
   - offsets numériques.
4. « Enregistrer le brouillon » → événement `DRAFT` → toast → fiche de l'événement.
5. « Publier » → dialogue de confirmation → validation de complétude → `PUBLISHED` → toast + entrée d'audit.
6. EM : auto-assignation visible dans l'en-tête ; aucune étape d'assignation supplémentaire.
7. Erreurs : résumé en haut + messages par champ ; focus sur le premier champ en erreur.
8. Navigation avec modifications : dialogue « Quitter sans enregistrer ? ».
9. Échec réseau : conserver les valeurs, proposer « Réessayer ».

**Règles :** transitions limitées ; dates modifiables en DRAFT/PUBLISHED, figées dès ONGOING.

---

### 4.3 Ajout d'un participant et création d'une inscription

1. Depuis `/participants` → « Ajouter un participant ».
2. Saisie : nom, email, téléphone et champs optionnels.
3. Si l'email correspond à un participant existant : indication « Correspondance possible » avec lien vers la fiche, sans blocage.
4. Enregistrement → fiche participant.
5. « Nouvelle inscription » depuis la fiche ou `/registrations`.
6. Sélection : événement, billet, statut initial (`PENDING` par défaut), source.
7. Validation : participant, événement et billet requis ; billet appartenant à l'événement.
8. Succès : inscription créée, toast, KPI mis à jour ; aucune transaction créée automatiquement.
9. Erreurs : transition invalide, billet supprimé, conflit ; message explicite.
10. Suppression d'inscription impossible si paiement ou check-in : seules l'annulation et, le cas échéant, le remboursement séparé sont proposés.

---

### 4.4 Enregistrement d'un paiement et d'un remboursement

1. `/payments` → « Nouvelle transaction ».
2. Sélection du type `TICKET` ou `BOOTH`, de la référence, du montant, devise EUR.
3. Validation : référence obligatoire, montant > 0, devise EUR, statut initial `PENDING`.
4. Passage à `PAID` selon les transitions autorisées ; date de paiement prise en compte dans Gross.
5. Remboursement : uniquement sur `PAID` ou `PARTIALLY_REFUNDED`.
6. Dialogue : montant, motif optionnel, reste remboursable affiché ; validation `montant ≤ reste`.
7. Confirmation → enregistrement du remboursement → statut `PARTIALLY_REFUNDED` ou `REFUNDED`.
8. Gross reste inchangé ; Net diminue ; message explicatif dans le dialogue et l'infobulle.
9. Erreurs : montant excessif, transaction non payée, cumul dépassé → refus sans écriture.
10. EM : transitions limitées ; suppression de transaction jamais disponible.

**Confirmation :** tout remboursement est confirmé explicitement avec le montant et la transaction concernée.

---

### 4.5 Réalisation d'un check-in

1. `/check-ins` avec événement sélectionné.
2. « Check-in manuel » → recherche par nom, email ou identifiant d'inscription.
3. Sélection du participant/inscription → vérification de l'événement, de l'inscription et de la fenêtre.
4. Résultat :
   - `VALID` → confirmation verte, heure enregistrée ;
   - `INVALID` → motif obligatoire affiché et expliqué.
5. Motifs : `OUTSIDE_WINDOW`, `DUPLICATE`, `REGISTRATION_CANCELLED`, `REGISTRATION_NOT_CONFIRMED`, `REGISTRATION_NOT_FOUND`, `PARTICIPANT_NOT_FOUND`, `EVENT_NOT_FOUND`, `EVENT_CANCELLED`.
6. Un doublon valide est refusé comme `INVALID`/`DUPLICATE`, avec l'heure du premier check-in.
7. Aucune suppression ni modification : une correction crée une nouvelle opération auditée.
8. Import CSV : aperçu, validation, rapport d'erreurs par ligne ; les check-ins invalides restent tracés.
9. Erreurs réseau : ne pas afficher un succès optimiste ; proposer de réessayer.

---

### 4.6 Import CSV

1. `/ingestion` → onglet Imports → choix du type.
2. Téléchargement du modèle et des règles de colonnes.
3. Dépôt du fichier (CSV Must ; Excel Should).
4. Analyse : encodage, séparateur, colonnes obligatoires, lignes détectées.
5. Aperçu obligatoire : 20 premières lignes, colonnes reconnues/inconnues, erreurs de schéma.
6. Choix de la stratégie de doublons : `SKIP`, `UPDATE`, `ERROR`.
7. Confirmation → création du job asynchrone (`PENDING`/`PROCESSING`).
8. Suivi : progression, lignes traitées, échecs ; navigation possible.
9. Fin : `COMPLETED` ou `FAILED`; rapport d'erreurs téléchargeable par ligne.
10. Rejeu : même clé d'idempotence → aucun doublon, message « Import déjà traité ».
11. Erreurs : fichier vide, format invalide, colonnes manquantes, encodage non UTF-8 → refus clair avant confirmation.

---

### 4.7 Consultation des analyses

1. Entrée par la sidebar ou par une KPI card.
2. Sélection de la période `[du, au)` et, si pertinent, de l'événement ou des événements.
3. Chargement des KPI et graphiques ; skeletons pendant le chargement.
4. Lecture :
   - `0` affiché comme valeur réelle ;
   - `N/A` affiché pour denominateur nul ou données absentes ;
   - « Non renseigné » pour les champs optionnels.
5. Comparaison : période précédente de même longueur ; avertissement si types/durées diffèrent.
6. Drill-down : selon rôle ; AN limité aux agrégats ; V sans drill-down détaillé.
7. Événement `DRAFT` : refusé dans les comparaisons et exclu des KPI.
8. Erreur de chargement : message local, bouton « Réessayer » ; les autres blocs restent visibles.
9. Export depuis l'analyse : ouvre le parcours 4.8 avec les paramètres courants.

---

### 4.8 Génération d'un export

1. `/reports` ou action « Exporter » d'un écran.
2. Choix du rapport/écran, période, événements, format PDF/Excel/CSV.
3. Pour EM/AN : mention obligatoire « Contenu pseudonymisé ».
4. Génération asynchrone : job créé, statut `PENDING` puis `PROCESSING`.
5. L'utilisateur peut quitter l'écran ; le job continue.
6. Succès : notification, lien « Télécharger » ; URL signée valable 15 minutes.
7. Échec : motif, paramètres conservés, bouton « Réessayer ».
8. URL expirée : message « Export expiré » (410) et proposition de régénérer.
9. V : aucune action d'export disponible.
10. Historique (Should) : filtres utilisateur/type/format/date/statut ; OWNER/ADMIN voient tous, EM/AN les leurs.
11. Rétention : 30 jours par défaut ; expiration annoncée et purge automatique côté serveur.

---

### 4.9 Gestion des membres et rôles

1. `/admin/members` → « Inviter un membre » (O/A).
2. Saisie email + rôle.
3. Validation : email valide, rôle autorisé pour l'invitant, email non déjà membre.
4. Envoi → invitation en attente, badge visible, action « Renvoyer ».
5. Modification de rôle : dialogue avec rôle actuel/nouveau ; confirmation.
6. Gouvernance :
   - dernier OWNER non modifiable ;
   - ADMIN ne peut pas modifier un OWNER ;
   - attribution OWNER réservée à OWNER.
7. Désactivation : confirmation ; révocation des refresh tokens ; historique conservé.
8. Toute modification est auditée : mention explicite et entrée dans le journal.
9. Erreurs : conflit de rôle, invitation expirée, action interdite → message clair, aucune modification partielle.
10. EM/AN/V : écran inaccessible.

---

## 5. Définition de « terminé » pour un écran

- Les 24 KPI affichés utilisent exclusivement les formules de `KPI_DEFINITIONS.md`.
- Les états `0`, `N/A` et « Non renseigné » sont distincts.
- Les actions affichées correspondent au rôle et aux transitions autorisées.
- Les états vide, chargement et erreur sont définis.
- La navigation clavier et les labels sont présents.
- La mise en page est utilisable à 1024 px et dégradée lisiblement à 768 px.
- Aucune fonctionnalité hors V1 n'est ajoutée.

---

## 6. Traçabilité

| Écran | Modules couverts | KPI | User Stories principales |
|---|---|---|---|
| Login / Org selection | Administration, Auth | — | US-AUTH-01 à 04 |
| Overview | 7 | REG-001/002, PAR-001, REV-003/004/005, EXH-004, CHK-002 | US-DASH-01/02 |
| Events | 1 | — | US-EVT-01 à 08 |
| Event Details | 1, 2, 3, 4, 5 | Sélection par onglet | US-EVT-02/03/04 |
| Participants | 2 | PAR-001 (via analytics) | US-PAR-01 à 04 |
| Registrations | 2 | REG-001/002 | US-REG-01/02, US-TIC-01 |
| Payments | 3 | REV-001 à 008 | US-PAY-01 à 04 |
| Check-ins | 4 | CHK-001 à 005 | US-CHK-01 à 04 |
| Exhibitors | 5 | EXH-001 à 004 | US-EXH-01 à 03 |
| Event Analytics | 8 | REG, CHK, REV-003, EXH-004 | US-EVA-01/02 |
| Revenue Analytics | 9 | REV-001 à 008 | US-REV-01 + arbitrage VIEWER (2026-11-18) |
| Audience Analytics | 10 | PAR-001/002, AUD-001 à 003, CHK-002/003/005 | US-AUD-01 |
| Exhibitor Analytics | 11 | EXH-001 à 004 | US-EXA-01 |
| Reports & Exports | 13 | Selon rapport | US-REP-01 à 04 |
| Ingestion | 6 | — | US-IMP-01 à 04 |
| Users & Roles | 15 | — | US-ORG-01 à 03 |
| Organization Settings | 15 | — | US-ORG-05/06 |
| Audit | 15 | — | US-ORG-07 |
| Advanced Analytics (Should) | 12 | Tous, filtres avancés | US-ADV-01 |
| Real-time (Should) | 14 | KPI temps réel | US-RT-01 |

---

*Fin de SCREEN_SPECIFICATIONS.md — Version 1.0.*
