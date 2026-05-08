# YAML Format — Reference

The `.dag.yaml` file is BlueprintGen's text-based persistence format.
It can be edited directly in a text editor or IDE, versioned in Git, and re-imported at any time.

## Principles

- **Structure is declared explicitly** — categories, network zones, and component membership are declared as structured data, not inferred from diagram layout.
- **Diagrams describe relations only** — `landscape:` and `technical-landscape:` contain only arrows; subgraphs are generated automatically by the application.
- **Single source of truth** — a component's category comes from its `category:` field, a component's zone(s) from its `zones:` field. No duplication.

## Global structure

```yaml
name: My Application          # DAG name (required)
description: |                # Free-text description (optional)
  Short description.

categories:                   # Categories used in this DAG
  - Frontends
  - Backends
  - ...

network-zones:                # Network zones (optional)
  - Internet
  - DMZ
  - ...

components:                   # Application components
  my_component:
    name: My Component        # Display name
    category: Backends        # Must exist in categories list
    zones: [DMZ]              # Optional — zones where this component is deployed
    description: ...
    technology: ...

technical-components:         # Technical/infrastructure components (same structure)
  my_gateway:
    name: My Gateway
    category: Auth Gateway
    zones: [DMZ]

technical-services:           # Cross-cutting services (monitoring, logging…)
  monitoring:
    name: Monitoring
    description: ...

landscape: |                  # Application relations — arrows only, no subgraphs
  component_a -->|HTTPS| component_b
  ...

technical-landscape: |        # Technical relations — arrows only (optional)
  component_a -->|REST| component_b
  ...

flows:                        # Application flows (sequence diagrams)
  - name: ...
    diagram: |
      sequenceDiagram
      ...
```

---

## Full commented example

```yaml
name: E-Commerce Platform
description: |
  Internet-facing e-commerce platform.
  Microservices architecture deployed in the cloud.

# ── Categories used in this DAG ───────────────────────────────────────────────
categories:
  - Users
  - Frontends
  - Backends
  - Data Storage
  - External Systems
  - Auth Gateway
  - Technical Services

# ── Network zones ─────────────────────────────────────────────────────────────
network-zones:
  - Internet
  - DMZ
  - Intranet

# ── Application components ────────────────────────────────────────────────────
# Key = Mermaid node ID: non-alphanumeric characters replaced by underscores, lowercased.
# Example: "Web Frontend" → web_frontend, "Backend API" → backend_api
components:
  user:
    name: User
    category: Users
    zones: [Internet]
    description: End user accessing the platform via a web browser.

  web_frontend:
    name: Web Frontend
    category: Frontends
    zones: [DMZ]
    technology: React
    framework: Vite

  backend_api:
    name: Backend API
    category: Backends
    zones: [Intranet]
    technology: Spring Boot

  order_service:
    name: Order Service
    category: Backends
    zones: [Intranet]
    technology: Spring Boot
    constraints: |
      Must guarantee idempotency for order creation.

  payment_service:
    name: Payment Service
    category: Backends
    zones: [Intranet]
    technology: Node.js

  orders_db:
    name: Orders DB
    category: Data Storage
    zones: [Intranet]
    technology: PostgreSQL

  payment_gateway:
    name: Payment Gateway
    category: External Systems

# ── Technical components ──────────────────────────────────────────────────────
technical-components:
  waf:
    name: WAF
    category: Technical Services
    zones: [Internet]
    description: Web Application Firewall — filters inbound Internet traffic.

  api_gateway:
    name: API Gateway
    category: Auth Gateway
    zones: [DMZ]
    description: Kong — protection and routing of inbound API calls.

# ── Cross-cutting technical services ─────────────────────────────────────────
technical-services:
  monitoring:
    name: Monitoring
    description: Prometheus + Grafana — metrics and dashboards.

  logging:
    name: Logging
    description: Elasticsearch + Kibana — centralised log aggregation.

# ── Application landscape — arrows only ──────────────────────────────────────
# No subgraphs, no node declarations. The application generates subgraphs
# automatically from the category declared on each component.
landscape: |
  user -->|HTTPS| web_frontend
  web_frontend -->|HTTPS/JSON| backend_api
  backend_api -->|REST| order_service
  backend_api -->|REST| payment_service
  order_service --> orders_db
  payment_service -->|HTTPS| payment_gateway

# ── Technical landscape — arrows only ────────────────────────────────────────
# Same principle. Subgraphs (network zones) are generated from the zones: field.
technical-landscape: |
  user -->|HTTPS| waf
  waf -->|HTTPS| web_frontend
  web_frontend -->|HTTPS/JSON| api_gateway
  api_gateway -->|REST| backend_api
  backend_api -->|REST| order_service
  backend_api -->|REST| payment_service
  order_service --> orders_db
  backend_api --> monitoring
  backend_api --> logging

# ── Application flows ─────────────────────────────────────────────────────────
# Participant declarations are auto-injected at render time from component names.
flows:
  - name: Place an order
    description: |
      Main flow for creating an order from the frontend.
    diagram: |
      sequenceDiagram
        user->>web_frontend: Confirm cart
        web_frontend->>backend_api: POST /api/orders
        backend_api->>order_service: createOrder(items)
        order_service->>orders_db: INSERT order
        order_service-->>backend_api: orderId
        backend_api->>payment_service: processPayment(orderId)
        payment_service-->>backend_api: confirmed
        backend_api-->>web_frontend: 201 Created
        web_frontend-->>user: Order confirmation

  - name: Browse catalog
    description: Read flow for the product catalog.
    diagram: |
      sequenceDiagram
        user->>web_frontend: Open catalog
        web_frontend->>backend_api: GET /api/catalog
        backend_api-->>web_frontend: 200 OK — product list
        web_frontend-->>user: Display catalog
```

---

## Rules to follow

- **`categories:`** must list every category referenced by a component's `category:` field.
- **`network-zones:`** must list every zone referenced by a component's `zones:` field.
- Component keys are derived from the display name: non-alphanumeric characters replaced with underscores, lowercased (`"Web Frontend"` → `web_frontend`).
- The `name:` field is the display name shown in diagrams and the UI.
- `landscape:` and `technical-landscape:` contain only arrow lines — do **not** add `subgraph`, node declarations, or `flowchart TB`.
- Flow `diagram:` bodies contain only arrows — do **not** add `participant` or `actor` declarations; they are auto-injected at render time.
- `technology`, `framework`, `constraints`, `zones`, and `description` are optional.
