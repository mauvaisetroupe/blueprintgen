import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'

type Lang = 'fr' | 'en'

const helpFr = import.meta.glob('../help/fr/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const helpEn = import.meta.glob('../help/en/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const routeToFile: Record<string, string> = {
  'dag-overview':              'components',
  'dag-technical-components':  'technical-components',
  'dag-landscape':             'landscape',
  'dag-flows':                 'flows',
  'dag-technical-zones':       'technical',
  'dag-technical-relations':   'technical',
  'dag-security':              'security',
}

const savedLang = localStorage.getItem('helpLang') as Lang | null
const isOpen = ref(false)
const lang   = ref<Lang>(savedLang ?? 'fr')

export function useHelp() {
  const route = useRoute()

  const rawContent = computed(() => {
    const routeName = route.name as string
    const fileName  = routeToFile[routeName] ?? 'default'
    const map       = lang.value === 'en' ? helpEn : helpFr
    const key       = `../help/${lang.value}/${fileName}.md`
    return map[key] ?? ''
  })

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function close() {
    isOpen.value = false
  }

  function setLang(l: Lang) {
    lang.value = l
    localStorage.setItem('helpLang', l)
  }

  return { isOpen, lang, rawContent, toggle, close, setLang }
}
