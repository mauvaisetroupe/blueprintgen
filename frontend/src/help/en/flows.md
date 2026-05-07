# Application Flows

This view lets you create **sequence diagrams** for the main flows between components.

## What is a flow?

A flow is a Mermaid `sequenceDiagram` that illustrates a representative use case.
It does not aim for exhaustiveness (it is not BPMN), but for understanding the dynamic between components.

## Creating a flow

1. Click **+ New Flow** to create a flow
2. Give it a name and a description
3. Add **steps**: each step is a message between two components
4. Fill in the message description and protocol if needed

## Edit modes

- **Guided mode** — step table, order can be changed by drag and drop
- **DSL mode** — direct editing of the Mermaid `sequenceDiagram`

## Visual options

These options are per-flow and are saved automatically.

### Sequence / Activity

The same flow can be visualised in two ways:
- **Sequence** — classic sequence diagram with vertical lifelines, most readable for component interactions
- **Activity** — the flow is rendered as a flowchart (directed graph), useful to highlight the chain of actions rather than the exchanges

### Show return arrows

In Sequence mode, return arrows (responses, `-->>`) are hidden by default to keep the diagram lean. Toggle this on to make them visible.

### ELK layout *(Activity mode only)*

Uses the ELK algorithm to position nodes in the Activity flowchart, instead of the standard Mermaid layout. Recommended for complex flows.

### Subgraphs *(Activity mode only)*

In Activity mode, participants can be visually grouped by functional category (Frontends, Backends…). Check or uncheck each category to refine the display.

## PPTX Export

Each flow generates a slide in the PowerPoint export:
- sequence diagram on the left two-thirds
- numbered bullet points for the steps on the right third
