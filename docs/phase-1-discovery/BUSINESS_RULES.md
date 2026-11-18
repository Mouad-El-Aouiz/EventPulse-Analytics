# BUSINESS_RULES.md — EventPulse Analytics

**Version :** 1.0 — Phase 1

**Statut :** Finalisé et validé — cohérent avec le PRD v1.1

**Date :** 2026-11-18

**Langue :** Français (identifiants et enums en anglais)

---

## 0. Conventions

- Identifiant : `BR-<DOMAINE>-<NNN>`.
- **Source** : chaque règle indique les décisions validées dont elle découle. Les règles marquées **« Complément de cadrage »** comblent un point non explicitement détaillé dans les validations ; elles sont listées dans `VALIDATION_REPORT.md` et ne modifient aucune décision validée.
- Les horodatages sont stockés en UTC.
- Les montants sont en EUR en V1 ; le champ `currency` est conservé.
- Les statuts, enums et noms techniques restent en anglais.
- En cas de contradiction entre ce document et le PRD, le PRD prévaut ; en cas de contradiction avec une décision validée, la décision validée prévaut.

---

## 1. Événements

### BR-EVT-001 — Statuts et transitions autorisées
- **Description :** un événement suit un cycle de vie strict.
- **Statuts :** `DRAFT`, `PUBLISHED`, `ONGOING`, `COMPLETED`, `ARCHIVED`, `CANCELLED`.
- **Transitions autorisées :**
  - `DRAFT → PUBLISHED | CANCELLED`
  - `PUBLISHED → ONGOING | CANCELLED`
  - `ONGOING → COMPLETED | CANCELLED`
  - `COMPLETED → ARCHIVED`
  - `CANCELLED` et `ARCHIVED` sont terminaux.
- **Contraintes :** aucune transition inverse, aucun saut d'étape ; une transition refusée ne modifie pas l'état ; la tentative est journalisée en cas d'échec.
- **Cas limites :** un événement `CANCELLED` ne peut plus être publié ; un `COMPLETED` ne peut pas être rouvert.
- **Impact KPI :** voir BR-KPI-003.
- **Source :** décision 5.2 (validée).

### BR-EVT-002 — Types d'événements
- **Description :** chaque événement possède exactement un type.
- **Valeurs :** `EXHIBITION`, `CONFERENCE`, `WORKSHOP`, `TRADE_SHOW`, `OTHER`.
- **Contraintes :** le type est obligatoire à la création immuable après passage `ONGOING` ; il peut être modifié en `DRAFT`/`PUBLISHED` avec audit.
- **Cas limites :** un `CONFERENCE` peut ne posséder aucun stand ; le module Exhibitor est alors désactivé pour cet événement.
- **Impact KPI :** les comparaisons inter-événements avertissent les types différents.
- **Source :** décision 5.2 (validée).

### BR-EVT-003 — Publication d'un événement
- **Description :** la transition `DRAFT → PUBLISHED` exige un événement complet.
- **Conditions :** nom non vide ; type renseigné ; `start_at < end_at` ; fuseau valide ; fenêtre de check-in cohérente.
- **Contraintes :** la publication est journalisée ; un `DRAFT` incomplet est refusé.
- **Cas limites :** aucune exigence de billet ni de stand pour publier.
- **Impact KPI :** un `DRAFT` reste exclu des KPI.
- **Source :** complément de cadrage.

### BR-EVT-004 — Soft delete des événements
- **Description :** suppression logique réservée aux événements sans valeur historique.
- **Conditions :** OWNER/ADMIN uniquement ; statut `DRAFT` ou `CANCELLED`.
- **Contraintes :** un `PUBLISHED` doit d'abord être annulé ; `ONGOING`, `COMPLETED` et `ARCHIVED` ne sont jamais supprimés ; l'action est auditée ; les données liées ne sont pas supprimées physiquement.
- **Cas limites :** un événement `DRAFT` avec des inscriptions existantes ne peut pas être supprimé.
- **Impact KPI :** aucun impact sur les KPI historiques.
- **Source :** décision 5.2 + H-06 (validées) + complément de cadrage.

### BR-EVT-005 — Modification des dates et du fuseau
- **Description :** les dates et le fuseau peuvent évoluer tant que l'événement n'a pas démarré.
- **Conditions :** modification autorisée en `DRAFT` et `PUBLISHED`.
- **Contraintes :** dates figées dès `ONGOING` ; toute modification après publication est auditée ; la fenêtre de check-in est recalculée sur les nouvelles dates.
- **Cas limites :** une date de fin antérieure à la date de début est refusée.
- **Impact KPI :** les KPI de présence event-scoped utilisent les dates de l'événement.
- **Source :** complément de cadrage.

### BR-EVT-006 — Fenêtre de check-in
- **Description :** chaque événement définit une fenêtre de validité des check-ins.
- **Conditions :** offsets en minutes autour de `start_at` et `end_at`.
- **Valeurs par défaut :** `check_in_opens_at = start_at − 120 min`, `check_in_closes_at = end_at + 120 min`.
- **Contraintes :** configurable en `DRAFT`/`PUBLISHED` ; figée dès `ONGOING` ; toute modification est auditée ; un check-in hors fenêtre est `INVALID` avec motif `OUTSIDE_WINDOW`.
- **Cas limites :** changement d'heure (DST) : la fenêtre est calculée en UTC sur les dates réelles ; tests dédiés obligatoires.
- **Impact KPI :** les check-ins hors fenêtre n'alimentent pas les KPI de présence.
- **Source :** Q-08, H-05 (validées).

---

## 2. Participants

### BR-PAR-001 — Identité et rattachement
- **Description :** un participant est rattaché à une organisation et identifié par un identifiant interne.
- **Conditions :** le participant ne peut être référencé que par des entités de la même organisation.
- **Contraintes :** l'identifiant interne fait foi ; le participant peut exister sans inscription.
- **Cas limites :** un même individu dans deux organisations produit deux participants distincts.
- **Impact KPI :** les participants uniques et le returning rate utilisent l'identifiant interne.
- **Source :** décision 5.3, H-02 (validées).

### BR-PAR-002 — Email non unique
- **Description :** l'email n'est pas une clé d'identité.
- **Conditions :** plusieurs participants peuvent partager le même email, avec ou sans normalisation.
- **Contraintes :** la normalisation de l'email sert uniquement à proposer des correspondances ; aucune fusion automatique n'est effectuée.
- **Cas limites :** deux emails différents pour la même personne restent deux participants tant qu'une fusion manuelle n'a pas eu lieu.
- **Impact KPI :** aucun comptage basé sur l'email.
- **Source :** décision 5.3, H-02 (validées).

### BR-PAR-003 — Fusion manuelle
- **Description :** regroupement de plusieurs participants en une identité conservée.
- **Conditions :** OWNER/ADMIN uniquement ; sélection explicite des participants et de l'identité conservée.
- **Contraintes :** fusion complète de toutes les références (inscriptions, check-ins, transactions) ; fusion partielle interdite ; fusion d'un participant anonymisé refusée ; opération auditée avec identifiants conservés et absorbés ; participants absorbés marqués fusionnés (soft delete).
- **Cas limites :** fusion de participants appartenant à des organisations différentes impossible.
- **Impact KPI :** les KPI historiques sont recalculés sur l'identité conservée ; aucune perte de référence.
- **Source :** Q-02 (validée) + complément de cadrage.

### BR-PAR-004 — Anonymisation et effacement
- **Description :** suppression des données personnelles à la demande ou après rétention.
- **Conditions :** OWNER/ADMIN ; workflow audité.
- **Contraintes :** anonymisation irréversible ; effacement définitif uniquement lorsque la contrainte légale est levée ; les données comptables sont conservées sous forme agrégée ; aucune suppression d'un participant lié à une transaction comptable n'efface la transaction.
- **Cas limites :** un participant anonymisé ne peut plus être fusionné ; son identifiant interne reste technique.
- **Impact KPI :** les agrégats historiques restent cohérents ; les dimensions PII deviennent « non renseigné ».
- **Source :** H-06 (validée).

### BR-PAR-005 — Champs optionnels et valeurs inconnues
- **Description :** les champs démographiques et géographiques sont optionnels.
- **Champs :** pays, région, ville, année de naissance, genre.
- **Contraintes :** une valeur inconnue n'est jamais convertie en 0, ni en valeur arbitraire ; elle est exclue des dénominateurs de pourcentage et reportée comme « non renseigné ».
- **Cas limites :** une date de naissance invalide est rejetée à la saisie ; l'année seule est conservée pour minimiser les PII.
- **Impact KPI :** voir KPI-AUD-001 et KPI-AUD-002.
- **Source :** H-09, H-14 (validées) + complément de cadrage.

---

## 3. Billets

### BR-TIC-001 — Billet rattaché à un événement
- **Description :** un billet appartient à un seul événement et porte un nom et un prix.
- **Contraintes :** devise EUR ; prix ≥ 0 ; un billet ne peut pas être partagé entre événements.
- **Cas limites :** un événement sans billet reste publiable mais ne peut pas recevoir d'inscription tant qu'aucun billet n'existe.
- **Impact KPI :** les transactions `TICKET` alimentent Ticket Revenue.
- **Source :** périmètre MUST « Gestion des billets » (validé) + complément de cadrage.

### BR-TIC-002 — Billet référencé
- **Description :** un billet utilisé ne peut pas être supprimé.
- **Conditions :** suppression autorisée uniquement si aucune inscription ne le référence.
- **Contraintes :** la modification du prix n'altère pas les transactions passées ; le montant est figé dans la transaction au moment de sa création.
- **Cas limites :** un billet référencé peut être retiré de la vente par un statut interne, sans suppression.
- **Impact KPI :** aucun recalcul rétroactif des revenus.
- **Source :** complément de cadrage.

### BR-TIC-003 — Absence de stock en V1
- **Description :** aucun quota, stock ou placement de siège n'est géré en V1.
- **Contraintes :** une inscription n'est pas bloquée par une capacité ; aucune notion de surréservation n'est calculée.
- **Cas limites :** une future gestion de capacité devra être ajoutée hors V1.
- **Impact KPI :** aucun KPI de taux de remplissage par capacité.
- **Source :** périmètre V1 (validé).

---

## 4. Inscriptions

### BR-REG-001 — Structure d'une inscription
- **Description :** une inscription relie exactement un participant, un billet et un événement.
- **Contraintes :** le billet doit appartenir à l'événement ; le participant et l'événement doivent appartenir à la même organisation ; une inscription sans billet est refusée.
- **Cas limites :** un participant peut avoir plusieurs inscriptions pour le même événement avec des billets différents ; aucune déduplication automatique n'est appliquée.
- **Impact KPI :** chaque inscription compte une fois dans les KPI d'inscriptions.
- **Source :** décision 5.3 (validée).

### BR-REG-002 — Statuts et transitions
- **Description :** une inscription suit un cycle de statut strict.
- **Statuts :** `PENDING`, `CONFIRMED`, `CANCELLED`, `WAITLISTED`.
- **Transitions :**
  - `PENDING → CONFIRMED | CANCELLED | WAITLISTED`
  - `WAITLISTED → CONFIRMED | CANCELLED`
  - `CONFIRMED → CANCELLED`
  - `CANCELLED` terminal.
- **Contraintes :** transition invalide refusée ; l'annulation après un check-in `VALID` est réservée à OWNER/ADMIN et auditée ; l'historique de check-in n'est pas modifié.
- **Cas limites :** une inscription `CANCELLED` ne peut pas redevenir `CONFIRMED` ; une inscription `PENDING` peut être mise en liste d'attente.
- **Impact KPI :** voir BR-KPI-002.
- **Source :** Q-03 (validée) + complément de cadrage pour les transitions.

### BR-REG-003 — Annulation distincte du remboursement
- **Description :** annuler une inscription et rembourser un paiement sont deux opérations indépendantes.
- **Contraintes :** l'annulation ne crée aucun remboursement ; le remboursement ne change pas le statut de l'inscription ; chaque opération est auditée séparément.
- **Cas limites :** une inscription annulée peut conserver une transaction `PAID` non remboursée.
- **Impact KPI :** les KPI d'inscriptions et les KPI financiers évoluent indépendamment.
- **Source :** décision 5.4 (validée).

### BR-REG-004 — Suppression d'une inscription
- **Description :** une inscription erronée peut être supprimée logiquement dans des cas limités.
- **Conditions :** OWNER/ADMIN ; aucune transaction liée ; aucun check-in lié.
- **Contraintes :** sinon, seule l'annulation est possible ; le soft delete est audité.
- **Cas limites :** une inscription annulée avec paiement reste consultable.
- **Impact KPI :** une inscription supprimée logiquement est exclue des KPI.
- **Source :** complément de cadrage.

---

## 5. Paiements et remboursements

### BR-PAY-001 — Statuts et transitions de transaction
- **Description :** une transaction suit un cycle strict.
- **Statuts :** `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `PARTIALLY_REFUNDED`, `REFUNDED`.
- **Transitions :**
  - `PENDING → PAID | FAILED | CANCELLED`
  - `PAID → PARTIALLY_REFUNDED`
  - `PARTIALLY_REFUNDED → PARTIALLY_REFUNDED | REFUNDED`
  - `PAID → REFUNDED` en cas de remboursement total immédiat
  - `FAILED` et `CANCELLED` terminaux.
- **Contraintes :** toute modification manuelle de statut doit respecter ces transitions et être auditée ; une transaction rejoint `PAID` au plus une fois.
- **Cas limites :** une transaction `FAILED` ne peut pas être remboursée.
- **Impact KPI :** Gross Revenue repose sur les transactions ayant atteint `PAID`.
- **Source :** Q-04 (validée) + complément de cadrage pour les transitions.

### BR-PAY-002 — Plafond de remboursement cumulé
- **Description :** la somme des remboursements d'une transaction ne dépasse jamais son montant payé.
- **Contraintes :** vérification atomique au moment de l'enregistrement ; dépassement refusé.
- **Cas limites :** deux remboursements partiels concurrents sont sérialisés ; le cumul reste ≤ montant payé.
- **Impact KPI :** Total Refunds et Net Revenue restent cohérents.
- **Source :** décision 5.4 (validée).

### BR-PAY-003 — Gross Revenue historiquement stable
- **Description :** le montant original d'une transaction `PAID` ne change jamais.
- **Contraintes :** un remboursement ne modifie pas le montant original ; aucune écriture ne réécrit l'historique.
- **Cas limites :** une correction de montant nécessite une nouvelle transaction et une annulation de l'ancienne, toutes deux auditées.
- **Impact KPI :** Gross Revenue et Ticket/Booth Revenue restent stables.
- **Source :** décision 5.4, H-03 (validées).

### BR-PAY-004 — Remboursement rattaché au type d'origine
- **Description :** un remboursement est toujours associé à sa transaction d'origine.
- **Contraintes :** le type `TICKET`/`BOOTH` est déduit de la transaction ; aucun remboursement orphelin n'est autorisé.
- **Cas limites :** un remboursement de stand ne peut pas être imputé à un billet.
- **Impact KPI :** les remboursements se répartissent correctement entre les revenus billets et stands.
- **Source :** Q-05 (validée).

### BR-PAY-005 — Remboursement uniquement sur transaction payée
- **Description :** seules les transactions `PAID` ou `PARTIALLY_REFUNDED` peuvent être remboursées.
- **Contraintes :** `PENDING`, `FAILED` et `CANCELLED` sont refusés.
- **Cas limites :** une transaction `REFUNDED` ne peut plus recevoir de remboursement.
- **Impact KPI :** Total Refunds ne contient que des remboursements valides.
- **Source :** décision 5.4 (validée) + complément de cadrage.

### BR-PAY-006 — Net Revenue
- **Description :** Net Revenue = Gross Revenue − Total Refunds.
- **Contraintes :** Gross et Refunds sont filtrés selon leurs dates respectives (paiement / remboursement) ; Net peut être négatif sur une période et est affiché tel quel.
- **Cas limites :** aucun plancher artificiel à 0.
- **Impact KPI :** KPI-REV-005.
- **Source :** décision 5.4 (validée).

### BR-PAY-007 — Absence de traitement bancaire réel
- **Description :** les paiements sont suivis, jamais exécutés.
- **Contraintes :** aucune intégration bancaire, aucune conformité PCI en V1.
- **Cas limites :** le statut `PAID` est un enregistrement métier, pas une confirmation bancaire.
- **Impact KPI :** les revenus reflètent les enregistrements internes.
- **Source :** décision 5.4, périmètre WON'T (validés).

### BR-PAY-008 — Modification manuelle auditée
- **Description :** toute modification manuelle du statut d'une transaction est journalisée.
- **Conditions :** rôles autorisés par la matrice ; transitions valides uniquement.
- **Contraintes :** l'audit contient acteur, ressource, ancien/nouveau statut (dans les métadonnées bornées) et résultat.
- **Cas limites :** une tentative refusée est journalisée en échec.
- **Impact KPI :** traçabilité des écarts financiers.
- **Source :** Q-12 (validée).

### BR-PAY-009 — Devise EUR
- **Description :** la V1 ne gère qu'une devise.
- **Contraintes :** toutes les transactions et remboursements sont en EUR ; le champ `currency` est conservé et validé à `EUR`.
- **Cas limites :** une devise différente est rejetée.
- **Impact KPI :** aucune conversion, aucun agrégat multi-devises.
- **Source :** H-04 (validée).

---

## 6. Check-ins

### BR-CHK-001 — Fenêtre de validité
- **Description :** un check-in n'est valide que dans la fenêtre de l'événement.
- **Contraintes :** fenêtre définie par BR-EVT-006 ; calcul en UTC ; comparaison incluant les bornes.
- **Cas limites :** DST géré par les dates UTC ; tests dédiés.
- **Impact KPI :** seuls les check-ins `VALID` alimentent la présence.
- **Source :** Q-08 (validée).

### BR-CHK-002 — Vérifications d'existence
- **Description :** chaque check-in vérifie le participant, l'inscription et l'événement.
- **Contraintes :** entités de la même organisation ; inscription liée à l'événement ; participant lié à l'inscription.
- **Cas limites :** une référence croisée entre organisations est rejetée comme introuvable.
- **Impact KPI :** aucun check-in orphelin.
- **Source :** décision 5.5 (validée).

### BR-CHK-003 — Éligibilité
- **Description :** seule une inscription `CONFIRMED` peut produire un check-in `VALID`.
- **Contraintes :** `PENDING` → `INVALID` (`REGISTRATION_NOT_CONFIRMED`) ; `WAITLISTED` → `INVALID` (`REGISTRATION_NOT_CONFIRMED`) ; `CANCELLED` → `INVALID` (`REGISTRATION_CANCELLED`) ; événement `CANCELLED` → `INVALID` (`EVENT_CANCELLED`).
- **Cas limites :** une inscription confirmée après un check-in invalide peut générer un nouveau check-in valide.
- **Impact KPI :** seules les présences éligibles sont comptées.
- **Source :** décision 5.5 + validation utilisateur du 2026-11-17 (complément confirmé).

### BR-CHK-004 — Motifs obligatoires
- **Description :** tout check-in `INVALID` porte un motif.
- **Valeurs :** `OUTSIDE_WINDOW`, `DUPLICATE`, `REGISTRATION_CANCELLED`, `REGISTRATION_NOT_CONFIRMED`, `REGISTRATION_NOT_FOUND`, `PARTICIPANT_NOT_FOUND`, `EVENT_NOT_FOUND`, `EVENT_CANCELLED`.
- **Contraintes :** un check-in `VALID` ne porte pas de motif d'invalidité ; le motif est immuable.
- **Cas limites :** plusieurs causes possibles → priorité de motif documentée : existence participant, existence événement, existence inscription, statut, fenêtre, doublon.
- **Impact KPI :** les statistiques d'invalidité par motif sont fiables.
- **Source :** décision 5.5 (validée) + complément `EVENT_CANCELLED`.

### BR-CHK-005 — Doublons
- **Description :** un participant ne peut avoir qu'un check-in `VALID` par événement.
- **Contraintes :** si un check-in `VALID` existe déjà pour le couple participant/événement, le nouveau est `INVALID` (`DUPLICATE`).
- **Cas limites :** un check-in `INVALID` antérieur n'empêche pas un check-in `VALID` ultérieur.
- **Impact KPI :** aucun double comptage de présence.
- **Source :** décision 5.5 (validée).

### BR-CHK-006 — Historique immuable
- **Description :** les check-ins ne sont ni modifiés ni supprimés.
- **Contraintes :** une correction crée une nouvelle opération auditée ; l'opération d'origine reste visible ; aucun rôle ne peut supprimer un check-in.
- **Cas limites :** une erreur de saisie est compensée par une nouvelle opération, jamais par une réécriture.
- **Impact KPI :** l'historique reste auditable.
- **Source :** décision 5.5 (validée) + complément de cadrage.

### BR-CHK-007 — Sources et imports
- **Description :** les check-ins proviennent de la saisie manuelle, d'un import CSV ou de l'endpoint d'ingestion.
- **Contraintes :** un import CSV est validé, prévisualisé et traité de façon asynchrone ; chaque ligne produit un résultat `VALID` ou `INVALID` avec motif ; le rapport d'erreurs est consultable ; l'import est idempotent.
- **Cas limites :** une ligne dupliquée dans le même fichier ne crée qu'un seul check-in valide ; les suivantes sont `INVALID` (`DUPLICATE`).
- **Impact KPI :** les présences importées suivent les mêmes règles que la saisie manuelle.
- **Source :** décision 5.5, Q-06, H-08 (validées).

---

## 7. Exposants et stands

### BR-EXH-001 — Exposant et réservations multiples
- **Description :** un exposant est rattaché à une organisation et peut réserver plusieurs stands.
- **Contraintes :** les réservations d'un exposant peuvent concerner plusieurs événements ; chaque réservation est unique.
- **Cas limites :** un exposant sans réservation reste gérable mais n'apparaît pas dans les KPI d'occupation.
- **Impact KPI :** nombre d'exposants actifs (KPI-EXH-001).
- **Source :** décision 5.6 (validée).

### BR-EXH-002 — Attributs du stand
- **Description :** un stand est une entité physique rattachée à un événement.
- **Attributs :** identifiant, numéro/code, surface, zone, statut, prix optionnel, devise EUR.
- **Contraintes :** numéro/code unique par événement ; surface ≥ 0 ; prix ≥ 0 si renseigné.
- **Cas limites :** un stand sans prix reste réservable ; sa valeur n'est pas comptée comme 0 €.
- **Impact KPI :** occupation et valeur des réservations.
- **Source :** décision 5.6 (validée) + complément de cadrage.

### BR-EXH-003 — Une seule réservation active par stand et par événement
- **Description :** un stand ne peut être réservé que par un seul exposant à la fois pour un événement donné.
- **Contraintes :** contrainte d'unicité en base sur la réservation active ; les réservations libérées restent dans l'historique ; une tentative concurrente échoue sans créer de doublon.
- **Cas limites :** deux requêtes simultanées → une seule réussit ; l'autre reçoit un conflit explicite.
- **Impact KPI :** le nombre de stands réservés est exact.
- **Source :** décision 5.6 (validée).

### BR-EXH-004 — Statuts du stand
- **Description :** un stand possède un statut.
- **Valeurs :** `AVAILABLE`, `RESERVED`, `UNAVAILABLE`.
- **Contraintes :** `RESERVED` est la conséquence d'une réservation active ; `UNAVAILABLE` ne peut pas être réservé et est exclu du dénominateur d'occupation ; un stand avec réservation active ne peut pas passer `UNAVAILABLE` sans libération préalable.
- **Cas limites :** libération → `AVAILABLE` sauf si marqué indisponible ensuite.
- **Impact KPI :** KPI-EXH-004.
- **Source :** décision 5.6 (validée) + complément de cadrage.

### BR-EXH-005 — Valeur de réservation et transaction BOOTH
- **Description :** la valeur d'une réservation est optionnelle.
- **Contraintes :** lorsqu'elle est renseignée, elle peut être rattachée à une transaction `BOOTH` ; le montant de la transaction est figé ; une modification ultérieure du prix du stand n'altère pas la transaction passée.
- **Cas limites :** une réservation sans valeur n'alimente pas les KPI de valeur mais compte dans l'occupation.
- **Impact KPI :** Booth Revenue et valeur des réservations.
- **Source :** décision 5.6, Q-05 (validées).

### BR-EXH-006 — Libération et historique
- **Description :** libérer un stand clôt la réservation active.
- **Contraintes :** la réservation passe `RELEASED` avec date ; l'historique est conservé ; une nouvelle réservation peut alors être créée.
- **Cas limites :** une libération est auditée ; une réactivation de la même réservation n'est pas permise (nouvelle réservation).
- **Impact KPI :** les KPI d'occupation ne comptent que les réservations actives.
- **Source :** complément de cadrage.

---

## 8. Organisations, rôles et confidentialité

### BR-ORG-001 — Membership et organisation active
- **Description :** un utilisateur appartient à une ou plusieurs organisations via un membership.
- **Contraintes :** un seul rôle par membership ; l'organisation active est choisie après authentification ; le changement d'organisation renouvelle le contexte d'accès.
- **Cas limites :** un utilisateur sans membership actif ne peut accéder à aucune donnée métier.
- **Impact KPI :** tous les KPI sont scopés à l'organisation active.
- **Source :** H-01 (validée).

### BR-ORG-002 — Vérification backend des permissions
- **Description :** chaque endpoint et service métier vérifie les permissions.
- **Contraintes :** l'interface ne fait que masquer des actions déjà interdites par le backend ; aucun contrôle uniquement côté client.
- **Cas limites :** un appel direct à l'API avec un rôle insuffisant retourne 403.
- **Impact KPI :** aucun KPI exposé à un rôle non autorisé.
- **Source :** décision 5.7 (validée).

### BR-ORG-003 — Isolation multi-organisation
- **Description :** aucune donnée d'une organisation n'est accessible à une autre.
- **Contraintes :** chaque requête est filtrée par `organization_id` actif ; les références croisées sont rejetées ; tests cross-org obligatoires en CI.
- **Cas limites :** un identifiant valide d'une autre organisation est traité comme introuvable.
- **Impact KPI :** aucun agrégat inter-organisations.
- **Source :** décision 5.1 (validée).

### BR-ORG-004 — Dernier OWNER
- **Description :** une organisation conserve toujours au moins un OWNER.
- **Contraintes :** suppression et rétrogradation du dernier OWNER refusées.
- **Cas limites :** le transfert de propriété doit précéder une rétrogradation.
- **Impact KPI :** aucun.
- **Source :** matrice / gouvernance (validée — Q-09, 2026-11-18).

### BR-ORG-005 — ADMIN et OWNER
- **Description :** un ADMIN ne peut pas modifier un OWNER.
- **Contraintes :** un ADMIN ne peut pas attribuer le rôle OWNER, ni rétrograder un OWNER, ni supprimer un OWNER.
- **Cas limites :** seul un OWNER peut nommer un autre OWNER.
- **Impact KPI :** aucun.
- **Source :** matrice / gouvernance (validée — Q-09, 2026-11-18).

### BR-ORG-006 — Matrice action × rôle
- **Description :** la matrice Annexe A du PRD est la référence des autorisations.
- **Contraintes :** elle est appliquée côté backend ; elle a été approuvée le 2026-11-18 (Q-09).
- **Cas limites :** en cas de doute, le principe le plus restrictif s'applique.
- **Impact KPI :** accès aux agrégats et exports.
- **Source :** Q-09 (matrice approuvée le 2026-11-18).

### BR-ORG-007 — Confidentialité des données personnelles
- **Description :** l'accès aux PII est restreint selon le rôle.
- **Contraintes :** ANALYST et VIEWER n'accèdent jamais aux PII ; les exports ANALYST sont pseudonymisés ; les EVENT_MANAGER accèdent aux PII de leurs événements assignés ; les exports d'EVENT_MANAGER sont pseudonymisés par défaut.
- **Cas limites :** un drill-down ne contourne jamais ces restrictions.
- **Impact KPI :** les KPI restent agrégés pour les rôles non autorisés.
- **Source :** Q-11, H-09 (validées).

---

## 9. Ingestion

### BR-IMP-001 — Sources d'ingestion V1
- **Description :** la V1 accepte trois sources.
- **Sources :** saisie back-office, imports de fichiers, endpoint d'ingestion simulé.
- **Contraintes :** aucun visiteur du site web n'est ingéré ; aucun KPI de conversion web.
- **Cas limites :** les imports et l'endpoint alimentent les mêmes règles métier que la saisie manuelle.
- **Impact KPI :** tous les KPI sont alimentés de façon homogène.
- **Source :** décision 5.1 (validée).

### BR-IMP-002 — Traitement asynchrone
- **Description :** les imports volumineux sont traités par BullMQ.
- **Contraintes :** statuts `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` ; reprise sur erreur ; idempotence.
- **Cas limites :** un job interrompu reprend sans double application.
- **Impact KPI :** les données ne sont comptées qu'après traitement réussi.
- **Source :** Q-06 (validée).

### BR-IMP-003 — Aperçu, validation et rapport d'erreurs
- **Description :** tout import de fichier est validé avant application.
- **Contraintes :** aperçu obligatoire ; validation de schéma et de type ; rapport d'erreurs par ligne ; confirmation explicite.
- **Cas limites :** un fichier entièrement invalide ne crée aucun enregistrement.
- **Impact KPI :** aucune donnée partielle non signalée.
- **Source :** périmètre MUST ingestion (validé).

### BR-IMP-004 — Idempotence déterministe
- **Description :** un même import rejoué ne crée aucun doublon.
- **Contraintes :** clé = hash déterministe du contenu + organisation + type d'import + version de schéma ; **aucun timestamp** ; la clé peut aussi être fournie par le client pour l'endpoint.
- **Cas limites :** un fichier modifié produit une nouvelle clé et est traité comme un nouvel import.
- **Impact KPI :** aucun double comptage.
- **Source :** Q-06, H-08 (validées) + correction de l'incohérence v1.0.

### BR-IMP-005 — Gestion des doublons
- **Description :** l'utilisateur choisit la stratégie de doublon.
- **Valeurs :** `SKIP` (ignorer), `UPDATE` (mettre à jour), `ERROR` (rejeter et signaler).
- **Contraintes :** la stratégie est appliquée de façon cohérente sur tout le fichier ; le rapport final indique le nombre d'ignorés, mis à jour et rejetés.
- **Cas limites :** un doublon détecté dans le même fichier suit la même stratégie.
- **Impact KPI :** aucun double comptage.
- **Source :** périmètre MUST ingestion (validé) + complément de cadrage.

### BR-IMP-006 — Audit des ingestions
- **Description :** chaque import ou appel d'endpoint est journalisé.
- **Contraintes :** catégorie « Ingestion » ; référence au fichier ou à l'appel, statut final, volumétrie, acteur ou API key (fingerprint).
- **Cas limites :** un rejet d'authentification est journalisé en échec.
- **Impact KPI :** traçabilité complète.
- **Source :** Q-12 (validée).

### BR-IMP-007 — Endpoint d'ingestion et API keys
- **Description :** l'endpoint est authentifié par API key d'organisation.
- **Contraintes :** scope `ingestion:write` obligatoire ; clés hashées ; jamais stockées ni journalisées en clair ; création, rotation et révocation par OWNER/ADMIN ; appels limités aux payloads inscriptions, check-ins et paiements.
- **Cas limites :** une clé révoquée ou expirée est rejetée sans traitement.
- **Impact KPI :** aucune donnée ingérée sans autorisation.
- **Source :** H-11, Q-12 (validées) + validation utilisateur du 2026-11-17.

---

## 10. Exports et rapports

### BR-EXP-001 — Rétention des exports
- **Description :** les exports sont conservés 30 jours par défaut.
- **Contraintes :** durée configurable par organisation ; configuration réservée à OWNER/ADMIN ; stockage privé.
- **Cas limites :** une réduction de rétention accélère la purge des exports existants.
- **Impact KPI :** aucun.
- **Source :** Q-14, H-10 (validées).

### BR-EXP-002 — URL signée et expiration
- **Description :** le téléchargement passe par une URL signée temporaire.
- **Contraintes :** expiration par défaut 15 minutes ; URL non réutilisable après expiration ; export expiré → HTTP 410 Gone.
- **Cas limites :** une URL partagée reste limitée dans le temps.
- **Impact KPI :** aucun.
- **Source :** Q-14 (validée) + complément de cadrage.

### BR-EXP-003 — Purge automatique
- **Description :** les exports expirés sont supprimés par un worker BullMQ.
- **Contraintes :** purge planifiée quotidiennement par défaut ; fichier supprimé et statut mis à jour.
- **Cas limites :** un export en cours de téléchargement dont l'URL expire est refusé au prochain accès.
- **Impact KPI :** aucun.
- **Source :** Q-14 (validée) + complément de cadrage.

### BR-EXP-004 — Pseudonymisation ANALYST
- **Description :** tous les exports ANALYST sont pseudonymisés par défaut.
- **Contraintes :** aucune PII brute ; identifiants pseudonymes stables dans l'export ; pas de réidentification côté client.
- **Cas limites :** un export demandé par un OWNER pour un Analyst reste pseudonymisé.
- **Impact KPI :** exports agrégés et pseudonymisés.
- **Source :** Q-11, H-09 (validées).

### BR-EXP-005 — Suivi des exports vs interface d'historique
- **Description :** le suivi technique des exports est obligatoire ; l'interface d'historique est souhaitable.
- **Contraintes :** le backend conserve utilisateur, type, format, date, statut, période, organisation, expiration ; l'interface d'historique est SHOULD.
- **Cas limites :** la purge et l'audit fonctionnent sans interface.
- **Impact KPI :** aucun.
- **Source :** Q-14 + périmètre SHOULD (validés).

### BR-EXP-006 — Exports asynchrones et idempotence
- **Description :** les exports volumineux sont asynchrones.
- **Contraintes :** statuts explicites ; reprise sans doublon ; un même job rejoué ne produit pas deux fichiers ; échec avec motif.
- **Cas limites :** un export volumineux ne bloque pas l'interface.
- **Impact KPI :** aucun.
- **Source :** Q-06, Q-14 (validées).

---

## 11. Audit et traçabilité

### BR-AUD-001 — Journal d'audit minimal
- **Description :** un audit log minimal est obligatoire.
- **Contraintes :** couverture des 6 catégories ; conservation protégée ; consultation basique OWNER/ADMIN ; interface avancée SHOULD.
- **Cas limites :** une action échouée est journalisée avec `result = FAILURE`.
- **Impact KPI :** aucun.
- **Source :** Q-12 (validée).

### BR-AUD-002 — Catégories d'actions
- **Description :** six catégories sont journalisées.
- **Catégories :** authentification/sessions ; utilisateurs/rôles ; organisation/configuration ; données sensibles ; opérations financières ; ingestion.
- **Contraintes :** chaque action sensible appartient à au moins une catégorie ; la liste détaillée figure au PRD §18.3.
- **Cas limites :** une action système est rattachée à un acteur système identifiable.
- **Impact KPI :** aucun.
- **Source :** Q-12 (validée).

### BR-AUD-003 — Champs minimaux
- **Description :** chaque entrée possède 11 champs.
- **Champs :** `id`, `timestamp` (UTC), `organization_id`, `actor_user_id` (nullable), `action_type`, `resource_type`, `resource_id`, `result` (`SUCCESS`/`FAILURE`), `metadata` (JSON borné), `ip_address` (optionnel), `user_agent` (optionnel).
- **Contraintes :** `metadata` ne contient ni secret ni PII brute.
- **Cas limites :** un acteur système laisse `actor_user_id` nul mais identifie le worker dans `metadata`.
- **Impact KPI :** aucun.
- **Source :** Q-12 (validée).

### BR-AUD-004 — Sécurité du journal
- **Description :** le journal est protégé.
- **Contraintes :** jamais de mots de passe, tokens ou secrets ; API keys uniquement par fingerprint ; accès et modification restreints ; altération impossible par les utilisateurs métier.
- **Cas limites :** un export de données personnelles est audité sans recopier les PII.
- **Impact KPI :** aucun.
- **Source :** Q-12 (validée).

### BR-AUD-005 — Recent Activity indépendante
- **Description :** le flux d'activité récente est indépendant de l'audit avancé.
- **Contraintes :** construit sur les événements métier ; limité ; org active ; filtré par permissions ; généré côté backend.
- **Cas limites :** l'absence d'interface d'audit ne désactive pas Recent Activity.
- **Impact KPI :** aucun.
- **Source :** Q-13.1 (validée).

---

## 12. Suppression, anonymisation et rétention

### BR-DEL-001 — Soft delete
- **Description :** les suppressions métier ordinaires sont logiques.
- **Contraintes :** marquage `deleted_at` ; données conservées ; restauration possible par OWNER/ADMIN ; action auditée.
- **Cas limites :** les entités liées à des opérations financières ne sont pas supprimées.
- **Impact KPI :** les entités supprimées logiquement sont exclues des KPI.
- **Source :** H-06 (validée).

### BR-DEL-002 — Anonymisation
- **Description :** remplacement irréversible des PII.
- **Contraintes :** OWNER/ADMIN ; audit ; références techniques conservées ; les agrégats historiques restent cohérents.
- **Cas limites :** un participant anonymisé ne peut plus être fusionné.
- **Impact KPI :** dimensions PII remplacées par « non renseigné ».
- **Source :** H-06 (validée).

### BR-DEL-003 — Effacement définitif
- **Description :** suppression physique des PII lorsque la contrainte légale est levée.
- **Contraintes :** OWNER/ADMIN ; audit ; données comptables conservées sous forme agrégée ; jamais de suppression d'un événement `COMPLETED` ni d'une transaction financière.
- **Cas limites :** l'effacement d'un participant conserve les agrégats financiers.
- **Impact KPI :** les KPI historiques restent stables.
- **Source :** H-06 (validée) + PRD D.2.

### BR-DEL-004 — Conservation comptable
- **Description :** les transactions, remboursements et événements complétés sont conservés.
- **Contraintes :** aucune suppression physique ; seule l'anonymisation des PII est possible.
- **Cas limites :** un événement annulé peut être soft-deleted ; un événement complété reste archivé.
- **Impact KPI :** les analyses historiques restent disponibles.
- **Source :** H-06 (validée).

---

## 13. Règles transverses de calcul KPI

### BR-KPI-001 — Dates d'activité
- **Description :** chaque KPI utilise la date réelle de son activité.
- **Contraintes :** inscription → date d'inscription ; présence → date de check-in ; revenu → date de paiement ; remboursement → date de remboursement ; réservation → date de réservation.
- **Cas limites :** jamais la date de début d'événement par défaut.
- **Impact KPI :** tous.
- **Source :** Q-13.2 (validée).

### BR-KPI-002 — Registration Confirmation Rate
- **Description :** taux de confirmation des inscriptions.
- **Formule :** `CONFIRMED / (PENDING + CONFIRMED) × 100`.
- **Contraintes :** CANCELLED et WAITLISTED exclus ; dénominateur nul → N/A ; jamais appelé « Conversion Rate ».
- **Cas limites :** periode sans inscription → N/A.
- **Impact KPI :** KPI-REG-002.
- **Source :** Q-01 (validée).

### BR-KPI-003 — Inclusion des événements
- **Description :** règles d'inclusion selon le statut.
- **Contraintes :** `DRAFT` exclu ; `CANCELLED` exclu des KPI normaux ; `ARCHIVED` inclus dans l'historique et exclu des vues de performance courante ; `PUBLISHED`, `ONGOING`, `COMPLETED` inclus selon le KPI.
- **Cas limites :** une vue dédiée permet de consulter `CANCELLED` et `ARCHIVED`.
- **Impact KPI :** tous.
- **Source :** Q-13.2 (validée) + validation utilisateur du 2026-11-17.

### BR-KPI-004 — Valeurs nulles et N/A
- **Description :** l'absence de donnée n'est jamais un zéro.
- **Contraintes :** dénominateur nul, aucune donnée ou valeur non renseignée → N/A ou « non renseigné » explicite.
- **Cas limites :** un Net négatif est une valeur valide, pas une absence.
- **Impact KPI :** tous.
- **Source :** complément de cadrage.

### BR-KPI-005 — Identité interne et participants uniques
- **Description :** les décomptes de participants utilisent l'identifiant interne.
- **Contraintes :** jamais l'email ; un participant multi-événements est distinct par événement dans les taux event-scoped, et unique dans les agrégats org-wide.
- **Cas limites :** un participant fusionné est compté sur l'identité conservée.
- **Impact KPI :** KPI-PAR-001, KPI-PAR-002, KPI-CHK-002/003.
- **Source :** H-02, décision 5.3 (validées).

### BR-KPI-006 — Taux d'occupation des stands
- **Description :** occupation = stands réservés / stands réservables.
- **Formule :** `stands avec réservation ACTIVE / (total stands − stands UNAVAILABLE) × 100`.
- **Contraintes :** dénominateur nul → N/A ; seules les réservations actives comptent ; les indisponibles sont exclues.
- **Cas limites :** événement sans stand → module désactivé.
- **Impact KPI :** KPI-EXH-004.
- **Source :** décision 5.6 (validée).

---

## 14. Temps réel

### BR-RT-001 — Source unique de calcul
- **Description :** REST et Socket.IO utilisent la même logique de calcul.
- **Contraintes :** aucun calcul ad hoc côté client ; les événements temps réel notifient une invalidation, pas un résultat divergent.
- **Cas limites :** une déconnexion puis reconnexion resynchronise l'état.
- **Impact KPI :** cohérence des KPI temps réel et REST.
- **Source :** module 14 (Should) + complément de cadrage.

### BR-RT-002 — Dégradation en polling
- **Description :** les dashboards fonctionnent sans Socket.IO.
- **Contraintes :** bascule automatique en polling ; limitation de fréquence en charge.
- **Cas limites :** Socket.IO indisponible → aucune fonctionnalité MUST bloquée.
- **Impact KPI :** aucun.
- **Source :** périmètre SHOULD (validé) + complément de cadrage.

---

## 15. Matrice de traçabilité règles → PRD

| Domaine | Règles | Sections PRD |
|---|---|---|
| Événements | BR-EVT-001 à 006 | 11.1 |
| Participants | BR-PAR-001 à 005 | 11.2, 12.4, 18.2 |
| Billets | BR-TIC-001 à 003 | 11.2 |
| Inscriptions | BR-REG-001 à 004 | 11.2 |
| Paiements | BR-PAY-001 à 009 | 11.3, 12.3 |
| Check-ins | BR-CHK-001 à 007 | 11.4 |
| Exposants/stands | BR-EXH-001 à 006 | 11.5, 12.5 |
| Organisations/RBAC | BR-ORG-001 à 007 | 9, 14, Annexe A |
| Ingestion | BR-IMP-001 à 007 | 11.6 |
| Exports | BR-EXP-001 à 006 | 13.1, Annexe D.5 |
| Audit | BR-AUD-001 à 005 | 14, 18.3 |
| Suppression | BR-DEL-001 à 004 | 18.2 |
| KPI | BR-KPI-001 à 006 | 12, Annexe B |
| Temps réel | BR-RT-001 à 002 | 13.2 |

---

*Fin de BUSINESS_RULES.md — Version 1.0.*
