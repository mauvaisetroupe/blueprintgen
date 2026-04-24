/**
 * SVG utilities for export — browser-side implementation.
 *
 * Problem: Mermaid flowchart SVG uses a <style> block with CSS variables
 * (var(--mermaid-...)) to style cluster/subgraph backgrounds.
 * PowerPoint does not evaluate CSS inside SVG, so the raw presentation
 * attribute (fill="#000000") shows through → black cluster boxes.
 *
 * Fix: targeted — only inline the computed fill/stroke for cluster container
 * elements. Everything else (text, edges, nodes) already has correct
 * presentation attributes and is left untouched.
 *
 * The <style> block is kept in the SVG. PowerPoint ignores it, but keeping
 * it avoids any risk of breaking elements that might rely on it in other
 * rendering contexts.
 *
 * NOTE: browser-only (uses DOM + window.getComputedStyle).
 * For a backend implementation, replace with jsdom + css-select, or use
 * Playwright headless to capture computed styles.
 */

/**
 * Injects `htmlLabels: false` into Mermaid DSL frontmatter so that flowchart
 * node labels are rendered as SVG <text> elements instead of <foreignObject>.
 * PowerPoint (and many other consumers) cannot render <foreignObject>.
 * Sequence diagrams already use <text> natively and are unaffected.
 */
export function injectHtmlLabelsFalse(dsl: string): string {
  if (dsl.trimStart().startsWith('---')) {
    // Insert before the closing --- of the frontmatter block
    return dsl.replace(/(---[\s\S]*?)(---)/, '$1    flowchart:\n      htmlLabels: false\n$2')
  }
  return `---\nconfig:\n    flowchart:\n      htmlLabels: false\n---\n${dsl}`
}

// Selectors that identify cluster/subgraph container shapes in Mermaid flowchart SVG
const CLUSTER_SELECTORS = [
  '.cluster rect',
  '.cluster polygon',
  '.cluster path',
]

export function inlineSvgStyles(svgString: string): string {
  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:-99999px;top:-99999px;visibility:hidden;pointer-events:none'
  document.body.appendChild(container)
  container.innerHTML = svgString

  const svg = container.querySelector('svg')
  if (!svg) {
    document.body.removeChild(container)
    return svgString
  }

  // Fix cluster backgrounds: read computed fill/stroke (CSS vars resolved by browser)
  // and write them back as plain presentation attributes that PowerPoint can read.
  for (const selector of CLUSTER_SELECTORS) {
    svg.querySelectorAll<SVGElement>(selector).forEach((el) => {
      fixAttr(el, 'fill')
      fixAttr(el, 'stroke')
    })
  }

  const result = svg.outerHTML
  document.body.removeChild(container)
  return result
}

function fixAttr(el: SVGElement, attr: string): void {
  const computed = window.getComputedStyle(el).getPropertyValue(attr).trim()
  if (computed && computed !== 'none' && !isTransparent(computed)) {
    el.setAttribute(attr, computed)
  }
}

// rgba(0,0,0,0) and "transparent" are both "no color" — don't apply
function isTransparent(color: string): boolean {
  return color === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(color)
}

const CIRCLED_DIGIT_RE = /^(\s*[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*)(.*)/s

/**
 * Colore et agrandit les chiffres cerclés ①②③ dans le SVG Mermaid.
 * Cible les labels de flèches dans les diagrammes de séquence et d'activité.
 * Remplace chaque text par deux <tspan> : le ① stylisé + le reste du label normal.
 */
export function styleCircledDigits(
  svgString: string,
  color = '2D6FBF',
  fontSize = 18,
): string {
  const div = document.createElement('div')
  div.innerHTML = svgString
  const svg = div.querySelector('svg')
  if (!svg) return svgString

  const selectors = ['text.messageText', 'g.edgeLabel text']

  for (const selector of selectors) {
    svg.querySelectorAll<SVGTextElement>(selector).forEach((el) => {
      const text = el.textContent ?? ''
      const match = text.match(CIRCLED_DIGIT_RE)
      if (!match) return

      const circle = match[1] ?? ''
      const rest   = match[2] ?? ''

      el.textContent = ''

      const tCircle = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      tCircle.setAttribute('fill', `#${color}`)
      tCircle.setAttribute('font-size', String(fontSize))
      tCircle.setAttribute('font-weight', 'bold')
      tCircle.textContent = circle

      const tRest = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
      tRest.textContent = rest

      el.appendChild(tCircle)
      el.appendChild(tRest)

      // Move g.edgeLabel to end of SVG so it renders above nodes.
      // g.edgeLabel carries its own transform="translate(x,y)" so position is preserved.
      const edgeLabel = el.closest('g.edgeLabel')
      if (edgeLabel) svg.appendChild(edgeLabel)
    })
  }

  return div.querySelector('svg')?.outerHTML ?? svgString
}
