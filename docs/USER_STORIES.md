# USER_STORIES.md — EventPulse Analytics

**Version :** 1.0 — Phase 1

**Statut :** Finalisé et validé — cohérent avec le PRD v1.1, `BUSINESS_RULES.md` et `KPI_DEFINITIONS.md`

**Date :** 2026-11-18

**Langue :** Français (identifiants et enums en anglais)

---

## 0. Conventions

- Identifiant : `US-<DOMAINE>-<NNN>`.
- Chaque story référence les règles (`BR-...`) et KPI (`KPI-...`) applicables.
- Les critères d'acceptation utilisent le format Given / When / Then.
- Priorités : `Must`, `Should`, `Could`.
- Les rôles sont ceux du PRD : `OWNER`, `ADMIN`, `EVENT_MANAGER`, `ANALYST`, `VIEWER`.
- Les invitations, réinitialisations et notifications transactionnelles supposent un canal de livraison à définir en Phase 3 ; aucune fonctionnalité de notification métier par email n'est ajoutée en V1.

---

## EPIC AUTH — Authentification et sessions

### US-AUTH-01 — Se connecter
- **Rôle :** tout utilisateur disposant d'un membership.
- **Objectif :** accéder à la plateforme avec son email et son mot de passe.
- **Préconditions :** compte actif ; au moins un membership actif.
- **Scénario principal :**
  1. L'utilisateur saisit email et mot de passe.
  2. Le système vérifie le hash Argon2.
  3. Le système émet un access token court et un refresh token.
  4. Si l'utilisateur a plusieurs organisations, il choisit l'organisation active ; sinon elle est définie automatiquement.
  5. La connexion réussie est auditée.
- **Alternatifs :** plusieurs organisations → écran de sélection ; aucune organisation → accès refusé avec message explicite.
- **Cas d'erreur :** identifiants invalides → 401 avec message générique ; compte désactivé → 403 ; tentative échouée auditée en `FAILURE`.
- **GWT :**
  - Given un compte actif et des identifiants valides, When l'utilisateur se connecte, Then un access token et un refresh token sont émis.
  - Given des identifiants invalides, When l'utilisateur se connecte, Then la réponse est 401 sans révéler si l'email existe.
  - Given un compte désactivé, When l'utilisateur se connecte, Then l'accès est refusé et journalisé.
  - Given une connexion réussie, When l'action est terminée, Then une entrée d'audit `SUCCESS` est créée.
- **Priorité :** Must. **Règles :** H-12, BR-ORG-001. **KPI :** aucun.

### US-AUTH-02 — Gérer sa session (refresh et déconnexion)
- **Rôle :** utilisateur authentifié.
- **Objectif :** renouveler son access token de façon sûre et se déconnecter.
- **Préconditions :** refresh token valide.
- **Scénario principal :**
  1. Le client présente son refresh token.
  2. Le système le valide, le révoque et en émet un nouveau (rotation).
  3. La déconnexion révoque le refresh token et invalide la session.
- **Alternatifs :** refresh expiré → reconnexion requise.
- **Cas d'erreur :** refresh réutilisé après rotation → refus et journalisation ; token invalide → 401.
- **GWT :**
  - Given un refresh token valide, When il est utilisé, Then un nouveau couple de tokens est émis et l'ancien refresh est invalide.
  - Given un refresh token déjà consommé, When il est réutilisé, Then la requête est refusée.
  - Given une déconnexion, When elle est effectuée, Then le refresh token est révoqué et l'action est auditée.
- **Priorité :** Must. **Règles :** H-12, BR-AUD-002. **KPI :** aucun.

### US-AUTH-03 — Changer d'organisation active
- **Rôle :** utilisateur membre de plusieurs organisations.
- **Objectif :** basculer de contexte sans se reconnecter.
- **Préconditions :** memberships multiples.
- **Scénario principal :**
  1. L'utilisateur sélectionne une autre organisation.
  2. Le système vérifie le membership.
  3. Le contexte d'accès est renouvelé ; les permissions sont recalculées.
  4. Le changement est audité.
- **Alternatifs :** organisation non autorisée → refus.
- **Cas d'erreur :** membership absent → 403 ; session expirée → reconnexion.
- **GWT :**
  - Given deux memberships, When l'utilisateur change d'organisation, Then les permissions du nouveau rôle s'appliquent immédiatement.
  - Given une organisation sans membership, When l'utilisateur tente d'y accéder, Then la requête est refusée.
  - Given un changement réussi, Then une entrée d'audit est créée.
- **Priorité :** Must. **Règles :** H-01, BR-ORG-001. **KPI :** tous scopés à l'org active.

### US-AUTH-04 — Réinitialiser son mot de passe
- **Rôle :** utilisateur.
- **Objectif :** récupérer l'accès en cas d'oubli.
- **Préconditions :** compte existant.
- **Scénario principal :**
  1. L'utilisateur demande une réinitialisation.
  2. Le système répond de façon générique, qu'un compte existe ou non.
  3. Un token à usage unique et à durée limitée est généré.
  4. L'utilisateur définit un nouveau mot de passe ; le token est consommé.
- **Alternatifs :** token expiré → nouvelle demande.
- **Cas d'erreur :** token invalide/réutilisé → refus ; mot de passe trop faible → refus (règles Zod).
- **GWT :**
  - Given un email inconnu, When une réinitialisation est demandée, Then la réponse reste générique.
  - Given un token valide, When le mot de passe est changé, Then l'ancien mot de passe ne fonctionne plus.
  - Given une demande et une exécution, Then les deux actions sont auditées sans stocker le mot de passe.
- **Priorité :** Must. **Règles :** H-12, BR-AUD-002, BR-AUD-004. **KPI :** aucun.

---

## EPIC ORG — Organisation et administration

### US-ORG-01 — Inviter un membre
- **Rôle :** OWNER, ADMIN (hors attribution OWNER).
- **Objectif :** ajouter un utilisateur à l'organisation avec un rôle.
- **Précondition :** l'invitant est autorisé.
- **Scénario principal :**
  1. L'invitant saisit l'email et sélectionne un rôle.
  2. Le système vérifie les règles d'attribution (ADMIN ne peut pas attribuer OWNER).
  3. Un membership en attente et un token d'invitation à usage unique sont créés.
  4. L'action est auditée.
- **Alternatifs :** utilisateur déjà membre → invitation refusée.
- **Cas d'erreur :** rôle non autorisé → 403 ; email invalide → 422.
- **GWT :**
  - Given un ADMIN, When il tente d'inviter un OWNER, Then la demande est refusée.
  - Given un email valide et un rôle autorisé, When l'invitation est créée, Then un membership en attente existe et l'action est auditée.
  - Given un utilisateur déjà membre, When il est réinvité, Then la demande est refusée.
- **Priorité :** Must. **Règles :** BR-ORG-005, BR-AUD-002. **KPI :** aucun.

### US-ORG-02 — Modifier, rétrograder ou supprimer un membre
- **Rôle :** OWNER, ADMIN (non-OWNER).
- **Objectif :** gouverner les accès.
- **Préconditions :** cible existante ; règles de gouvernance respectées.
- **Scénario principal :**
  1. L'administrateur choisit un membre.
  2. Il modifie son rôle ou le retire.
  3. Le système vérifie qu'il ne s'agit pas du dernier OWNER et que l'ADMIN ne touche pas un OWNER.
  4. Les sessions du membre impacté sont réévaluées.
  5. L'action est auditée.
- **Alternatifs :** retrait d'un EVENT_MANAGER → ses événements sont désassignés.
- **Cas d'erreur :** dernier OWNER → refus ; ADMIN ciblant un OWNER → refus.
- **GWT :**
  - Given le dernier OWNER, When une rétrogradation est tentée, Then elle est refusée.
  - Given un ADMIN, When il modifie un OWNER, Then la demande est refusée.
  - Given un EVENT_MANAGER retiré, When l'opération est terminée, Then ses événements ne lui sont plus accessibles.
- **Priorité :** Must. **Règles :** BR-ORG-004, BR-ORG-005, BR-AUD-002. **KPI :** aucun.

### US-ORG-03 — Désactiver ou réactiver un compte
- **Rôle :** OWNER, ADMIN.
- **Objectif :** suspendre un accès sans supprimer l'historique.
- **Scénario principal :** désactivation → refresh tokens révoqués ; réactivation → accès rétabli ; audit.
- **Cas d'erreur :** désactivation du dernier OWNER → refus.
- **GWT :**
  - Given un membre désactivé, When il tente de se connecter, Then l'accès est refusé.
  - Given une réactivation, When elle est effectuée, Then l'accès est rétabli et l'action est auditée.
- **Priorité :** Must. **Règles :** BR-ORG-004, BR-AUD-002. **KPI :** aucun.

### US-ORG-04 — Configurer l'organisation
- **Rôle :** OWNER, ADMIN.
- **Objectif :** régler le fuseau, la devise et la rétention des exports.
- **Scénario principal :**
  1. L'administrateur ouvre les paramètres.
  2. Il modifie le fuseau et/ou la rétention (30 jours par défaut).
  3. La devise reste EUR ; le champ `currency` est conservé.
  4. La modification critique est auditée.
- **Cas d'erreur :** fuseau invalide → refus ; rétention < 1 jour → refus.
- **GWT :**
  - Given une rétention modifiée, When un nouvel export est généré, Then la nouvelle durée s'applique.
  - Given la devise EUR, When un paramétrage est tenté, Then aucune autre devise n'est acceptée en V1.
  - Given un paramètre critique modifié, Then l'action est auditée.
- **Priorité :** Must. **Règles :** H-04, H-05, Q-14, BR-EXP-001. **KPI :** ancrage des périodes.

### US-ORG-05 — Gérer les API keys
- **Rôle :** OWNER, ADMIN.
- **Objectif :** authentifier l'endpoint d'ingestion.
- **Scénario principal :**
  1. L'administrateur crée une API key avec le scope `ingestion:write`.
  2. Le secret est affiché une seule fois ; seul un hash et un fingerprint sont conservés.
  3. La clé peut être tournée ou révoquée.
  4. Toute opération est auditée sans secret.
- **Alternatifs :** clé révoquée → rejet immédiat.
- **Cas d'erreur :** scope absent → refus d'ingestion ; clé inconnue → 401.
- **GWT :**
  - Given une clé créée, When elle est utilisée avec le bon scope, Then l'ingestion est acceptée.
  - Given une clé révoquée, When elle est utilisée, Then la requête est refusée.
  - Given une création/rotation/révocation, Then l'audit ne contient jamais le secret.
- **Priorité :** Must. **Règles :** H-11, Q-12, BR-IMP-007, BR-AUD-004. **KPI :** aucun.

### US-ORG-06 — Consulter le journal d'audit
- **Rôle :** OWNER, ADMIN.
- **Objectif :** vérifier les actions sensibles.
- **Scénario principal :**
  1. L'administrateur ouvre le journal.
  2. Il filtre par catégorie, date, acteur, ressource et résultat.
  3. Il consulte les 11 champs minimaux.
  4. Il ne voit jamais de secret ni de PII inutile.
- **Alternatifs :** interface avancée (recherche, export) = Should.
- **Cas d'erreur :** rôle non autorisé → 403.
- **GWT :**
  - Given une action sensible, When elle est effectuée, Then une entrée apparaît dans le journal.
  - Given une entrée, Then elle contient les 11 champs minimaux.
  - Given un accès Analyst/Viewer, When il tente de consulter l'audit, Then la requête est refusée.
- **Priorité :** Must (UI avancée : Should). **Règles :** Q-12, BR-AUD-001 à BR-AUD-004. **KPI :** aucun.

---

## EPIC EVT — Événements

### US-EVT-01 — Créer un événement
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER.
- **Objectif :** créer un événement en brouillon.
- **Préconditions :** organisation active ; dates valides.
- **Scénario principal :**
  1. L'utilisateur saisit nom, type, dates, fuseau, lieu et description.
  2. L'événement est créé en `DRAFT`.
  3. Si le créateur est EVENT_MANAGER, il est auto-assigné.
  4. La fenêtre de check-in par défaut est initialisée à `[start − 2h, end + 2h]`.
- **Alternatifs :** création par OWNER/ADMIN sans assignation immédiate.
- **Cas d'erreur :** date de fin antérieure au début → 422 ; type invalide → 422.
- **GWT :**
  - Given des données valides, When l'événement est créé, Then son statut est `DRAFT`.
  - Given un EVENT_MANAGER créateur, Then il est automatiquement assigné.
  - Given un événement créé, Then il n'apparaît dans aucun KPI de performance.
- **Priorité :** Must. **Règles :** BR-EVT-001, BR-EVT-002, BR-EVT-006, Q-10. **KPI :** BR-KPI-003.

### US-EVT-02 — Modifier un événement
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** mettre à jour les informations d'un événement.
- **Scénario principal :**
  1. L'utilisateur ouvre l'événement et modifie les champs autorisés.
  2. En `DRAFT`/`PUBLISHED`, les dates et le fuseau sont modifiables.
  3. Après publication, la modification est auditée.
- **Alternatifs :** passage en `ONGOING` → dates figées.
- **Cas d'erreur :** tentative de modification des dates en `ONGOING` → 409.
- **GWT :**
  - Given un événement `PUBLISHED`, When les dates changent, Then l'action est auditée.
  - Given un événement `ONGOING`, When une date est modifiée, Then la requête est refusée.
  - Given un EVENT_MANAGER non assigné, When il tente de modifier, Then la requête est refusée.
- **Priorité :** Must. **Règles :** BR-EVT-005, BR-ORG-002. **KPI :** aucun.

### US-EVT-03 — Publier un événement
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** rendre l'événement actif.
- **Préconditions :** événement `DRAFT` complet.
- **Scénario principal :**
  1. Le système vérifie nom, type, dates et fuseau.
  2. La transition `DRAFT → PUBLISHED` est appliquée.
  3. L'action est auditée.
- **Alternatifs :** brouillon incomplet → refus avec détails.
- **Cas d'erreur :** transition invalide → 409.
- **GWT :**
  - Given un brouillon complet, When il est publié, Then son statut est `PUBLISHED`.
  - Given un brouillon incomplet, When la publication est tentée, Then elle est refusée.
  - Given un événement `CANCELLED`, When la publication est tentée, Then elle est refusée.
- **Priorité :** Must. **Règles :** BR-EVT-001, BR-EVT-003. **KPI :** BR-KPI-003.

### US-EVT-04 — Faire évoluer le statut d'un événement
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** démarrer, terminer, annuler ou archiver un événement.
- **Scénario principal :**
  1. L'utilisateur déclenche la transition autorisée.
  2. Le système vérifie la transition.
  3. Le statut est mis à jour et l'action est auditée.
- **Alternatifs :** annulation depuis `PUBLISHED` ou `ONGOING` ; archivage depuis `COMPLETED`.
- **Cas d'erreur :** saut d'étape ou transition inverse → 409.
- **GWT :**
  - Given un événement `PUBLISHED`, When il démarre, Then il passe `ONGOING`.
  - Given un événement `COMPLETED`, When il est archivé, Then il passe `ARCHIVED` et reste inclus dans l'historique.
  - Given un événement `CANCELLED`, When une transition est tentée, Then elle est refusée.
- **Priorité :** Must. **Règles :** BR-EVT-001, BR-KPI-003. **KPI :** KPI de performance.

### US-EVT-05 — Supprimer logiquement un événement
- **Rôle :** OWNER, ADMIN.
- **Objectif :** retirer un événement erroné sans perte de traçabilité.
- **Préconditions :** statut `DRAFT` ou `CANCELLED` ; aucune inscription.
- **Scénario principal :** soft delete avec `deleted_at` ; audit.
- **Cas d'erreur :** `ONGOING`/`COMPLETED`/`ARCHIVED` → refus ; événement avec inscriptions → refus.
- **GWT :**
  - Given un `DRAFT` sans inscription, When il est supprimé, Then il est marqué supprimé et audité.
  - Given un `COMPLETED`, When la suppression est tentée, Then elle est refusée.
- **Priorité :** Must. **Règles :** BR-EVT-004, BR-DEL-001. **KPI :** exclusion des KPI.

### US-EVT-06 — Assigner un Event Manager
- **Rôle :** OWNER, ADMIN.
- **Objectif :** déléguer la gestion d'un événement.
- **Scénario principal :** sélection d'un membre EVENT_MANAGER ; assignation, réassignation ou retrait ; audit.
- **Cas d'erreur :** membre non EVENT_MANAGER → refus ; rôle insuffisant → 403.
- **GWT :**
  - Given un EVENT_MANAGER assigné, When il ouvre l'événement, Then il y a accès.
  - Given un retrait, When il est effectué, Then l'accès est retiré et l'action est auditée.
  - Given un OWNER, When il réassigne, Then l'ancien manager perd l'accès.
- **Priorité :** Must. **Règles :** Q-10, BR-ORG-002. **KPI :** aucun.

### US-EVT-07 — Configurer la fenêtre de check-in
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** adapter la période d'accueil des participants.
- **Scénario principal :**
  1. L'utilisateur saisit les offsets d'ouverture/fermeture.
  2. Les valeurs par défaut sont `−120` et `+120` minutes.
  3. La fenêtre est enregistrée et auditée si modifiée après publication.
- **Alternatifs :** réinitialisation aux valeurs par défaut.
- **Cas d'erreur :** offsets incohérents → 422 ; modification en `ONGOING` → 409.
- **GWT :**
  - Given un événement sans configuration, Then la fenêtre par défaut est appliquée.
  - Given des offsets valides, When un check-in est effectué dans la fenêtre, Then il peut être `VALID`.
  - Given un check-in hors fenêtre, Then il est `INVALID` (`OUTSIDE_WINDOW`).
- **Priorité :** Must. **Règles :** Q-08, BR-EVT-006, BR-CHK-001. **KPI :** KPI-CHK-001.

### US-EVT-08 — Consulter et filtrer les événements
- **Rôle :** tous selon permissions.
- **Objectif :** retrouver les événements pertinents.
- **Scénario principal :** liste filtrée par statut, type, période ; EVENT_MANAGER ne voit que ses événements et les événements publics autorisés ; VIEWER/ANALYST ne voient pas les `DRAFT`.
- **Cas d'erreur :** accès à un `DRAFT` non autorisé → 403.
- **GWT :**
  - Given un EVENT_MANAGER, When il liste les événements, Then seuls ses événements et les événements publiés autorisés apparaissent.
  - Given un VIEWER, When il liste, Then aucun `DRAFT` n'apparaît.
  - Given un filtre de type, Then seuls les événements correspondants sont retournés.
- **Priorité :** Must. **Règles :** BR-ORG-002, BR-ORG-007. **KPI :** aucun.

---

## EPIC PAR — Participants

### US-PAR-01 — Créer et rechercher un participant
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** enregistrer une personne et la retrouver.
- **Scénario principal :**
  1. L'utilisateur saisit les informations du participant.
  2. Le système signale d'éventuelles correspondances par email normalisé.
  3. Le participant est créé avec un identifiant interne.
- **Alternatifs :** création depuis une inscription.
- **Cas d'erreur :** email invalide → 422 ; rôle non autorisé → 403.
- **GWT :**
  - Given un email déjà utilisé, When un participant est créé, Then la création est autorisée mais une correspondance est suggérée.
  - Given un VIEWER, When il tente de créer, Then la requête est refusée.
  - Given une recherche, Then l'identifiant interne permet de retrouver le participant.
- **Priorité :** Must. **Règles :** BR-PAR-001, BR-PAR-002. **KPI :** KPI-PAR-001.

### US-PAR-02 — Modifier un participant
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** corriger ou compléter les données.
- **Scénario principal :** modification des champs ; suggestion de fusion si email correspondant ; sauvegarde.
- **Cas d'erreur :** modification PII sans permission → 403 ; données invalides → 422.
- **GWT :**
  - Given un EVENT_MANAGER assigné, When il modifie un participant de son événement, Then la modification est acceptée.
  - Given un ANALYST, When il tente de modifier, Then la requête est refusée.
- **Priorité :** Must. **Règles :** BR-ORG-007, BR-PAR-002. **KPI :** KPI-PAR-001.

### US-PAR-03 — Fusionner des participants
- **Rôle :** OWNER, ADMIN.
- **Objectif :** unifier une identité dupliquée manuellement.
- **Préconditions :** au moins deux participants non anonymisés.
- **Scénario principal :**
  1. L'utilisateur sélectionne les participants et l'identité conservée.
  2. Le système rattache toutes les références.
  3. Les absorbés sont marqués fusionnés (soft delete).
  4. L'opération est auditée.
- **Alternatifs :** aucune fusion automatique.
- **Cas d'erreur :** fusion partielle → refus ; participant anonymisé → refus ; organisations différentes → refus.
- **GWT :**
  - Given deux participants de la même organisation, When la fusion est confirmée, Then toutes les références pointent vers l'identité conservée.
  - Given un participant anonymisé, When la fusion est tentée, Then elle est refusée.
  - Given une fusion, Then une entrée d'audit contient les identifiants conservés et absorbés.
- **Priorité :** Must. **Règles :** Q-02, BR-PAR-003, BR-AUD-002. **KPI :** KPI-PAR-001.

### US-PAR-04 — Anonymiser ou effacer un participant
- **Rôle :** OWNER, ADMIN.
- **Objectif :** répondre à une demande RGPD.
- **Scénario principal :**
  1. L'utilisateur choisit anonymisation ou effacement.
  2. Le système remplace ou supprime les PII.
  3. Les données comptables agrégées sont conservées.
  4. L'action est auditée.
- **Alternatifs :** effacement refusé tant qu'une contrainte légale subsiste.
- **Cas d'erreur :** tentative de suppression d'une transaction → refus.
- **GWT :**
  - Given une anonymisation, When elle est effectuée, Then les PII sont remplacées et l'identifiant interne reste technique.
  - Given un effacement, Then les agrégats financiers restent disponibles.
  - Given l'opération, Then elle est auditée.
- **Priorité :** Must. **Règles :** H-06, BR-PAR-004, BR-DEL-002, BR-DEL-003. **KPI :** KPI-AUD-001/002 (« non renseigné »).

---

## EPIC REG — Inscriptions et billets

### US-REG-01 — Créer une inscription
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** inscrire un participant à un événement avec un billet.
- **Préconditions :** participant, événement et billet de la même organisation.
- **Scénario principal :**
  1. L'utilisateur sélectionne participant, événement et billet.
  2. La source est renseignée.
  3. L'inscription est créée en `PENDING`.
- **Alternatifs :** création depuis la fiche participant ou l'écran de l'événement.
- **Cas d'erreur :** billet d'un autre événement → 422 ; entités d'une autre organisation → 404.
- **GWT :**
  - Given des entités valides, When l'inscription est créée, Then son statut est `PENDING`.
  - Given un billet d'un autre événement, Then la création est refusée.
  - Given deux inscriptions du même participant au même événement, Then elles sont autorisées.
- **Priorité :** Must. **Règles :** BR-REG-001. **KPI :** KPI-REG-001.

### US-REG-02 — Changer le statut d'une inscription
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** confirmer, mettre en liste d'attente ou annuler.
- **Scénario principal :**
  1. L'utilisateur choisit une transition autorisée.
  2. Le système applique le nouveau statut.
  3. L'annulation ne déclenche aucun remboursement.
- **Alternatifs :** annulation après check-in `VALID` réservée à OWNER/ADMIN et auditée.
- **Cas d'erreur :** transition invalide → 409.
- **GWT :**
  - Given une inscription `PENDING`, When elle est confirmée, Then son statut est `CONFIRMED`.
  - Given une inscription `CANCELLED`, When une réactivation est tentée, Then elle est refusée.
  - Given une annulation, Then aucune transaction n'est remboursée automatiquement.
- **Priorité :** Must. **Règles :** Q-03, BR-REG-002, BR-REG-003. **KPI :** KPI-REG-002.

### US-TIC-01 — Gérer les billets d'un événement
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** définir les billets et leurs prix.
- **Scénario principal :**
  1. L'utilisateur crée un billet (nom, prix EUR).
  2. Il peut modifier le prix pour les ventes futures.
  3. Un billet référencé ne peut pas être supprimé.
- **Alternatifs :** aucun stock/quotas en V1.
- **Cas d'erreur :** prix négatif → 422 ; suppression d'un billet référencé → 409.
- **GWT :**
  - Given un billet référencé, When la suppression est tentée, Then elle est refusée.
  - Given une modification de prix, When une transaction existante est consultée, Then son montant d'origine est inchangé.
  - Given un événement sans billet, Then aucune inscription ne peut être créée.
- **Priorité :** Must. **Règles :** BR-TIC-001 à BR-TIC-003. **KPI :** KPI-REV-001.

---

## EPIC PAY — Paiements et remboursements

### US-PAY-01 — Enregistrer une transaction
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** suivre un paiement billet ou stand.
- **Scénario principal :**
  1. L'utilisateur choisit `TICKET` ou `BOOTH`.
  2. Il rattache la transaction à une inscription ou une réservation.
  3. Le montant et la devise EUR sont saisis ; le statut initial est `PENDING`.
- **Alternatifs :** transaction créée depuis une inscription ou une réservation.
- **Cas d'erreur :** type incohérent avec la référence → 422 ; devise non EUR → 422.
- **GWT :**
  - Given une inscription, When une transaction `TICKET` est créée, Then elle référence l'inscription.
  - Given une réservation, When une transaction `BOOTH` est créée, Then elle référence la réservation.
  - Given une devise autre que EUR, Then la transaction est refusée.
- **Priorité :** Must. **Règles :** BR-PAY-004, BR-PAY-009. **KPI :** KPI-REV-001/002.

### US-PAY-02 — Mettre à jour le statut d'une transaction
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné (transitions limitées).
- **Objectif :** refléter l'encaissement ou l'échec.
- **Scénario principal :**
  1. L'utilisateur choisit une transition autorisée.
  2. Le système met à jour le statut et la date de paiement.
  3. La modification manuelle est auditée.
- **Alternatifs :** passage automatique simulé par le seed ou l'ingestion.
- **Cas d'erreur :** transition invalide → 409 ; rôle non autorisé → 403.
- **GWT :**
  - Given une transaction `PENDING`, When elle passe `PAID`, Then `paid_at` est renseigné.
  - Given une transaction `FAILED`, When un passage à `PAID` est tenté, Then il est refusé.
  - Given une modification manuelle, Then une entrée d'audit est créée.
- **Priorité :** Must. **Règles :** BR-PAY-001, BR-PAY-008, Q-12. **KPI :** KPI-REV-003.

### US-PAY-03 — Enregistrer un remboursement
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** rembourser partiellement ou totalement une transaction.
- **Préconditions :** transaction `PAID` ou `PARTIALLY_REFUNDED`.
- **Scénario principal :**
  1. L'utilisateur saisit le montant et la date.
  2. Le système vérifie le cumul ≤ montant payé.
  3. Un `Refund` indépendant est créé.
  4. Le statut passe `PARTIALLY_REFUNDED` ou `REFUNDED`.
  5. L'action est auditée.
- **Alternatifs :** plusieurs remboursements partiels successifs.
- **Cas d'erreur :** dépassement du plafond → 422 ; transaction non payée → 409.
- **GWT :**
  - Given une transaction `PAID` de 100 €, When un remboursement de 30 € est enregistré, Then le statut est `PARTIALLY_REFUNDED` et le reste remboursable est 70 €.
  - Given un cumul de 100 €, When un remboursement supplémentaire est tenté, Then il est refusé.
  - Given un remboursement, Then Gross reste inchangé et Net diminue.
- **Priorité :** Must. **Règles :** Q-04, BR-PAY-002, BR-PAY-005, BR-PAY-006. **KPI :** KPI-REV-004/005.

### US-PAY-04 — Consulter l'historique financier
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné ; ANALYST en agrégats.
- **Objectif :** auditer les paiements et remboursements.
- **Scénario principal :** détail d'une transaction, remboursements associés, statuts et dates ; agrégats pour ANALYST.
- **Cas d'erreur :** accès détail par ANALYST → 403.
- **GWT :**
  - Given une transaction, Then tous ses remboursements sont listés.
  - Given un ANALYST, When il consulte le détail, Then il ne voit que des agrégats.
  - Given une transaction remboursée, Then le montant original reste visible.
- **Priorité :** Must. **Règles :** BR-ORG-007, BR-PAY-003. **KPI :** KPI-REV-007.

---

## EPIC CHK — Check-ins

### US-CHK-01 — Effectuer un check-in manuel
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** enregistrer la présence d'un participant.
- **Préconditions :** participant, inscription et événement existants.
- **Scénario principal :**
  1. L'utilisateur recherche le participant.
  2. Le système vérifie l'existence, le statut, la fenêtre et le doublon.
  3. Le check-in est enregistré `VALID` ou `INVALID` avec motif.
- **Alternatifs :** recherche par email ou identifiant interne.
- **Cas d'erreur :** inscription `PENDING`/`WAITLISTED`/`CANCELLED` → `INVALID` avec motif ; hors fenêtre → `INVALID` (`OUTSIDE_WINDOW`) ; doublon → `INVALID` (`DUPLICATE`).
- **GWT :**
  - Given une inscription `CONFIRMED` dans la fenêtre, When le check-in est effectué, Then il est `VALID`.
  - Given un second check-in pour le même participant/événement, Then il est `INVALID` (`DUPLICATE`).
  - Given une inscription `CANCELLED`, Then le check-in est `INVALID` (`REGISTRATION_CANCELLED`).
  - Given un check-in `INVALID`, Then un motif est obligatoire.
- **Priorité :** Must. **Règles :** Q-08, BR-CHK-001 à BR-CHK-006. **KPI :** KPI-CHK-001, KPI-CHK-002.

### US-CHK-02 — Importer des check-ins CSV
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** enregistrer des présences en masse.
- **Scénario principal :**
  1. L'utilisateur téléverse un CSV.
  2. Le système valide et produit un aperçu avec erreurs et doublons.
  3. L'import est traité de façon asynchrone.
  4. Un rapport d'erreurs par ligne est disponible.
- **Alternatifs :** stratégie de doublon `SKIP`/`UPDATE`/`ERROR`.
- **Cas d'erreur :** fichier invalide → aucun enregistrement ; doublon → `INVALID` (`DUPLICATE`) ou ignoré selon la stratégie.
- **GWT :**
  - Given un CSV valide, When l'import est confirmé, Then les check-ins sont créés avec leurs statuts et motifs.
  - Given un fichier rejoué avec la même clé, Then aucun doublon n'est créé.
  - Given des lignes invalides, Then le rapport les liste avec un motif.
- **Priorité :** Must. **Règles :** BR-CHK-007, BR-IMP-002, BR-IMP-004. **KPI :** KPI-CHK-001/004.

### US-CHK-03 — Consulter l'historique des check-ins
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné ; ANALYST en agrégats.
- **Objectif :** suivre les présences et les rejets.
- **Scénario principal :** liste filtrée par événement, statut, motif, date ; détail réservé aux rôles autorisés.
- **Cas d'erreur :** accès détail par ANALYST/VIEWER → 403.
- **GWT :**
  - Given un événement, When l'historique est consulté, Then les check-ins valides et invalides sont listés avec motif.
  - Given un ANALYST, Then seuls les agrégats sont accessibles.
  - Given un check-in, Then il n'est ni modifiable ni supprimable.
- **Priorité :** Must. **Règles :** BR-CHK-006, BR-ORG-007. **KPI :** KPI-CHK-004.

### US-CHK-04 — Corriger un check-in invalide
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** régulariser une présence après correction des données.
- **Scénario principal :**
  1. L'utilisateur identifie l'opération invalide.
  2. Après correction de l'inscription, il crée une nouvelle opération de check-in.
  3. L'opération d'origine reste dans l'historique ; la nouvelle est auditée.
- **Alternatifs :** aucune modification directe de l'historique.
- **Cas d'erreur :** tentative d'édition/suppression → 405/403.
- **GWT :**
  - Given un check-in invalide, When une nouvelle opération valide est créée, Then les deux apparaissent dans l'historique.
  - Given une tentative de suppression, Then elle est refusée.
  - Given une correction, Then elle est auditée.
- **Priorité :** Must. **Règles :** BR-CHK-006, BR-AUD-002. **KPI :** KPI-CHK-001.

---

## EPIC EXH — Exposants et stands

### US-EXH-01 — Gérer les exposants
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** créer et maintenir le référentiel des exposants.
- **Scénario principal :** création, modification et soft delete d'un exposant rattaché à l'organisation.
- **Cas d'erreur :** accès inter-organisations → 404 ; rôle insuffisant → 403.
- **GWT :**
  - Given un exposant, When il est créé, Then il est rattaché à l'organisation active.
  - Given un exposant avec réservations, When la suppression est tentée, Then elle est refusée.
  - Given un soft delete, Then l'action est auditée.
- **Priorité :** Must. **Règles :** BR-EXH-001, BR-DEL-001. **KPI :** KPI-EXH-001.

### US-EXH-02 — Gérer les stands
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** définir les stands d'un événement.
- **Scénario principal :** création/modification avec numéro, zone, surface, statut, prix optionnel.
- **Cas d'erreur :** numéro dupliqué dans l'événement → 409 ; surface négative → 422.
- **GWT :**
  - Given un événement, When un stand est créé, Then son statut initial est `AVAILABLE`.
  - Given un stand avec réservation active, When il est marqué `UNAVAILABLE`, Then l'opération est refusée.
  - Given un stand sans prix, Then il reste réservable et sa valeur n'est pas 0 €.
- **Priorité :** Must. **Règles :** BR-EXH-002, BR-EXH-004. **KPI :** KPI-EXH-004.

### US-EXH-03 — Réserver ou libérer un stand
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** attribuer un stand à un exposant.
- **Préconditions :** stand `AVAILABLE` ; exposant de l'organisation.
- **Scénario principal :**
  1. L'utilisateur sélectionne le stand et l'exposant.
  2. Le système vérifie l'unicité de la réservation active.
  3. La réservation est créée ; le stand passe `RESERVED`.
  4. La libération passe la réservation à `RELEASED` et le stand à `AVAILABLE`.
- **Alternatifs :** prix optionnel et transaction `BOOTH`.
- **Cas d'erreur :** réservation concurrente → 409 ; stand indisponible → 409.
- **GWT :**
  - Given un stand disponible, When il est réservé, Then une seule réservation active existe.
  - Given deux réservations concurrentes, Then une seule réussit.
  - Given une libération, Then le stand redevient disponible et l'historique est conservé.
- **Priorité :** Must. **Règles :** BR-EXH-003, BR-EXH-006. **KPI :** KPI-EXH-002/004.

---

## EPIC IMP — Ingestion

### US-IMP-01 — Importer un fichier CSV
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** alimenter les inscriptions, check-ins ou paiements en masse.
- **Scénario principal :**
  1. L'utilisateur téléverse un CSV.
  2. Le système valide le schéma et produit un aperçu.
  3. Les doublons sont détectés.
  4. L'utilisateur choisit `SKIP`, `UPDATE` ou `ERROR`.
  5. Il confirme ; un job BullMQ est créé.
- **Alternatifs :** réimport du même fichier → idempotent.
- **Cas d'erreur :** schéma invalide → aperçu avec erreurs ; fichier entièrement invalide → aucun enregistrement.
- **GWT :**
  - Given un CSV valide, When l'aperçu est généré, Then les lignes valides et invalides sont distinguées.
  - Given une confirmation, Then un job `PENDING` est créé.
  - Given le même fichier rejoué, Then aucun doublon n'est créé.
- **Priorité :** Must. **Règles :** BR-IMP-001 à BR-IMP-005. **KPI :** tous les KPI alimentés.

### US-IMP-02 — Suivre un import et consulter le rapport d'erreurs
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** connaître le résultat d'un import.
- **Scénario principal :** consultation du statut (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), volumétrie et rapport par ligne.
- **Cas d'erreur :** job échoué → motif affiché ; reprise sans doublon.
- **GWT :**
  - Given un job terminé, Then le statut et les compteurs sont affichés.
  - Given un job échoué, Then un motif est disponible.
  - Given un rejeu, Then aucun doublon n'est créé.
- **Priorité :** Must. **Règles :** BR-IMP-002, BR-IMP-003. **KPI :** aucun.

### US-IMP-03 — Ingérer via l'endpoint et une API key
- **Rôle :** système externe simulé ; OWNER/ADMIN gèrent les clés.
- **Objectif :** pousser des données par API.
- **Scénario principal :**
  1. L'appelant envoie un batch d'inscriptions, check-ins ou paiements avec son API key.
  2. Le système vérifie la clé et le scope `ingestion:write`.
  3. Le payload est validé ; la clé d'idempotence est vérifiée.
  4. Un job BullMQ est créé ; la réponse contient son identifiant.
  5. L'appel est audité.
- **Alternatifs :** clé fournie par l'appelant pour l'idempotence.
- **Cas d'erreur :** clé absente/révoquée/invalide → 401 ; scope absent → 403 ; payload invalide → 422.
- **GWT :**
  - Given une clé valide avec scope, When un batch est envoyé, Then un job est créé.
  - Given une clé sans scope, Then la requête est refusée.
  - Given un doublon d'idempotence, Then aucun nouvel enregistrement n'est créé.
  - Given un appel, Then il est audité sans secret.
- **Priorité :** Must. **Règles :** H-11, BR-IMP-004, BR-IMP-007. **KPI :** tous.

### US-IMP-04 — Importer un fichier Excel
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné.
- **Objectif :** utiliser des classeurs Excel.
- **Scénario principal :** même workflow que le CSV, avec lecture du classeur et conversion.
- **Cas d'erreur :** format non supporté → 422 ; feuilles multiples → première feuille ou feuille sélectionnée.
- **GWT :**
  - Given un fichier Excel valide, When il est importé, Then le comportement est identique au CSV.
  - Given un format non supporté, Then l'import est refusé avec un message.
- **Priorité :** Should. **Règles :** H-08, BR-IMP-003. **KPI :** tous.

---

## EPIC DASH — Overview Dashboard

### US-DASH-01 — Consulter le tableau de bord consolidé
- **Rôle :** tous selon permissions.
- **Objectif :** piloter la performance de l'organisation sur une période.
- **Scénario principal :**
  1. L'utilisateur choisit une période.
  2. Le système affiche les cartes KPI, les tendances et le tableau des événements.
  3. Les événements `DRAFT`/`CANCELLED` sont exclus ; `ARCHIVED` exclu des vues de performance courante.
  4. La comparaison utilise une période précédente de longueur égale.
- **Alternatifs :** période vide → N/A ; organisation sans événement → état vide.
- **Cas d'erreur :** rôle non autorisé aux données détaillées → agrégats uniquement.
- **GWT :**
  - Given une période, When le dashboard s'affiche, Then les KPI respectent l'Annexe B.
  - Given une période sans données, Then les cartes affichent N/A.
  - Given un VIEWER, Then aucune PII et aucun lien d'export ne sont visibles.
  - Given une comparaison, Then les deux fenêtres ont la même longueur.
- **Priorité :** Must. **Règles :** Q-13.2, BR-KPI-001 à BR-KPI-004. **KPI :** KPI-REG-001/002, KPI-PAR-001, KPI-REV-003/004/005, KPI-EXH-004, KPI-CHK-002.

### US-DASH-02 — Consulter l'activité récente
- **Rôle :** tous selon permissions.
- **Objectif :** voir les dernières opérations métier.
- **Scénario principal :** flux limité d'inscriptions, check-ins, paiements, remboursements et réservations de stands, généré côté backend, limité à l'org active.
- **Alternatifs :** fallback en polling si Socket.IO indisponible.
- **Cas d'erreur :** flux vide → état vide explicite.
- **GWT :**
  - Given une activité récente, Then elle apparaît dans le flux selon les permissions.
  - Given un ANALYST, Then aucune PII n'est affichée.
  - Given l'absence d'interface d'audit avancée, Then le flux fonctionne quand même.
- **Priorité :** Must. **Règles :** Q-13.1, BR-AUD-005. **KPI :** aucun.

---

## EPIC EVA — Event Analytics

### US-EVA-01 — Analyser la performance d'un événement
- **Rôle :** EVENT_MANAGER assigné, ANALYST, OWNER, ADMIN ; VIEWER en lecture.
- **Objectif :** suivre les inscriptions, présences et revenus d'un événement.
- **Scénario principal :**
  1. L'utilisateur sélectionne un événement inclus.
  2. Le système affiche les KPI, l'évolution des inscriptions et les statistiques de présence.
  3. Les check-ins invalides sont détaillés par motif.
- **Alternatifs :** événement sans inscription → N/A.
- **Cas d'erreur :** événement `DRAFT`/`CANCELLED` → refus ; non assigné → 403.
- **GWT :**
  - Given un événement `COMPLETED`, Then les KPI de performance et de présence sont affichés.
  - Given un `DRAFT`, Then l'analyse est refusée.
  - Given des check-ins invalides, Then ils sont groupés par motif.
  - Given un événement sans inscription, Then les taux affichent N/A.
- **Priorité :** Must. **Règles :** BR-KPI-003, BR-CHK-004. **KPI :** KPI-REG-001/002, KPI-CHK-001 à 005, KPI-REV-003.

### US-EVA-02 — Comparer plusieurs événements
- **Rôle :** EVENT_MANAGER, ANALYST, OWNER, ADMIN.
- **Objectif :** comparer des performances homogènes.
- **Scénario principal :**
  1. L'utilisateur sélectionne jusqu'à 5 événements inclus.
  2. Le système affiche les KPI côte à côte.
  3. Un avertissement est affiché si les types ou durées diffèrent.
- **Alternatifs :** comparaisons avancées = Should (module Advanced).
- **Cas d'erreur :** événement `DRAFT`/`CANCELLED` → refus ; moins de 2 événements → message.
- **GWT :**
  - Given deux événements inclus, Then les KPI comparables sont affichés.
  - Given des types différents, Then un avertissement est affiché mais la comparaison reste possible.
  - Given un événement exclu, Then il ne peut pas être sélectionné.
- **Priorité :** Must (basique) ; avancée : Should. **Règles :** BR-EVT-002, BR-KPI-003. **KPI :** KPI-REG-002, KPI-CHK-002/003, KPI-REV-003.

---

## EPIC REV — Revenue Analytics

### US-REV-01 — Analyser les revenus
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER assigné, ANALYST (agrégats).
- **Objectif :** distinguer billets, stands, brut, remboursements et net.
- **Scénario principal :**
  1. L'utilisateur filtre par période, événement et type.
  2. Le système affiche Ticket, Booth, Gross, Total Refunds, Net.
  3. Il affiche Paid Tickets, Average Ticket Value et la répartition des statuts.
  4. Il affiche les remboursements partiels et le reste remboursable.
- **Alternatifs :** drill-down transaction réservé aux rôles autorisés.
- **Cas d'erreur :** remboursement sur transaction non payée → refus ; période sans données → N/A.
- **GWT :**
  - Given des transactions payées, Then Gross = Ticket + Booth.
  - Given un remboursement, Then Gross reste stable et Net diminue.
  - Given une période avec remboursements supérieurs aux paiements, Then Net peut être négatif.
  - Given un ANALYST, Then aucun détail PII n'est accessible.
- **Priorité :** Must. **Règles :** Q-04, Q-05, BR-PAY-001 à BR-PAY-009. **KPI :** KPI-REV-001 à 008.

---

## EPIC AUD — Audience Analytics

### US-AUD-01 — Analyser l'audience
- **Rôle :** ANALYST (agrégats), EVENT_MANAGER, OWNER, ADMIN ; VIEWER en lecture.
- **Objectif :** comprendre la composition et le comportement des participants.
- **Scénario principal :**
  1. L'utilisateur filtre par événement, période et dimensions.
  2. Le système affiche participants uniques, distributions démographiques/géographiques, sources.
  3. Il affiche présence, no-show et returning attendees.
  4. Les valeurs inconnues sont reportées séparément.
- **Alternatifs :** segmentation avancée = Should (Advanced Analytics).
- **Cas d'erreur :** dimension sans valeur connue → N/A ; accès PII par ANALYST → 403.
- **GWT :**
  - Given des participants avec emails différents mais même identité, Then un seul participant est compté.
  - Given des valeurs inconnues, Then elles sont exclues des pourcentages et affichées « non renseigné ».
  - Given un ANALYST, Then seuls des agrégats sont visibles.
  - Given un participant présent à plusieurs événements, Then le returning rate le détecte via l'identité interne.
- **Priorité :** Must (base). **Règles :** H-02, BR-PAR-002, BR-KPI-005. **KPI :** KPI-PAR-001/002, KPI-AUD-001 à 003, KPI-CHK-002/003/005.

---

## EPIC EXA — Exhibitor Analytics

### US-EXA-01 — Analyser l'occupation des stands
- **Rôle :** EVENT_MANAGER, OWNER, ADMIN, ANALYST ; VIEWER en lecture.
- **Objectif :** piloter l'occupation et la valeur des stands.
- **Scénario principal :**
  1. L'utilisateur sélectionne un événement.
  2. Le système affiche exposants actifs, stands réservés/disponibles/indisponibles, occupation et valeur.
  3. La valeur absente est signalée et n'est pas comptée comme 0 €.
- **Alternatifs :** comparaison inter-événements.
- **Cas d'erreur :** événement sans stand → module désactivé ; dénominateur nul → N/A.
- **GWT :**
  - Given 100 stands dont 10 indisponibles et 55 réservés, Then l'occupation est 61,11 %.
  - Given une réservation sans prix, Then la valeur est partielle et non 0 €.
  - Given un événement sans stand, Then le module est masqué.
- **Priorité :** Must. **Règles :** BR-EXH-004, BR-KPI-006. **KPI :** KPI-EXH-001 à 004.

---

## EPIC ADV — Advanced Analytics

### US-ADV-01 — Explorer les données avec des filtres avancés
- **Rôle :** ANALYST, OWNER, ADMIN.
- **Objectif :** croiser plusieurs dimensions avec drill-down contrôlé.
- **Scénario principal :**
  1. L'utilisateur combine période, événement, type, statut, source et segment.
  2. Il compare des périodes de longueur égale.
  3. Le drill-down respecte le RBAC et la pseudonymisation.
- **Alternatifs :** enregistrement de vues = Should.
- **Cas d'erreur :** croisement non supporté → message ; accès PII → 403.
- **GWT :**
  - Given un ANALYST, When il fait un drill-down, Then aucune PII n'est visible.
  - Given des périodes de comparaison, Then elles ont la même longueur.
  - Given un croisement non supporté, Then un message explicite est affiché.
- **Priorité :** Should. **Règles :** BR-ORG-007, BR-EXP-004, BR-KPI-001. **KPI :** tous.

---

## EPIC REP — Reports & Exports

### US-REP-01 — Générer un rapport prédéfini
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER, ANALYST.
- **Objectif :** produire un rapport paramétré.
- **Scénario principal :**
  1. L'utilisateur choisit un des 5 rapports prédéfinis (liste validée le 2026-11-18 : Performance d'événement, Financier, Fréquentation, Exposants, Comparaison inter-événements).
  2. Il paramètre période, événements et KPI.
  3. La génération est asynchrone et son statut est consultable.
- **Alternatifs :** rapport volumineux → traitement BullMQ.
- **Cas d'erreur :** paramètres invalides → 422 ; rôle non autorisé → 403.
- **GWT :**
  - Given un rapport paramétré, Then un job `PENDING` est créé.
  - Given une génération réussie, Then le statut est `COMPLETED`.
  - Given un échec, Then le statut est `FAILED` avec motif.
- **Priorité :** Must. **Règles :** Q-06, BR-EXP-006. **KPI :** selon le rapport.

### US-REP-02 — Exporter en PDF, Excel ou CSV
- **Rôle :** OWNER, ADMIN, EVENT_MANAGER (pseudonymisé), ANALYST (pseudonymisé).
- **Objectif :** diffuser les données.
- **Scénario principal :**
  1. L'utilisateur choisit le format.
  2. Le système génère l'export de façon asynchrone.
  3. L'export est stocké de façon privée.
- **Alternatifs :** pseudonymisation automatique pour ANALYST et EVENT_MANAGER.
- **Cas d'erreur :** format non supporté → 422 ; génération échouée → statut `FAILED`.
- **GWT :**
  - Given un export ANALYST, Then aucune PII n'est présente.
  - Given un export volumineux, Then il est asynchrone.
  - Given un échec, Then un motif est disponible.
- **Priorité :** Must. **Règles :** Q-07, H-09, BR-EXP-004. **KPI :** selon l'export.

### US-REP-03 — Télécharger un export via URL signée
- **Rôle :** utilisateur autorisé.
- **Objectif :** récupérer un export sans exposer le stockage.
- **Scénario principal :**
  1. L'utilisateur demande le téléchargement.
  2. Le système génère une URL signée temporaire (15 minutes par défaut).
  3. Le téléchargement est audité.
- **Alternatifs :** URL expirée → 410 Gone.
- **Cas d'erreur :** export purgé → 410 ; rôle non autorisé → 403.
- **GWT :**
  - Given un export disponible, When le téléchargement est demandé, Then une URL signée est retournée.
  - Given une URL expirée, Then l'accès est refusé avec 410.
  - Given un téléchargement, Then l'action est auditée.
- **Priorité :** Must. **Règles :** Q-14, BR-EXP-002, BR-AUD-002. **KPI :** aucun.

### US-REP-04 — Consulter l'historique des exports
- **Rôle :** OWNER, ADMIN (tous) ; EVENT_MANAGER/ANALYST (les leurs).
- **Objectif :** retrouver ses exports.
- **Scénario principal :** liste des exports avec utilisateur, type, format, date, statut, période et organisation.
- **Alternatifs :** le suivi backend existe même sans cette interface.
- **Cas d'erreur :** accès à l'export d'un autre utilisateur → 403.
- **GWT :**
  - Given un export, Then il apparaît dans l'historique backend.
  - Given un EVENT_MANAGER, Then il ne voit que ses exports.
  - Given l'absence d'interface, Then la purge et l'audit fonctionnent.
- **Priorité :** Should (suivi backend : Must). **Règles :** Q-14, BR-EXP-005. **KPI :** aucun.

---

## EPIC RT — Real-time Analytics

### US-RT-01 — Suivre les KPI en temps réel
- **Rôle :** EVENT_MANAGER, ADMIN, OWNER.
- **Objectif :** actualiser les KPI essentiels pendant l'événement.
- **Scénario principal :**
  1. L'utilisateur ouvre la vue temps réel d'un événement `ONGOING`.
  2. Le système reçoit les mises à jour via Socket.IO.
  3. En cas d'indisponibilité, il bascule en polling.
  4. La reconnexion resynchronise l'état.
- **Alternatifs :** aucune dépendance obligatoire à Socket.IO.
- **Cas d'erreur :** déconnexion réseau → polling ; charge élevée → limitation de fréquence.
- **GWT :**
  - Given une mise à jour d'inscription, Then la carte KPI est actualisée.
  - Given Socket.IO indisponible, Then le dashboard reste opérationnel en polling.
  - Given une reconnexion, Then l'état est resynchronisé.
- **Priorité :** Should. **Règles :** BR-RT-001, BR-RT-002. **KPI :** KPI-REG-001, KPI-CHK-001.

---

## Matrice de traçabilité stories → règles → KPI

| Epic | Stories | Règles principales | KPI principaux |
|---|---|---|---|
| AUTH | US-AUTH-01 à 04 | H-12, BR-ORG-001, BR-AUD-002/004 | — |
| ORG | US-ORG-01 à 06 | BR-ORG-004/005, Q-12, H-11, Q-14 | — |
| EVT | US-EVT-01 à 08 | BR-EVT-001 à 006, Q-10 | KPI de performance |
| PAR | US-PAR-01 à 04 | BR-PAR-001 à 005, Q-02, H-06 | KPI-PAR-001 |
| REG | US-REG-01/02, US-TIC-01 | BR-REG-001 à 004, BR-TIC-001 à 003 | KPI-REG-001/002 |
| PAY | US-PAY-01 à 04 | BR-PAY-001 à 009 | KPI-REV-001 à 008 |
| CHK | US-CHK-01 à 04 | BR-CHK-001 à 007 | KPI-CHK-001 à 005 |
| EXH | US-EXH-01 à 03 | BR-EXH-001 à 006 | KPI-EXH-001 à 004 |
| IMP | US-IMP-01 à 04 | BR-IMP-001 à 007 | Tous |
| DASH | US-DASH-01/02 | Q-13, BR-KPI-001 à 004 | KPI globaux |
| EVA | US-EVA-01/02 | BR-KPI-003, BR-CHK-004 | KPI par événement |
| REV | US-REV-01 | BR-PAY-001 à 009 | KPI-REV-001 à 008 |
| AUD | US-AUD-01 | BR-PAR-002, BR-KPI-005 | KPI-AUD-001 à 003 |
| EXA | US-EXA-01 | BR-EXH-004, BR-KPI-006 | KPI-EXH-001 à 004 |
| ADV | US-ADV-01 | BR-ORG-007, BR-EXP-004 | Tous |
| REP | US-REP-01 à 04 | BR-EXP-001 à 006 | Selon rapport |
| RT | US-RT-01 | BR-RT-001/002 | KPI temps réel |

---

*Fin de USER_STORIES.md — Version 1.0.*
