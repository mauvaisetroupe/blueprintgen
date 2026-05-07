import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

import componentsHelp from '../help/components.md?raw'
import technicalComponentsHelp from '../help/technical-components.md?raw'
import landscapeHelp from '../help/landscape.md?raw'
import flowsHelp from '../help/flows.md?raw'
import technicalHelp from '../help/technical.md?raw'
import securityHelp from '../help/security.md?raw'
import defaultHelp from '../help/default.md?raw'

const helpByRoute: Record<string, string> = {
  'dag-overview': componentsHelp,
  'dag-technical-components': technicalComponentsHelp,
  'dag-landscape': landscapeHelp,
  'dag-flows': flowsHelp,
  'dag-technical-zones': technicalHelp,
  'dag-technical-relations': technicalHelp,
  'dag-security': securityHelp,
}

// État singleton partagé entre les composants
const isOpen = ref(false)

export function useHelp() {
  const route = useRoute()

  const rawContent = computed(() => {
    const routeName = route.name as string
    return helpByRoute[routeName] ?? defaultHelp
  })

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function close() {
    isOpen.value = false
  }

  return { isOpen, rawContent, toggle, close }
}
