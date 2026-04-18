<script setup lang="ts">
import { computed } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { minimalSetup } from 'codemirror'
import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'

const props = defineProps<{
  modelValue: string
  completionNames?: string[]
  validationStatus?: 'idle' | 'validating' | 'syntax-error' | 'warnings' | 'valid'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Read latest names at completion call time (closure over reactive computed)
const currentNames = computed(() => props.completionNames ?? [])

function completionSource(context: CompletionContext): CompletionResult | null {
  const names = currentNames.value
  if (names.length === 0) return null

  const line = context.state.doc.lineAt(context.pos)
  const textToCursor = line.text.slice(0, context.pos - line.from)

  // After an arrow (sequence or flowchart): suggest target participant/node
  const afterArrow = textToCursor.match(/(?:->>|-->>|-x|--x|->|-->|=>>|==>)\s*(\w*)$/)
  if (afterArrow) {
    return {
      from: context.pos - (afterArrow[1]?.length ?? 0),
      options: names.map((n) => ({ label: n, type: 'variable' as const })),
    }
  }

  // After "participant " keyword
  const afterParticipant = textToCursor.match(/^\s*participant\s+(\w*)$/)
  if (afterParticipant) {
    return {
      from: context.pos - (afterParticipant[1]?.length ?? 0),
      options: names.map((n) => ({ label: n, type: 'variable' as const })),
    }
  }

  // Explicit trigger (Ctrl+Space) at start of line: suggest source participant/node
  if (context.explicit) {
    const atStart = textToCursor.match(/^\s*(\w*)$/)
    if (atStart) {
      return {
        from: context.pos - (atStart[1]?.length ?? 0),
        options: names.map((n) => ({ label: n, type: 'variable' as const })),
      }
    }
  }

  return null
}

const extensions = [
  minimalSetup,
  autocompletion({ override: [completionSource], activateOnTyping: true }),
]
</script>

<template>
  <Codemirror
    :model-value="modelValue"
    :extensions="extensions"
    :indent-with-tab="true"
    spellcheck="false"
    :class="['dsl-editor', `status-${validationStatus ?? 'idle'}`]"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<style scoped>
.dsl-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dsl-editor :deep(.vue-codemirror) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.dsl-editor :deep(.cm-editor) {
  flex: 1;
  min-height: 0;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  background: var(--p-surface-50, #fafafa);
  border-right: 1px solid var(--p-content-border-color);
}

.dsl-editor :deep(.cm-editor.cm-focused) {
  outline: none;
  background: var(--p-surface-0);
}

.dsl-editor :deep(.cm-scroller) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  overflow-y: scroll;
  scrollbar-gutter: stable;
}

.dsl-editor.status-syntax-error :deep(.cm-editor) {
  border-left: 3px solid #dc2626;
}

.dsl-editor.status-warnings :deep(.cm-editor) {
  border-left: 3px solid #d97706;
}

/* Autocomplete dropdown styling */
.dsl-editor :deep(.cm-tooltip-autocomplete) {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.82rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.dsl-editor :deep(.cm-completionLabel) {
  font-size: 0.82rem;
}
</style>
