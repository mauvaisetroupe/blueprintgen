// Shared building blocks

export type NodeShape = 'rect' | 'cylinder' | 'rounded'

export interface Category {
  id: string
  name: string
  order: number
  showSubgraph: boolean
}

// Définition statique d'une catégorie par défaut — nodeShape dérivé à la volée, rien n'est stocké dans le DAG
export interface DefaultCategoryDef {
  name: string
  order: number
  showSubgraph: boolean
  nodeShape?: NodeShape
}

export interface Component {
  id: string
  name: string
  description: string
  categoryId: string
  // Champs techniques — renseignés dans le Technical Landscape, optionnels
  technology?: string
  framework?: string
  constraints?: string
}

// --- Landscape section ---

export interface Landscape {
  useElk?: boolean
  autoSync?: boolean               // inclure les relations des flows dans le landscape
  categorySubgraphs?: Record<string, boolean>  // override de showSubgraph par catégorie (clé = ID stable)
}

// --- Relations ---

// source: 'manual' = explicitement ajouté par l'architecte (peut ne pas être couvert par une séquence)
// undefined = legacy / avant l'introduction du champ
export interface Relation {
  id: string
  fromComponentId: string
  toComponentId: string
  label?: string
  protocol?: string   // protocole technique (HTTPS, REST, AMQP…) — distinct du label fonctionnel
  source?: 'manual'
}

// --- Technical landscape section ---

export interface NetworkZone {
  id: string
  name: string
  order: number
}

// Instance de déploiement d'un composant applicatif dans une zone réseau.
// Un composant peut avoir plusieurs instances (ex: une en DMZ, une en Internal).
export interface ComponentInstance {
  id: string
  componentId: string    // référence au composant applicatif logique
  networkZoneId: string  // zone réseau de déploiement
}

// Service technique pur (logging, monitoring, SIEM…) — pas d'équivalent applicatif.
// Les relations vers les TechnicalServices sont hors scope pour l'instant.
export interface TechnicalService {
  id: string
  name: string
  description?: string
}

// Relation technique entre deux instances de déploiement.
export interface TechnicalRelation {
  id: string
  fromInstanceId: string
  toInstanceId: string
  protocol?: string
  label?: string
}

export interface TechnicalLandscape {
  customNetworkZones: NetworkZone[]   // zones ajoutées par l'architecte — les zones par défaut ne sont PAS stockées ici
  instances: ComponentInstance[]
  technicalRelations: TechnicalRelation[]
  technicalServices: TechnicalService[]
  useElk?: boolean
  categorySubgraphs?: Record<string, boolean>
}

// Zones réseau prédéfinies (non renommables, dérivé à la volée comme pour les catégories)
export interface DefaultNetworkZoneDef {
  name: string
  order: number
  // Couleur appliquée aux pills de la vue et au subgraph du diagramme Mermaid
  fill:   string   // fond (ex: '#f0fdf4')
  stroke: string   // bordure (ex: '#86efac')
}

// Nuances de vert — du plus externe (pâle) au plus interne (soutenu)
export const DEFAULT_NETWORK_ZONES: DefaultNetworkZoneDef[] = [
  { name: 'Internet',         order: 1, fill: '#f0fdf4', stroke: '#86efac' },
  { name: 'External',         order: 2, fill: '#dcfce7', stroke: '#4ade80' },
  { name: 'DMZ',              order: 3, fill: '#bbf7d0', stroke: '#22c55e' },
  { name: 'Internal',         order: 4, fill: '#a7f3d0', stroke: '#059669' },
  { name: 'Managed Services', order: 5, fill: '#6ee7b7', stroke: '#047857' },
]

export const DEFAULT_ZONE_NAMES = new Set<string>(
  DEFAULT_NETWORK_ZONES.map((z) => z.name.toLowerCase()),
)

// Lookup nom → couleurs (case-insensitive)
export const DEFAULT_ZONE_COLORS = new Map<string, { fill: string; stroke: string }>(
  DEFAULT_NETWORK_ZONES.map((z) => [z.name.toLowerCase(), { fill: z.fill, stroke: z.stroke }]),
)

// ID stable dérivé du nom — utilisé pour les zones par défaut (non stockées dans le DAG)
export function defaultZoneId(name: string): string {
  return `zone__${name.toLowerCase().replace(/\s+/g, '_')}`
}

// Liste complète des zones : defaults (IDs stables) + zones custom du DAG
export function allNetworkZones(tl: TechnicalLandscape): NetworkZone[] {
  const defaults: NetworkZone[] = DEFAULT_NETWORK_ZONES.map((z) => ({
    id:    defaultZoneId(z.name),
    name:  z.name,
    order: z.order,
  }))
  const customs = (tl.customNetworkZones ?? []).map((z, i) => ({
    ...z,
    order: DEFAULT_NETWORK_ZONES.length + i + 1,
  }))
  return [...defaults, ...customs]
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
  customCategories: Category[]       // catégories ajoutées par l'architecte ; les défauts sont dérivés à la volée
  disabledCategoryIds?: string[]     // IDs stables des catégories par défaut désactivées pour ce DAG
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
  { name: 'Users',            order: 1, showSubgraph: true,  nodeShape: 'rounded'  },
  { name: 'Frontends',        order: 2, showSubgraph: true  },
  { name: 'Backends',         order: 3, showSubgraph: true  },
  { name: 'Brokers',          order: 4, showSubgraph: true  },
  { name: 'Batchs',           order: 5, showSubgraph: true  },
  { name: 'Data Storage',     order: 6, showSubgraph: true,  nodeShape: 'cylinder' },
  { name: 'Analytics',        order: 7, showSubgraph: true  },
  { name: 'External Systems', order: 8, showSubgraph: true,  nodeShape: 'rounded'  },
]

// Noms des catégories par défaut (case-insensitive) — pour dériver isDefault à la volée
export const DEFAULT_CATEGORY_NAMES = new Set<string>(
  DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase()),
)

// Lookup rapide nom → forme (case-insensitive)
export const DEFAULT_SHAPE_BY_NAME = new Map<string, NodeShape>(
  DEFAULT_CATEGORIES
    .filter((c) => c.nodeShape !== undefined)
    .map((c) => [c.name.toLowerCase(), c.nodeShape!]),
)

// ID stable dérivé du nom — utilisé pour les catégories par défaut (non stockées dans le DAG)
export function defaultCategoryId(name: string): string {
  return `cat__${name.toLowerCase().replace(/\s+/g, '_')}`
}

// Liste complète des catégories : defaults actifs (IDs stables) + catégories custom du DAG
// Gère aussi l'ancien format (dag.categories stocké) pour la compatibilité descendante
export function allCategories(dag: Dag): Category[] {
  // Rétrocompatibilité : ancien format avec 'categories' stocké
  const legacy = (dag as unknown as { categories?: Category[] }).categories
  if (legacy !== undefined && !dag.customCategories) {
    const defaultNames = new Set(DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase()))
    const customs = legacy.filter((c) => !defaultNames.has(c.name.toLowerCase()))
    const disabled = new Set(
      DEFAULT_CATEGORIES
        .filter((def) => !legacy.some((c) => c.name.toLowerCase() === def.name.toLowerCase()))
        .map((def) => defaultCategoryId(def.name)),
    )
    const defaults: Category[] = DEFAULT_CATEGORIES
      .filter((c) => !disabled.has(defaultCategoryId(c.name)))
      .map((c) => ({ id: defaultCategoryId(c.name), name: c.name, order: c.order, showSubgraph: c.showSubgraph }))
    return [...defaults, ...customs.map((c, i) => ({ ...c, order: DEFAULT_CATEGORIES.length + i + 1 }))]
  }

  // Nouveau format
  const disabled = new Set(dag.disabledCategoryIds ?? [])
  const defaults: Category[] = DEFAULT_CATEGORIES
    .filter((c) => !disabled.has(defaultCategoryId(c.name)))
    .map((c) => ({
      id:           defaultCategoryId(c.name),
      name:         c.name,
      order:        c.order,
      showSubgraph: c.showSubgraph,
    }))
  const customs = (dag.customCategories ?? []).map((c, i) => ({
    ...c,
    order: DEFAULT_CATEGORIES.length + i + 1,
  }))
  return [...defaults, ...customs]
}
