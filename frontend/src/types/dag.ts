// Shared building blocks

export type NodeShape = 'rect' | 'cylinder' | 'rounded'

export interface Category {
  id: string
  name: string
  order: number
  showSubgraph: boolean
  isDefault?: boolean   // catégories du référentiel — non renommables
}

// Forme Mermaid associée à chaque catégorie par défaut — dérivée à la volée, non stockée dans le DAG
export interface DefaultCategoryDef {
  name: string
  order: number
  showSubgraph: boolean
  isDefault: true
  nodeShape?: NodeShape
}

export interface Component {
  id: string
  name: string
  description: string
  categoryId: string
}

// --- Landscape section ---

export interface Landscape {
  useElk?: boolean
  autoSync?: boolean  // inclure les relations des flows dans le landscape
}

// --- Technical landscape section ---

export interface TechnicalComponent {
  componentId: string
  technology?: string
  framework?: string
  constraints?: string
  networkZone?: string
}

export interface TechnicalLandscape {
  components: TechnicalComponent[]
  mermaidDsl?: string
}

// --- Application flows section ---

export interface FlowStep {
  id: string
  fromComponentId: string
  toComponentId: string
  label?: string
  protocol?: string
  order: number
  isReturn?: boolean   // true pour les flèches -->> (réponse), false/undefined pour les forwards
}

export interface ApplicationFlow {
  id: string
  name: string
  description: string
  steps: FlowStep[]
  mermaidDsl?: string
  viewOptions?: FlowsViewOptions
}

// --- Relations ---

// source: 'manual' = explicitement ajouté par l'architecte (peut ne pas être couvert par une séquence)
// undefined = legacy / avant l'introduction du champ
export interface Relation {
  id: string
  fromComponentId: string
  toComponentId: string
  label?: string
  source?: 'manual'
}

// --- Flows view options ---

export interface FlowsViewOptions {
  diagramMode?: 'sequence' | 'activity'
  useElk?: boolean
  showReturns?: boolean
  subgraphCategoryIds?: string[]   // undefined = toutes les catégories activées
}

// --- DAG root ---

export interface Dag {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string

  // Shared pool — referenced by all sections
  categories: Category[]
  components: Component[]
  relations: Relation[]

  // Sections
  landscape: Landscape
  technicalLandscape: TechnicalLandscape
  applicationFlows: ApplicationFlow[]
}

// --- Generic import format (used by external apps to pre-populate a DAG) ---

export interface DagImportDraftComponent {
  name: string
  description: string
  category: string  // category name
}

export interface DagImportDraft {
  id: string        // stable ID provided by the calling app — used for upsert
  name: string
  description: string
  categories: string[]
  components?: DagImportDraftComponent[]
}

// Default categories based on the reference Mermaid example
export const DEFAULT_CATEGORIES: DefaultCategoryDef[] = [
  { name: 'Users',            order: 1, showSubgraph: true,  isDefault: true, nodeShape: 'rounded'  },
  { name: 'Frontends',        order: 2, showSubgraph: true,  isDefault: true },
  { name: 'Backends',         order: 3, showSubgraph: true,  isDefault: true },
  { name: 'Brokers',          order: 4, showSubgraph: true,  isDefault: true },
  { name: 'Batchs',           order: 5, showSubgraph: true,  isDefault: true },
  { name: 'Data Storage',     order: 6, showSubgraph: true,  isDefault: true, nodeShape: 'cylinder' },
  { name: 'Analytics',        order: 7, showSubgraph: true,  isDefault: true },
  { name: 'External Systems', order: 8, showSubgraph: true,  isDefault: true, nodeShape: 'rounded'  },
]

// Lookup rapide nom → forme (case-insensitive)
export const DEFAULT_SHAPE_BY_NAME = new Map<string, NodeShape>(
  DEFAULT_CATEGORIES
    .filter((c) => c.nodeShape !== undefined)
    .map((c) => [c.name.toLowerCase(), c.nodeShape!]),
)
