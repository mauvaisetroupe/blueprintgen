// Shared building blocks

export interface Category {
  id: string
  name: string
  order: number
  showSubgraph: boolean
}

export interface Component {
  id: string
  name: string
  description: string
  categoryId: string
}

// --- Landscape section ---

export type LandscapeMode = 'guided' | 'manual' | 'autosync'

export interface Landscape {
  mermaidDsl?: string // manually edited DSL overrides generated one
  mode?: LandscapeMode
  useElk?: boolean
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
}

export interface ApplicationFlow {
  id: string
  name: string
  description: string
  steps: FlowStep[]
  mermaidDsl?: string
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

// Default categories based on the reference Mermaid example
export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Users',            order: 1, showSubgraph: true },
  { name: 'Frontends',        order: 2, showSubgraph: true },
  { name: 'Backends',         order: 3, showSubgraph: true },
  { name: 'Brokers',          order: 4, showSubgraph: true },
  { name: 'Batchs',           order: 5, showSubgraph: true },
  { name: 'Data Storage',     order: 6, showSubgraph: true },
  { name: 'Analytics',        order: 7, showSubgraph: true },
  { name: 'External Systems', order: 8, showSubgraph: true },
]
