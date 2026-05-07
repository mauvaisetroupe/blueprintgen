# Application Components

This view manages the functional components of the application and their categories.

## Categories

Categories group components by functional nature (e.g. Frontends, Backends, Data Storage, External Systems…).

- Click **+ Add Category** to create a category
- Each category maps to a `subgraph` in the Mermaid diagram

## Components

A component represents an identifiable application block in the landscape (service, frontend, database…).

- Click **+ Add Component** inside a category to add a component
- Fill in the **name** (unique identifier in the DAG) and the functional **description**
- Descriptions can contain line breaks (`\n`) for rendering in the diagram

## Tips

- Always start here before moving to the Landscape tab
- Components defined here automatically populate all other tabs
- Avoid spaces and special characters in names (they are used as Mermaid identifiers)
