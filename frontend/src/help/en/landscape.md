# Application Landscape

This view generates and visualizes the **application landscape diagram** in Mermaid format.

## Edit modes

### Guided mode (DSL Edit off)

- Add **relations** between components using the table
- Fill in the source, target, and optionally a label (protocol, description)
- The Mermaid DSL is regenerated automatically

### DSL mode (DSL Edit on)

- Edit the Mermaid code directly in the editor
- Syntax is validated in real time
- Components used must exist in the DAG component list

## Rendering options

- **ELK layout** — advanced positioning algorithm, recommended for complex graphs
- **Standard layout** — default Mermaid layout, simpler
- Each category can optionally be grouped in a `subgraph`

## Export

- **Export SVG** — vector image for use in PowerPoint
- **Export draw.io** — editable `.drawio` file for the architect
- **Open in draw.io** — open directly in draw.io via the embed API

## Import from flows

The **Import from Flows** button pre-fills landscape relations from steps already defined in sequence diagrams. This avoids re-entering relations already modelled in flows.

## Tips

- Start in guided mode, switch to DSL mode for fine-tuning
- Relations defined here serve as the basis for building flows
