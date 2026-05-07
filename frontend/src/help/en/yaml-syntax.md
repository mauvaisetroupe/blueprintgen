# YAML Format — Reference

The `.dag.yaml` file is BlueprintGen's text-based persistence format.
It can be edited directly in a text editor or IDE, versioned in Git, and re-imported into the application at any time.

## Global structure

```yaml
name: My Application          # DAG name (required)
description: |                # Free-text description (optional)
  Order management application
  deployed on intranet.

components: ...               # Application components
technical-components: ...     # Technical components (IAM, proxy…)
technical-services: ...       # Cross-cutting technical services (monitoring, logging…)
landscape: |                  # Application landscape diagram (Mermaid flowchart)
  flowchart TB
  ...
technical-landscape: |        # Technical landscape diagram (optional)
  flowchart TB
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

# ── Application components ────────────────────────────────────────────────────
# Each key is the Mermaid identifier for the component (no spaces or special characters).
components:
  WebFrontend:
    description: |
      React SPA exposed on the Internet.
      Main user entry point.
    technology: React
    framework: Vite

  BackendAPI:
    description: Central REST API — routes requests to business services.
    technology: Spring Boot

  OrderService:
    description: Manages the order lifecycle.
    technology: Spring Boot
    constraints: |
      Must guarantee idempotency for order creation.

  PaymentService:
    description: Integration with the external payment gateway.
    technology: Node.js

  OrdersDB:
    description: Orders database.
    technology: PostgreSQL

# ── Technical components (IAM, proxy, gateway…) ───────────────────────────────
technical-components:
  APIGateway:
    description: Kong — protection and routing of inbound API calls.

  WAF:
    description: Web Application Firewall — filters inbound Internet traffic.

# ── Cross-cutting technical services (monitoring, logging…) ──────────────────
technical-services:
  Monitoring:
    description: Prometheus + Grafana — metrics and dashboards.

  Logging:
    description: Elasticsearch + Kibana — centralised application log aggregation.

# ── Application landscape ─────────────────────────────────────────────────────
# Mermaid flowchart block. Identifiers must match the keys declared under components.
landscape: |
  flowchart TB
    subgraph Users
      User["👤 User"]
    end
    subgraph Frontends
      WebFrontend["Web Frontend"]
    end
    subgraph Backends
      BackendAPI["Backend API"]
      OrderService["Order Service"]
      PaymentService["Payment Service"]
    end
    subgraph Data
      OrdersDB[("Orders DB")]
    end
    subgraph External
      PaymentGW(["🌐 Payment Gateway"])
    end

    User -->|HTTPS| WebFrontend
    WebFrontend -->|HTTPS/JSON| BackendAPI
    BackendAPI -->|REST| OrderService
    BackendAPI -->|REST| PaymentService
    OrderService --> OrdersDB
    PaymentService -->|HTTPS| PaymentGW

# ── Technical landscape ───────────────────────────────────────────────────────
# Same structure as landscape, but organised by network zones.
technical-landscape: |
  flowchart TB
    subgraph Internet
      User["👤 User"]
      WAF["WAF"]
    end
    subgraph DMZ
      WebFrontend["Web Frontend"]
      APIGateway["API Gateway"]
    end
    subgraph Intranet
      BackendAPI["Backend API"]
      OrderService["Order Service"]
      PaymentService["Payment Service"]
      OrdersDB[("Orders DB")]
    end
    subgraph Technical Services
      Monitoring["Monitoring"]
      Logging["Logging"]
    end

    User -->|HTTPS| WAF
    WAF -->|HTTPS| WebFrontend
    WebFrontend -->|HTTPS/JSON| APIGateway
    APIGateway -->|REST| BackendAPI
    BackendAPI -->|REST| OrderService
    BackendAPI -->|REST| PaymentService
    OrderService --> OrdersDB
    BackendAPI --> Monitoring
    BackendAPI --> Logging

# ── Application flows ─────────────────────────────────────────────────────────
flows:
  - name: Place an order
    description: |
      Main flow for creating an order from the frontend.
    diagram: |
      sequenceDiagram
        actor User
        User->>WebFrontend: Confirm cart
        WebFrontend->>BackendAPI: POST /api/orders
        BackendAPI->>OrderService: createOrder(items)
        OrderService->>OrdersDB: INSERT order
        OrderService-->>BackendAPI: orderId
        BackendAPI->>PaymentService: processPayment(orderId)
        PaymentService-->>BackendAPI: confirmed
        BackendAPI-->>WebFrontend: 201 Created
        WebFrontend-->>User: Order confirmation

  - name: Browse catalog
    description: Read flow for the product catalog.
    diagram: |
      sequenceDiagram
        actor User
        User->>WebFrontend: Open catalog
        WebFrontend->>BackendAPI: GET /api/catalog
        BackendAPI-->>WebFrontend: 200 OK — product list
        WebFrontend-->>User: Display catalog
```

---

## Rules to follow

- **Identifiers** (keys under `components`, `technical-components`, etc.) must not contain spaces — use CamelCase or PascalCase.
- Identifiers in `landscape` and `technical-landscape` must exactly match the keys declared in the `components` / `technical-components` / `technical-services` sections.
- Multi-line values (descriptions, diagrams) use the YAML block scalar syntax `|`.
- The `technology`, `framework`, and `constraints` fields are optional.
