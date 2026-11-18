# DESIGN_SYSTEM.md — EventPulse Analytics

**Phase :** 2 — UI/UX Design Essentials

**Version :** 1.0

**Date :** 2026-11-18

**Périmètre :** fondations visuelles, composants essentiels, règles responsive et accessibilité

**Référence :** `docs/PRD.md` v1.1, `docs/BUSINESS_RULES.md` v1.0, `docs/KPI_DEFINITIONS.md` v1.0, `docs/USER_STORIES.md` v1.0, `VALIDATION_REPORT.md` v1.1

---

## 1. Principes directeurs

1. **Lisibilité avant densité.** L'application est un outil de pilotage : les chiffres, les statuts et les libellés doivent être lisibles avant d'être compacts.
2. **Cohérence avant originalité.** Un même composant, un même état et un même vocabulaire produisent la même expérience partout.
3. **Le contexte est toujours visible.** Organisation active, événement sélectionné, période et rôle sont affichés sans ambiguïté.
4. **Aucune donnée ambiguë.** `0`, `N/A` et « non renseigné » sont trois états visuellement et sémantiquement distincts.
5. **Les permissions sont visibles.** Les actions non autorisées sont absentes ou désactivées avec explication ; elles ne sont jamais découvertes par erreur.
6. **Desktop-first, accessible partout.** La conception cible desktop et tablette ; mobile est dégradé mais utilisable.
7. **Sobriété B2B.** Pas d'effets décoratifs, pas d'animations gratuites, pas de graphiques 3D.

---

## 2. Fondations

### 2.1 Palette de couleurs

#### Couleurs de marque

| Token | Valeur | Usage |
|---|---|---|
| `brand-600` | `#4F46E5` | Primaire : boutons, liens, focus, sélection |
| `brand-700` | `#4338CA` | Hover primaire |
| `brand-800` | `#3730A3` | Active/pressed |
| `brand-100` | `#EEF2FF` | Fond sélectionné, surfaces informatives |
| `brand-200` | `#C7D2FE` | Bordures de sélection |

#### Neutres

| Token | Valeur | Usage |
|---|---|---|
| `neutral-950` | `#020617` | Titres forts |
| `neutral-900` | `#0F172A` | Texte principal |
| `neutral-700` | `#334155` | Texte secondaire |
| `neutral-600` | `#475569` | Texte atténué, labels |
| `neutral-500` | `#64748B` | Placeholder, texte tertiaire |
| `neutral-400` | `#94A3B8` | Icônes désactivées |
| `neutral-300` | `#CBD5E1` | Bordures fortes |
| `neutral-200` | `#E2E8F0` | Bordures standards |
| `neutral-100` | `#F1F5F9` | Fond de tableau, hover de ligne |
| `neutral-50` | `#F8FAFC` | Fond de page |
| `white` | `#FFFFFF` | Surface de carte, tableau, dialogue |

#### Couleurs sémantiques

| Token | Texte | Fond | Bordure | Usage |
|---|---|---|---|---|
| `success` | `#15803D` | `#F0FDF4` | `#BBF7D0` | Validé, confirmé, payé, présent |
| `warning` | `#B45309` | `#FFFBEB` | `#FDE68A` | En attente, partiel, avertissement |
| `danger` | `#B91C1C` | `#FEF2F2` | `#FECACA` | Erreur, annulé, invalide, suppression |
| `info` | `#0369A1` | `#F0F9FF` | `#BAE6FD` | Information, publié, en cours |

#### Palette graphique

| Ordre | Valeur | Usage |
|---|---|---|
| 1 | `#4F46E5` | Série principale |
| 2 | `#0F766E` | Série secondaire |
| 3 | `#B45309` | Série tertiaire |
| 4 | `#BE123C` | Série d'alerte |
| 5 | `#6D28D9` | Série complémentaire |
| 6 | `#475569` | Série neutre |
| Comparaison | `#94A3B8` | Période précédente, trait pointillé |

**Règles :**
- Les couleurs sémantiques ne sont jamais le seul indicateur : elles sont toujours accompagnées d'un libellé ou d'une icône.
- Les séries graphiques ne dépassent pas 6 couleurs ; au-delà, regrouper les catégories secondaires.
- Les couleurs de statut sont réservées aux statuts, pas aux séries analytiques.
- Tous les couples texte/fond utilisés respectent WCAG 2.2 AA : 4,5:1 pour le texte normal, 3:1 pour le grand texte et les éléments graphiques essentiels.

### 2.2 Typographie

**Famille :** Inter, puis `ui-sans-serif`, `system-ui`, `-apple-system`, `Segoe UI`, `sans-serif`.
**Chiffres :** `font-variant-numeric: tabular-nums` pour les KPI, tableaux financiers et périodes.
**Identifiants techniques :** `ui-monospace`, `SFMono-Regular`, Menlo, monospace.

| Style | Taille / interligne | Graisse | Usage |
|---|---|---|---|
| Display | 30 / 36 px | 600 | Titre de page exceptionnel |
| H1 | 24 / 32 px | 600 | Titre de page |
| H2 | 20 / 28 px | 600 | Section |
| H3 | 16 / 24 px | 600 | Sous-section, titre de carte |
| Body | 14 / 20 px | 400 | Texte courant, tableaux |
| Body strong | 14 / 20 px | 500 | Libellés, valeurs |
| Small | 12 / 16 px | 400 | Aide, métadonnées |
| Caption | 11 / 14 px | 500 | Légendes, badges, en-têtes de colonnes |

**Règles :**
- Pas de texte inférieur à 11 px.
- Les libellés de formulaire ne sont jamais remplacés par un placeholder.
- Les montants et pourcentages utilisent des chiffres tabulaires.
- Les titres ne sont pas tronqués ; les noms longs sont tronqués avec infobulle.

### 2.3 Espacements

Base : **4 px**.

| Token | Valeur | Usage |
|---|---|---|
| `space-1` | 4 px | Micro-espace |
| `space-2` | 8 px | Icône/texte |
| `space-3` | 12 px | Cellule compacte |
| `space-4` | 16 px | Padding standard |
| `space-5` | 20 px | Padding de carte |
| `space-6` | 24 px | Gap de section, padding de page |
| `space-8` | 32 px | Séparation de blocs |
| `space-10` | 40 px | Bloc majeur |
| `space-12` | 48 px | Respiration de page |
| `space-16` | 64 px | Rare, page vide |

**Règles :** padding de page 24 px desktop / 16 px tablette / 12 px mobile ; gap de grille 24 px ; padding de carte 20–24 px ; cellule de tableau 12–16 px.

### 2.4 Bordures, rayons et ombres

| Token | Valeur | Usage |
|---|---|---|
| `radius-sm` | 4 px | Badge, petit contrôle |
| `radius-md` | 6 px | Bouton, input, select |
| `radius-lg` | 8 px | Carte, tableau, panneau |
| `radius-xl` | 12 px | Dialogue, drawer |
| `border` | 1 px `#E2E8F0` | Bordure standard |
| `border-strong` | 1 px `#CBD5E1` | Séparation forte |
| `shadow-sm` | `0 1px 2px rgba(15,23,42,.06)` | Carte au repos |
| `shadow-md` | `0 4px 12px rgba(15,23,42,.08)` | Menu, popover |
| `shadow-lg` | `0 12px 32px rgba(15,23,42,.12)` | Dialogue |

**Règles :** pas d'ombre sur les tableaux ; une seule élévation par surface ; pas de bordure et d'ombre lourdes simultanées.

### 2.5 Iconographie

- **Bibliothèque :** Lucide.
- **Tailles :** 16 px (inline), 20 px (bouton), 24 px (navigation).
- **Trait :** 1,5 px.
- Icône décorative : `aria-hidden="true"`.
- Bouton icône seule : `aria-label` obligatoire et infobulle.
- Pas d'emoji dans l'interface.

### 2.6 Grille et breakpoints

| Breakpoint | Largeur | Usage |
|---|---|---|
| `sm` | ≥ 640 px | Mobile large |
| `md` | ≥ 768 px | Tablette portrait |
| `lg` | ≥ 1024 px | Tablette paysage / petit desktop |
| `xl` | ≥ 1280 px | Desktop standard |
| `2xl` | ≥ 1536 px | Grand écran |

- Grille 12 colonnes, largeur maximale de contenu **1440 px**, gouttière 24 px.
- Sidebar déployée : **240 px** ; repliée : **64 px**.
- Header : **56 px**.
- Dashboard : 4 colonnes ≥ 1280, 2 colonnes 768–1279, 1 colonne < 768.

---

## 3. Composants essentiels

| Composant | Variantes | Comportement et règles |
|---|---|---|
| **Button** | Primaire, secondaire, outline, ghost, destructif, lien | Hauteurs 32/40/48 px ; icône avant/après ; état loading avec libellé conservé ; jamais deux actions primaires dans la même zone |
| **Input** | Texte, email, nombre, recherche, mot de passe, textarea | Label au-dessus ; aide et erreur sous le champ ; erreur reliée par `aria-describedby` ; validation au blur et à la soumission ; placeholder jamais utilisé comme label |
| **Select** | Simple, multiple, recherchable | Hauteur 40 px ; recherche pour les longues listes ; multi-sélection pour les événements (max 5) ; effacement explicite ; navigation clavier |
| **Card** | Standard, interactive, KPI | Surface blanche, bordure 1 px, rayon 8 px ; en-tête/pied optionnels ; une carte interactive est cliquable dans toute sa surface ; pas de cartes imbriquées |
| **Table** | Standard, compacte, avec sélection | En-tête collant ; tri sur les colonnes pertinentes ; pagination 25/50/100 ; actions de ligne dans un menu ; pas de sélection si aucune action groupée n'existe ; mobile en cartes |
| **Badge** | Statut, compteur, neutre | Point + libellé ; couleur sémantique ; jamais couleur seule ; taille 20–24 px |
| **Dialog** | Confirmation, formulaire court, destructif | Largeur 480/640 px ; focus piégé ; ESC ferme ; retour du focus à l'élément déclencheur ; action destructive séparée et explicite |
| **Dropdown** | Menu d'actions, filtre | Item destructif séparé ; navigation clavier ; fermeture après action ; pas de menu imbriqué profond |
| **Tabs** | Section, sous-vue | 2 à 6 onglets ; onglet actif souligné ; état conservé dans l'URL ; lazy-load des contenus lourds |
| **Sidebar** | Déployée, repliée, mobile | Sections Gestion/Analyse/Rapports/Administration ; item actif visible ; repli mémorisé ; mobile en panneau off-canvas |
| **Header** | Standard | Sélecteur d'organisation, sélecteur d'événement, breadcrumbs, menu utilisateur ; pas de recherche globale non prévue en V1 |
| **KPI Card** | Standard, comparée, N/A | Libellé, valeur, unité, variation, infobulle de définition ; état `N/A` distinct de `0` ; clic vers l'analyse filtrée si autorisé |
| **Charts** | Ligne, aire, barres, barres empilées | Recharts ; axes lisibles ; grille discrète ; légende ; infobulle avec KPI et formule ; comparaison en pointillé ; tableau de données accessible |
| **Toast** | Succès, erreur, information | Coin supérieur droit ; 5 s ; `aria-live` ; jamais utilisé pour une erreur de validation de champ |
| **Loading** | Skeleton, progress, spinner local | Skeleton pour dashboards/tableaux ; progress pour imports/exports ; spinner local pour action courte ; pas de spinner plein écran prolongé |
| **Empty State** | Aucune donnée, aucun résultat, accès refusé | Explique la cause et l'action suivante ; CTA uniquement si l'utilisateur est autorisé ; ne pas confondre avec une erreur |

### 3.1 Règles de composition

- Une page a **un seul titre H1** et une action primaire principale.
- Les filtres sont au-dessus du contenu, sur une ligne ou dans un panneau repliable sur petit écran.
- Les actions destructives ne sont jamais l'action par défaut d'un menu.
- Les formulaires longs utilisent une page ou un drawer, pas un dialogue.
- Les tableaux financiers affichent les montants alignés à droite ; les libellés à gauche ; les statuts au centre ou à gauche selon la colonne.
- Les graphiques ne sont jamais l'unique source d'une donnée : un tableau ou un résumé textuel est disponible.

---

## 4. Règles d'affichage des données

### 4.1 Montants, pourcentages, dates

| Type | Format | Exemple |
|---|---|---|
| Montant EUR | `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })` | `42 000,00 €` |
| Pourcentage | 2 décimales, espace insécable avant `%` | `61,11 %` |
| Nombre | séparateur de milliers | `50 000` |
| Date métier | fuseau de l'événement, sinon organisation | `12 mai 2026, 14:30` |
| Audit | UTC explicite | `2026-11-18 14:30:00 UTC` |
| Identifiant | monospace, tronqué avec copie | `evt_01J...` |

### 4.2 Zéro, N/A et non renseigné

| État | Affichage | Règle |
|---|---|---|
| Valeur réelle nulle | `0`, `0 €`, `0 %` | Texte normal ; ne jamais afficher `N/A` |
| Donnée indisponible | `N/A` en texte atténué + infobulle | Aucune donnée source ou dénominateur nul |
| Valeur déclarative inconnue | Badge « Non renseigné » | Exclue des pourcentages, reportée séparément |
| Accès interdit | « Non autorisé » ou absence de l'élément | Ne pas afficher une valeur masquée comme `N/A` |

**Interdits :** afficher `0` à la place de `N/A` ; afficher `N/A` pour une erreur réseau ; colorer un `0` comme une absence de données.

### 4.3 Mapping des statuts

| Domaine | Statut | Badge |
|---|---|---|
| Événement | `DRAFT` | Neutre |
| Événement | `PUBLISHED` | Info |
| Événement | `ONGOING` | Succès |
| Événement | `COMPLETED` | Neutre foncé |
| Événement | `ARCHIVED` | Neutre atténué |
| Événement | `CANCELLED` | Danger |
| Inscription | `PENDING` | Avertissement |
| Inscription | `CONFIRMED` | Succès |
| Inscription | `WAITLISTED` | Info |
| Inscription | `CANCELLED` | Danger |
| Transaction | `PENDING` | Avertissement |
| Transaction | `PAID` | Succès |
| Transaction | `FAILED` | Danger |
| Transaction | `CANCELLED` | Neutre |
| Transaction | `PARTIALLY_REFUNDED` | Avertissement |
| Transaction | `REFUNDED` | Info |
| Check-in | `VALID` | Succès |
| Check-in | `INVALID` | Danger |
| Stand | `AVAILABLE` | Info |
| Stand | `RESERVED` | Succès |
| Stand | `UNAVAILABLE` | Neutre + icône verrou |
| Réservation | `ACTIVE` | Succès |
| Réservation | `RELEASED` | Neutre |

---

## 5. Responsive

### 5.1 Desktop ≥ 1280 px

- Sidebar déployée, header complet, 4 KPI par ligne.
- Tableaux avec toutes les colonnes principales.
- Graphiques côte à côte lorsque la lecture le permet.

### 5.2 Tablette 768–1279 px

- Sidebar repliable en icônes ; header compact.
- 2 KPI par ligne ; graphiques empilés si nécessaire.
- Tableaux avec défilement horizontal maîtrisé et colonnes secondaires masquées.
- Filtres sur une ligne avec « Plus de filtres » si besoin.

### 5.3 Mobile < 768 px

- Sidebar en panneau off-canvas ; sélecteurs d'organisation/événement dans une barre de contexte.
- 1 KPI par ligne ; graphiques pleine largeur.
- Tableaux transformés en cartes (titre, 3–5 champs clés, menu d'actions) ou défilement horizontal si la comparaison de colonnes est essentielle.
- Formulaires sur une colonne ; dialogues plein écran ; barre d'action collante en bas.
- Zones tactiles ≥ 44 × 44 px.

---

## 6. Accessibilité WCAG 2.2 AA

### 6.1 Règles obligatoires

- Contraste minimal 4,5:1 pour le texte, 3:1 pour les composants et graphiques essentiels.
- Focus visible : anneau 2 px `brand-600`, décalage 2 px, jamais supprimé.
- Navigation clavier complète : sidebar, menus, tableaux, dialogues, onglets, graphiques avec commandes.
- Lien d'évitement « Aller au contenu principal ».
- Repères sémantiques : `header`, `nav`, `main`, `aside`, `footer`.
- Chaque champ a un label visible et associé.
- Les erreurs sont annoncées et reliées au champ ; un résumé d'erreur est affiché en haut du formulaire.
- Les messages de succès/erreur utilisent une zone `aria-live`.
- Les tableaux ont des en-têtes explicites et un titre.
- Les graphiques ont un résumé textuel et un tableau de données alternatif.
- Aucune information ne repose uniquement sur la couleur.
- Respect de `prefers-reduced-motion` ; animations ≤ 200 ms et non essentielles.
- Zoom 200 % sans perte de contenu ni chevauchement.
- Cibles tactiles ≥ 24 × 24 px (44 px recommandé sur mobile).

### 6.2 Dialogues et menus

- Focus piégé dans le dialogue ; ESC ferme ; retour du focus au déclencheur.
- Menu ouvert au clavier avec `Entrée`/`Espace`, navigation par flèches, `Échap` pour fermer.
- Action destructive annoncée avec le nom de l'objet concerné.

### 6.3 Graphiques

- Titre et description accessibles.
- Légende interactive avec état sélectionné.
- Infobulle clavier accessible.
- Tableau de données disponible via « Afficher les données ».
- Ne pas utiliser de graphique en anneau pour plus de 5 catégories ; préférer des barres.

---

## 7. Anti-patterns

- Tableau de 15 colonnes sans priorisation.
- Graphique sans unité, sans période ou sans définition.
- `N/A` stylé comme `0`.
- Trois actions primaires concurrentes.
- Dialogue pour un formulaire long.
- Filtre appliqué sans indication visible.
- Statut uniquement coloré.
- Auto-refresh silencieux sans indicateur.
- Message d'erreur générique sans action corrective.
- Sidebar contenant des modules non autorisés.

---

## 8. Traçabilité

| Élément du Design System | Source Phase 1 |
|---|---|
| Rôles et permissions visuelles | PRD §9 et Annexe A |
| Statuts et transitions | PRD §11, `BUSINESS_RULES.md` |
| KPI et formats | `KPI_DEFINITIONS.md` §0 et §1 |
| Règles N/A vs 0 | `KPI_DEFINITIONS.md` §0.5 |
| Accessibilité WCAG 2.2 AA | PRD §16 |
| Exports et pseudonymisation | PRD §13.1, `BUSINESS_RULES.md` BR-EXP |
| Audit UTC et champs | PRD §18.3, BR-AUD |

---

*Fin de DESIGN_SYSTEM.md — Version 1.0.*
