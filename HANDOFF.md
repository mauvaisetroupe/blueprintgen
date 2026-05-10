# blueprintgen — Handoff Document
> Généré le 2026-05-09. Passez ce fichier à n'importe quel LLM pour reprendre le travail sans rien relire.

---

## 1. Contexte métier

**blueprintgen** est la suite de workflow de **Architect Advisor** (application existante qui collecte les infos d'architecture via questionnaire).

Lionel travaille dans un centre informatique. Les solution architects lui soumettent des DAG (Documents d'Architecture Générale). blueprintgen permet de :
- Collecter les informations d'architecture structurées (composants, flux, zones réseau, sécurité)
- Visualiser des diagrammes Mermaid interactifs (landscape applicatif + technique + flux)
- Générer les livrables : PowerPoint DAG, SVG, draw.io, YAML/JSON

Le DAG contient 4 artefacts :
1. **Application Landscape** — composants fonctionnels avec catégories (subgraphs)
2. **Application Flows** — diagrammes de séquence représentatifs
3. **Technical Landscape** — même composants + zones réseau + composants techniques + protocoles
4. **Security** — authn/authz, API Gateway, WAF, File Transfer (en cours)

---

## 2. Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vue 3 + Vite + TypeScript |
| UI components | PrimeVue (thème Aura) + PrimeIcons |
| État | Pinia + pinia-plugin-persistedstate (localStorage) |
| Routing | Vue Router |
| Diagrammes | Mermaid.js + layout ELK (`@mermaid-js/layout-elk`) |
| Export PowerPoint | pptxgenjs (dans le browser) |
| Export draw.io | XML mxGraphModel généré depuis le SVG Mermaid (Mode B) |
| Backend (futur) | Spring Boot + PostgreSQL (pas encore implémenté) |
| Déploiement | Docker + OpenShift (intranet) |
| Config runtime | `public/config.js` chargé au démarrage (BASE_URL pour deep-route refresh) |

---

## 3. Architecture du frontend

```
frontend/src/
├── types/dag.ts           # Tous les types TypeScript (source de vérité du modèle)
├── stores/dag.ts          # Pinia store — tout le CRUD + migrations défensives
├── router/index.ts        # Routes SPA
├── main.ts                # Bootstrap : Pinia, PrimeVue, Mermaid ELK, v-tooltip
├── views/
│   ├── DagListView.vue         # Liste des DAGs
│   ├── DagCreateView.vue       # Création d'un DAG
│   ├── DagDeleteView.vue       # Suppression
│   ├── DagImportView.vue       # Import depuis Architect Advisor (DagImportDraft)
│   ├── YamlSyntaxView.vue      # Page aide syntaxe YAML
│   └── DagDetailLayout.vue     # Layout parent : tabs + DSL toggle + export PPTX/YAML/JSON
│       └── dag/
│           ├── DagOverviewView.vue        # Onglet Components (et Technical Components, via prop listKey)
│           ├── LandscapeView.vue          # Onglet Landscape
│           ├── ApplicationFlowsView.vue   # Onglet Application Flows
│           ├── TechnicalLandscapeView.vue # Onglet Technical Landscape (layout + tabs)
│           │   └── technical/
│           │       ├── TechnicalComponentsView.vue  # Sous-onglet Network Zones
│           │       └── TechnicalRelationsView.vue   # Sous-onglet Relations
│           └── SecurityView.vue           # Onglet Security (mostly coming soon)
├── components/
│   ├── MermaidDiagram.vue                   # Wrapper Mermaid
│   ├── DslEditor.vue                        # Éditeur DSL avec read-only header + autocomplétion
│   ├── HelpPanel.vue                        # Panneau d'aide contextuel markdown
│   └── dag/
│       ├── CategoryCard.vue                 # Carte catégorie (composants)
│       ├── CategorySpreadsheet.vue          # Tableau spreadsheet catégories/composants
│       ├── RelationSpreadsheet.vue          # Tableau relations (landscape guidé)
│       ├── FlowStepSpreadsheet.vue          # Tableau steps (flows guidé)
│       ├── ImportLandscapeRelationsDialog.vue  # Import relations depuis flows → landscape
│       └── ImportRelationsDialog.vue           # Import relations depuis landscape → tech landscape
├── composables/
│   └── useHelp.ts         # Logique panneau d'aide contextuel
├── help/
│   ├── en/                # Fichiers markdown aide EN (components, flows, landscape, security, technical, yaml-syntax)
│   └── fr/                # Idem FR
└── utils/
    ├── landscapeDslGenerator.ts         # Génère le DSL Mermaid flowchart (landscape applicatif)
    ├── technicalLandscapeDslGenerator.ts # Génère le DSL Mermaid (technical landscape)
    ├── sequenceDslGenerator.ts          # Génère sequenceDiagram + buildActivityDsl
    ├── dslParser.ts                     # Parse un DSL flowchart → nodes + relations
    ├── dslValidator.ts                  # Valide le DSL contre le modèle (warnings fonctionnels)
    ├── importParser.ts                  # Parse import externe (DagImportDraft)
    ├── dagYamlExporter.ts               # Export YAML du DAG complet
    ├── dagYamlImporter.ts               # Import YAML → DAG (upsert)
    ├── drawioExporter.ts                # Export .drawio (Mode B SVG→mxGraphModel + Mode C embed)
    ├── pptxExporter.ts                  # Export PowerPoint (pptxgenjs)
    ├── pptxSequenceOverlay.ts           # Overlay chiffres cerclés sur slides flow
    └── svgInliner.ts                    # SVG → pptx-ready (inline styles, htmlLabels:false)
```

---

## 4. Modèle de données (`types/dag.ts`)

```typescript
interface Dag {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string

  // Catégories
  customCategories: Category[]        // catégories non-défaut ajoutées par l'architecte
  disabledCategoryIds?: string[]      // IDs stables des catégories par défaut désactivées

  // Composants (applicatifs et techniques partagent le même type)
  components: Component[]             // composants du landscape applicatif
  technicalComponents: Component[]    // composants techniques (Auth Gateway, IAM…)
  relations: Relation[]               // relations logiques (landscape applicatif)

  // Sections
  landscape: Landscape                // useElk, categorySubgraphs
  technicalLandscape: TechnicalLandscape
  applicationFlows: ApplicationFlow[]
}

interface Component {
  id: string
  nodeId: string     // ID Mermaid stable (généré une fois depuis le nom, jamais modifié auto)
  name: string
  description: string
  categoryId: string
  technology?: string
  framework?: string
  constraints?: string
}

interface Relation {
  id: string
  fromComponentId: string
  toComponentId: string
  label?: string
  protocol?: string
  source?: 'manual'
  imported?: boolean   // importé depuis les flows (permet le "Clean imported")
}

interface TechnicalLandscape {
  customNetworkZones: NetworkZone[]
  instances: ComponentInstance[]      // déploiement composant ↔ zone réseau
  technicalRelations: TechnicalRelation[]
  technicalServices: TechnicalService[]
  useElk?: boolean
  categorySubgraphs?: Record<string, boolean>
}

interface TechnicalRelation {
  id: string
  fromComponentId: string  // relation logique parente
  toComponentId: string
  fromInstanceId: string   // instance physique (zone source)
  toInstanceId: string
  protocol?: string
  label?: string
  imported?: boolean       // importé depuis landscape applicatif
}

interface ApplicationFlow {
  id: string
  name: string
  description: string
  steps: FlowStep[]
  mermaidDsl?: string
  viewOptions?: FlowsViewOptions   // persisté par flow (mode, ELK, returns, subgraphs)
}
```

**Catégories par défaut** (IDs stables `cat__<name>`, non stockées dans le DAG) :
Users, Frontends, Backends, Brokers, Batchs, Data Storage, Analytics, External Systems, Auth Gateway, IAM, Permission Manager, Technical Services

**Zones réseau par défaut** (IDs stables `zone__<name>`) :
Internet, External, DMZ, Internal, Managed Services

---

## 5. État des features

### ✅ IMPLÉMENTÉ

#### DAG Management
- CRUD DAG (create, list, update, delete)
- Import depuis Architect Advisor via `DagImportDraft` (upsert par ID stable)
- Save/Load JSON natif
- Export/Import YAML complet
- Migrations défensives dans le store (formats anciens compatibles)

#### Categories & Components
- Catégories par défaut (universelles, non stockées) + catégories custom
- Enable/disable catégories par défaut par DAG
- CRUD composants applicatifs (`components`) dans `CategorySpreadsheet`
- CRUD composants techniques (`technicalComponents`) dans le même composant via prop `listKey`
- `nodeId` stable (dérivé du nom à la création, jamais modifié automatiquement)

#### Application Landscape
- Génération DSL Mermaid flowchart depuis le modèle
- Mode guidé : `RelationSpreadsheet` pour ajouter/modifier les relations
- Mode DSL : éditeur avec header read-only (composants) + zone éditable (relations)
- Validation syntaxe Mermaid + validation fonctionnelle (warnings si composants inconnus)
- Autocomplétion des `nodeId` dans l'éditeur DSL
- Toggle ELK / Dagre
- Toggle subgraph par catégorie
- Import relations depuis les flows (`ImportLandscapeRelationsDialog`) avec flag `imported`
- "Clean imported" pour supprimer les relations importées
- Export SVG (raw + pptx-ready)
- Export DSL Mermaid (.mmd)
- Export draw.io : Mode B (SVG→mxGraphModel), Mode C (embed Mermaid dans draw.io)

#### Application Flows
- CRUD flows (nom, description)
- Mode guidé : `FlowStepSpreadsheet`
- Mode DSL : éditeur sequenceDiagram avec header read-only (liste des participants)
- Validation syntaxe + détection "unknown participants"
- Warning si relations du flow absentes du landscape + bouton "Add to landscape"
- Mode visualisation : **sequence** (sequenceDiagram) ou **activity** (flowchart depuis steps)
  - En mode activity : toggle ELK, toggle "Returns", toggle subgraphs par catégorie
- Options de vue persistées par flow (`viewOptions`)
- Export SVG, DSL, draw.io (activity → mxGraphModel, embed Mermaid)
- Migration auto : anciens flows sans steps → parse du DSL au chargement

#### Technical Landscape
- **Network Zones** : 5 zones par défaut (couleurs codées) + zones custom
- **Component Instances** : assignation composant ↔ zone réseau
- Génération DSL Mermaid flowchart technique (composants dans leurs zones)
- **Technical Relations** : relations entre instances (physiques), dérivées des relations logiques
  - Mode DSL : éditeur avec autocomplétion des node IDs (`comp__zone`)
  - Import depuis landscape applicatif (`ImportRelationsDialog`) avec flag `imported`
  - "Clean imported" pour supprimer les relations importées
- Toggle ELK, toggle subgraphs par catégorie
- Export SVG, DSL Mermaid

#### Security
- Vue squelette avec 4 sous-onglets (Authentication, API Gateway, WAF, Files)
- Tout est "coming soon" — **non implémenté**

#### Export PowerPoint (PPTX)
- `pptxExporter.ts` : génère un PPTX complet avec :
  - Slide landscape applicatif (SVG rasterisé en PNG via canvas 2×)
  - Slide landscape technique (idem)
  - Slides flow par flow (SVG + overlay chiffres cerclés sur les flèches)
- `pptxSequenceOverlay.ts` : positionnement des chiffres cerclés
- `svgInliner.ts` : `inlineSvgStyles`, `injectHtmlLabelsFalse`, `styleCircledDigits`

#### Système d'aide contextuel
- `HelpPanel.vue` + `useHelp.ts`
- Fichiers markdown FR/EN pour chaque onglet : components, flows, landscape, security, technical, technical-components, yaml-syntax
- Tooltips sur les éléments UI (directif `v-tooltip` PrimeVue)

#### Toggle DSL Edit global
- Toggle "DSL Edit" dans le header de `DagDetailLayout`
- Partagé entre onglets via `provide/inject('dslEdit')`
- Désactivé sur les onglets Components, Technical Components, Security
- Préférence persistée dans le store (`dslEditPreference`)

---

### ❌ NON IMPLÉMENTÉ (dans CLAUDE.md mais pas dans le code)

| Feature | Statut |
|---|---|
| **Security — Authentication/AuthZ** | Squelette "coming soon" uniquement |
| **Security — API Gateway** | Squelette "coming soon" uniquement |
| **Security — WAF** | Squelette "coming soon" uniquement |
| **Security — File Transfer / Antivirus** | Squelette "coming soon" uniquement |
| **Protocoles sur les flèches (landscape)** | Champ `protocol` présent dans le modèle, pas exposé dans l'UI des relations landscape |
| **Backend Spring Boot** | Pas commencé (tout est localStorage pour l'instant) |
| **PostgreSQL** | Pas commencé |
| **Export draw.io Mode A** (ELK positions → mxGraphModel) | Non implémenté (Mode B et C sont là) |
| **DATA section** | Pas mentionnée dans le code — positionnement golden sources dans le landscape |
| **Templates PPTX personnalisables** | pptxExporter hardcodé, pas de système de templates |

---

## 6. Routes

```
/                          → DagListView (liste des DAGs)
/dag/new                   → DagCreateView
/import                    → DagImportView (import depuis Architect Advisor)
/dag/:id/delete            → DagDeleteView
/help/yaml-syntax          → YamlSyntaxView

/dag/:id/                  → DagDetailLayout (layout parent avec tabs)
  components               → DagOverviewView (listKey=components)
  technical-components     → DagOverviewView (listKey=technicalComponents)
  landscape                → LandscapeView
  flows                    → ApplicationFlowsView
  technical/components     → TechnicalComponentsView (zones réseau)
  technical/relations      → TechnicalRelationsView (relations techniques)
  security                 → SecurityView
```

---

## 7. Store Pinia — fonctions disponibles

```typescript
// DAG CRUD
createDag(name, description): Dag
updateDag(id, patch)
deleteDag(id)
openDag(data: Dag): Dag          // import JSON natif (génère nouvel ID)
importDag(draft: DagImportDraft): Dag  // import depuis Advisor (upsert par ID)
getDag(id): Dag | undefined      // applique migrations défensives au passage

// Catégories
addCategory(dagId, name): Category
updateCategory(dagId, categoryId, patch)
deleteCategory(dagId, categoryId)
setLandscapeCategorySubgraph(dagId, categoryId, show)

// Composants applicatifs
addComponent(dagId, name, description, categoryId): Component
updateComponent(dagId, componentId, patch)
deleteComponent(dagId, componentId)  // cascade: supprime relations + technicalRelations

// Composants techniques
addTechnicalComponent / updateTechnicalComponent / deleteTechnicalComponent

// Relations logiques (landscape)
addRelation(dagId, fromComponentId, toComponentId, label?): Relation
updateRelation(dagId, relationId, patch)
deleteRelation(dagId, relationId)  // cascade: supprime technicalRelations
replaceManualRelations(dagId, relations[])    // depuis éditeur DSL
importLandscapeRelationsFromFlows(dagId, selections[])  // flag imported=true
cleanImportedLandscapeRelations(dagId)

// Flows
addFlow(dagId, name, description, mermaidDsl?): ApplicationFlow
updateFlow(dagId, flowId, patch)
deleteFlow(dagId, flowId)
saveFlowSteps(dagId, flowId, steps[])

// Sync DSL → store
syncFromDsl(dagId, parsedDsl, listKey)

// Zones réseau
addNetworkZone(dagId, name): NetworkZone
deleteNetworkZone(dagId, zoneId)  // cascade: instances + technicalRelations

// Instances (composant ↔ zone)
assignZone(dagId, componentId, networkZoneId): ComponentInstance
removeZoneAssignment(dagId, instanceId)

// Relations techniques
addTechnicalRelation(dagId, fromCompId, toCompId, fromInstId, toInstId, protocol?, label?)
updateTechnicalRelation(dagId, relationId, patch)
deleteTechnicalRelation(dagId, relationId)
replaceTechnicalRelations(dagId, relations[])
importTechnicalRelationsFromLandscape(dagId, selections[])  // flag imported=true
cleanImportedTechnicalRelations(dagId)

// Services techniques
addTechnicalService(dagId, name, description?): TechnicalService
deleteTechnicalService(dagId, serviceId)

// Préférences UI (persistées)
setLandscapeUseElk(dagId, useElk)
setTechnicalLandscapeUseElk(dagId, useElk)
setTechnicalCategorySubgraph(dagId, categoryId, show)
setDslEditPreference(value)  // préférence globale DSL edit
```

---

## 8. Utilitaires clés

### `landscapeDslGenerator.ts`
- `generateLandscapeDsl(dag)` — DSL complet (header + composants + relations)
- `generateLandscapeHeader(dag)` — frontmatter Mermaid config
- `generateComponentsBody(dag, withSubgraphs, withFlowchartTB)` — nodes uniquement
- `generateManualRelationsBody(dag)` — flèches manuelles uniquement (pour l'éditeur)
- `parseRelationsBody(body, dag)` — parse les flèches → relations logiques
- `toNodeId(name)` — nom → nodeId Mermaid stable

### `technicalLandscapeDslGenerator.ts`
- `generateTechnicalLandscapeDsl(dag)` — DSL technique complet (zones en subgraphs)
- `generateTechnicalRelationsBody(dag)` — flèches des instances
- `parseTechnicalRelationsBody(body, dag)` — parse → TechnicalRelations
- `validateTechnicalRelationsBody(body, dag)` — validation fonctionnelle
- `getCompletionNames(dag)` — noms des instances pour autocomplétion

### `sequenceDslGenerator.ts`
- `buildSequenceDsl(body, dag)` — wraps le body en sequenceDiagram complet
- `buildActivityDsl(body, dag, useElk, subgraphCategoryIds, showReturns)` — flowchart depuis steps
- `buildSequenceBodyFromSteps(steps, dag)` — steps structurés → lignes DSL
- `parseFlowSteps(dsl, dag)` — DSL → FlowStep[]
- `findMissingLandscapeRelations(flow, dag)` — relations du flow absentes du landscape
- `findUnknownParticipants(dsl, dag)` — nodeIds non reconnus

### `drawioExporter.ts`
- `exportToDrawio(dag)` — Mode B : SVG Mermaid → parse positions → mxGraphModel XML
- `openInDrawio(dsl)` — Mode C : ouvre draw.io avec le DSL Mermaid en embed
- `downloadDrawioViaMermaid(dsl, name)` — Mode C : télécharge .drawio avec le DSL
- `exportFlowToDrawio(dag, flow, subgraphIds, showReturns)` — export flow en mode activity

### `dagYamlExporter.ts` / `dagYamlImporter.ts`
- Export/import YAML complet du DAG (catégories, composants, relations, zones, flows, steps)
- Import supporte l'upsert (met à jour un DAG existant si même nom)

### `svgInliner.ts`
- `inlineSvgStyles(svg)` — inline les styles CSS pour export pptx-ready
- `injectHtmlLabelsFalse(dsl)` — injecte `htmlLabels: false` dans le frontmatter Mermaid
- `styleCircledDigits(svg)` — colore les chiffres cerclés (overlay PPTX)

---

## 9. Bugs connus

### Actif
- **Browser scrollbar flash dans LandscapeView** : la scrollbar apparaît brièvement quand on tape dans l'éditeur DSL. Probablement un reflow transitoire du Splitter PrimeVue ou du re-render SVG Mermaid. `overflow-y: scroll` sur body atténue mais ne supprime pas.

### Résolus (pour mémoire)
- Unknown participants silencieux → bandeau rouge "Unknown participants"
- `manualDsl` non initialisé au remontage → `loadStoredBody()` à l'init
- DSL stocké avec header → stripping au chargement
- "Add to landscape" en mode manual n'appendait pas au DSL
- Banner "synced" malgré erreurs → condition stricte
- Ref-truthiness bug : `if (someRef)` est toujours true — toujours utiliser `if (someRef.value)`

---

## 10. Conventions de code

- Vue 3 Composition API (`<script setup>`) — pas d'Options API
- TypeScript strict, **pas de `any`** — typer tous les modèles
- Nommage : camelCase JS/TS, snake_case SQL
- **Tout le code et commentaires en anglais**
- Les types liés à l'import restent génériques (`DagImportDraft`, pas `AdvisorDraft`)
- Pas de commit automatique — Lionel gère lui-même ses commits
- Avant tout refactor architectural, proposer l'approche et attendre confirmation
- Pas de flag-hacks (ex: `suppressStoreWatch`) — préférer les modèles uniformes

---

## 11. Style de collaboration

- Lionel valide architecturalement et pushback sur les mauvaises approches
- Il attrape les erreurs TypeScript et les renvoie pour correction
- Sessions longues avec itérations fréquentes sur les détails UX
- Pour les features landscape/relations, le pattern est toujours : import dialog + "Clean imported" button + flag `imported` sur les entités
- Les `TechnicalRelation` sont des instanciations physiques des `Relation` logiques — ils ne doivent pas être séparés en deux pools distincts

---

## 12. Comment reprendre le travail

1. Lire ce fichier pour le contexte
2. `cd frontend && npm run dev` pour lancer le dev server
3. `npm run build` ou `tsc --noEmit` pour vérifier les types avant de livrer
4. Le store est dans `localStorage` du navigateur — les DAGs créés persistent entre sessions
5. Pour tester l'import depuis Architect Advisor : aller sur `/import` et coller un `DagImportDraft` JSON

### Questions utiles à poser à l'IA en début de session :
- "Montre-moi la vue XYZ" → lire `src/views/dag/XYZView.vue`
- "Comment fonctionnent les TechnicalRelations ?" → voir `types/dag.ts` lignes 79-88 + store `dag.ts`
- "Qu'est-ce qui n'est pas encore fait ?" → section 5 "NON IMPLÉMENTÉ" ci-dessus
