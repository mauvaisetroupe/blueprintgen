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

## PPTX Export

Each flow generates a slide in the PowerPoint export:
- sequence diagram on the left two-thirds
- numbered bullet points for the steps on the right third
