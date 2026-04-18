import { defineStore } from 'pinia'
import { ref } from 'vue'
import { type Dag, type Category, type Component, type Relation, DEFAULT_CATEGORIES } from '@/types/dag'
import type { ParsedDsl } from '@/utils/dslParser'

function generateId(): string {
  return crypto.randomUUID()
}

function now(): string {
  return new Date().toISOString()
}

export const useDagStore = defineStore(
  'dag',
  () => {
    const dags = ref<Dag[]>([])

    // --- DAG CRUD ---

    function createDag(name: string, description: string): Dag {
      const dag: Dag = {
        id: generateId(),
        name,
        description,
        createdAt: now(),
        updatedAt: now(),
        categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, id: generateId() })),
        components: [],
        relations: [],
        landscape: {},
        technicalLandscape: { components: [] },
        applicationFlows: [],
      }
      dags.value.push(dag)
      return dag
    }

    function updateDag(id: string, patch: Partial<Pick<Dag, 'name' | 'description'>>) {
      const dag = getDag(id)
      if (!dag) return
      Object.assign(dag, patch, { updatedAt: now() })
    }

    function deleteDag(id: string) {
      dags.value = dags.value.filter((d) => d.id !== id)
    }

    function getDag(id: string): Dag | undefined {
      return dags.value.find((d) => d.id === id)
    }

    // --- Categories ---

    function addCategory(dagId: string, name: string): Category {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const category: Category = {
        id: generateId(),
        name,
        order: dag.categories.length + 1,
        showSubgraph: true,
      }
      dag.categories.push(category)
      dag.updatedAt = now()
      return category
    }

    function updateCategory(dagId: string, categoryId: string, patch: Partial<Omit<Category, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const category = dag.categories.find((c) => c.id === categoryId)
      if (!category) return
      Object.assign(category, patch)
      dag.updatedAt = now()
    }

    function deleteCategory(dagId: string, categoryId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.categories = dag.categories.filter((c) => c.id !== categoryId)
      dag.components
        .filter((c) => c.categoryId === categoryId)
        .forEach((c) => (c.categoryId = ''))
      dag.updatedAt = now()
    }

    // --- Components ---

    function addComponent(dagId: string, name: string, description: string, categoryId: string): Component {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const component: Component = {
        id: generateId(),
        name,
        description,
        categoryId,
      }
      dag.components.push(component)
      dag.updatedAt = now()
      return component
    }

    function updateComponent(dagId: string, componentId: string, patch: Partial<Omit<Component, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const component = dag.components.find((c) => c.id === componentId)
      if (!component) return
      Object.assign(component, patch)
      dag.updatedAt = now()
    }

    function deleteComponent(dagId: string, componentId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.components = dag.components.filter((c) => c.id !== componentId)
      // Remove relations involving this component
      dag.relations = dag.relations.filter(
        (r) => r.fromComponentId !== componentId && r.toComponentId !== componentId,
      )
      dag.updatedAt = now()
    }

    // --- Relations ---

    function addRelation(dagId: string, fromComponentId: string, toComponentId: string, label?: string): Relation {
      const dag = getDag(dagId)
      if (!dag) throw new Error(`DAG ${dagId} not found`)
      const relation: Relation = {
        id: generateId(),
        fromComponentId,
        toComponentId,
        label,
      }
      dag.relations.push(relation)
      dag.updatedAt = now()
      return relation
    }

    function updateRelation(dagId: string, relationId: string, patch: Partial<Omit<Relation, 'id'>>) {
      const dag = getDag(dagId)
      if (!dag) return
      const relation = dag.relations.find((r) => r.id === relationId)
      if (!relation) return
      Object.assign(relation, patch)
      dag.updatedAt = now()
    }

    function deleteRelation(dagId: string, relationId: string) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.relations = dag.relations.filter((r) => r.id !== relationId)
      dag.updatedAt = now()
    }

    // --- Sync model from parsed DSL ---
    function syncFromDsl(dagId: string, parsed: ParsedDsl) {
      const dag = getDag(dagId)
      if (!dag) return

      for (const node of parsed.nodes) {
        let category = node.subgraph ? dag.categories.find((c) => c.name === node.subgraph) : null
        if (node.subgraph && !category) {
          category = {
            id: generateId(),
            name: node.subgraph,
            order: dag.categories.length + 1,
            showSubgraph: true,
          }
          dag.categories.push(category)
        }

        const component = dag.components.find((c) => c.name === node.label)
        if (!component) {
          dag.components.push({
            id: generateId(),
            name: node.label,
            description: '',
            categoryId: category?.id ?? '',
          })
        } else if (category && component.categoryId !== category.id) {
          component.categoryId = category.id
        }
      }

      dag.updatedAt = now()
    }

    // --- Save landscape DSL ---
    function saveLandscapeDsl(dagId: string, dsl: string | undefined) {
      const dag = getDag(dagId)
      if (!dag) return
      dag.landscape.mermaidDsl = dsl || undefined
      dag.updatedAt = now()
    }

    return {
      dags,
      createDag,
      updateDag,
      deleteDag,
      getDag,
      addCategory,
      updateCategory,
      deleteCategory,
      addComponent,
      updateComponent,
      deleteComponent,
      addRelation,
      updateRelation,
      deleteRelation,
      syncFromDsl,
      saveLandscapeDsl,
    }
  },
  {
    persist: true,
  },
)
