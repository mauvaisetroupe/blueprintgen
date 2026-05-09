# YAML Format — Reference

The `.dag.yaml` file is BlueprintGen's text-based persistence format.
It can be edited directly in a text editor or IDE, versioned in Git, and re-imported at any time.

## Principles

- **Structure is declared explicitly** — categories, network zones, and component membership are declared as structured data, not inferred from diagram layout.
- **Diagrams describe relations only** — `landscape:` and `technical-landscape:` contain only arrows; subgraphs are generated automatically by the application.
- **Single source of truth** — a component's category comes from its `category:` field, a component's zone(s) from its `zones:` field. No duplication.
- **Stable component IDs** — the YAML key of a component is its Mermaid node ID. It is set once and never changes, even if the display name is later modified.

## Component IDs (keys)

Each component entry is keyed by its **stable Mermaid node ID** — lowercase, non-alphanumeric characters replaced with underscores.

```yaml
components:
  web_frontend:        # ← this is the stable node ID
    name: Web Frontend # ← this is the display name shown in the UI and diagrams
```

The `name:` field is **optional**. If absent, the display name is derived from the key by replacing underscores with spaces and capitalising the first character:

| Key | Derived name | `name:` required? |
|---|---|---|
| `web_frontend` | `Web frontend` | Yes — if you want `Web Frontend` |
| `backend_api` | `Backend api` | Yes — if you want `Backend API` |
| `user` | `User` | No |
| `monitoring` | `Monitoring` | No |
| `internet_user` | `Internet user` | No |
| `payment_gateway` | `Payment gateway` | Yes — if you want `Payment Gateway` |

When the app exports a DAG as YAML, `name:` is written only when it differs from the derived value.

## Global structure

```yaml
name: My Application          # DAG name (required)
description: |                # Free-text description (optional)
  Short description.

categories:                   # Categories used in this DAG (required)
  - Frontends
  - Backends
  - ...

network-zones:                # Network zones (optional)
  - Internet
  - DMZ
  - ...

components:                   # Application components
  my_component:
    name: My Component        # Optional — see "Component IDs" above
    category: Backends        # Must match an entry in categories:
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
    description: Prometheus + Grafana.

landscape: |                  # Application relations — arrows only
  flowchart TB
  component_a -->|HTTPS| component_b

technical-landscape: |        # Technical relations — arrows only (optional)
  flowchart TB
  component_a -->|REST| component_b

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
# name: is omitted when it matches the key derivation rule (underscores → spaces,
# first character capitalised). Specify name: only for non-standard casing.
components:
  user:
    category: Users
    zones: [Internet]
    description: End user accessing the platform via a web browser.

  web_frontend:
    name: Web Frontend        # "Web frontend" would be derived — capital F needed
    category: Frontends
    zones: [DMZ]
    technology: React
    framework: Vite

  backend_api:
    name: Backend API         # "Backend api" would be derived — capital A needed
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
    name: WAF                 # "Waf" would be derived — all-caps needed
    category: Technical Services
    zones: [Internet]
    description: Web Application Firewall — filters inbound Internet traffic.

  api_gateway:
    name: API Gateway         # "Api gateway" would be derived
    category: Auth Gateway
    zones: [DMZ]
    description: Kong — protection and routing of inbound API calls.

# ── Cross-cutting technical services ─────────────────────────────────────────
technical-services:
  monitoring:
    description: Prometheus + Grafana — metrics and dashboards.

  logging:
    description: Elasticsearch + Kibana — centralised log aggregation.

# ── Application landscape — arrows only ──────────────────────────────────────
# No subgraphs, no node declarations. The application generates subgraphs
# automatically from the category declared on each component.
landscape: |
  flowchart TB
  user -->|HTTPS| web_frontend
  web_frontend -->|HTTPS/JSON| backend_api
  backend_api -->|REST| order_service
  backend_api -->|REST| payment_service
  order_service --> orders_db
  payment_service -->|HTTPS| payment_gateway

# ── Technical landscape — arrows only ────────────────────────────────────────
# Subgraphs (network zones) are generated from the zones: field on each component.
technical-landscape: |
  flowchart TB
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
# Use component node IDs (keys) as participant names.
# Participant declarations are auto-injected at render time — do not add them.
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

## Rules

- **`categories:` is required** — a YAML file without a top-level `categories:` list is rejected on import.
- Every category referenced by a component's `category:` field must appear in `categories:`.
- Every zone referenced by a component's `zones:` field must appear in `network-zones:`.
- Component keys are their **stable Mermaid node IDs** — lowercase, non-alphanumeric characters replaced with underscores. They must be unique across `components:` and `technical-components:`.
- A component key is permanent. Changing it in the YAML creates a new component; the old one is lost.
- `name:` is optional. When absent, the display name is derived from the key (`keyToName`). Specify `name:` only when the desired display name has different casing or characters.
- `landscape:` and `technical-landscape:` contain only arrow lines. Do **not** add `subgraph`, node declarations, or extra directives. The `flowchart TB` header is optional (added automatically on import if absent).
- Flow `diagram:` bodies contain only arrows. Do **not** add `participant` or `actor` declarations — they are auto-injected at render time.
- `technology`, `framework`, `constraints`, `zones`, and `description` are optional on any component.
