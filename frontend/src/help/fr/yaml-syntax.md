# Format YAML — Référence

Le fichier `.dag.yaml` est le format de persistance textuel de BlueprintGen.
Il peut être édité directement dans un éditeur de texte ou un IDE, versionné dans Git, et réimporté à tout moment.

## Principes

- **La structure est déclarée explicitement** — les catégories, zones réseau et appartenances des composants sont déclarées comme données structurées, et non déduites de la disposition du diagramme.
- **Les diagrammes décrivent uniquement les relations** — `landscape:` et `technical-landscape:` contiennent uniquement des flèches ; les sous-graphes sont générés automatiquement par l’application.
- **Source unique de vérité** — la catégorie d’un composant provient de son champ `category:`, les zone(s) d’un composant de son champ `zones:`. Aucune duplication.
- **IDs de composants stables** — la clé YAML d’un composant est son ID de nœud Mermaid. Elle est définie une seule fois et ne change jamais, même si le nom affiché est modifié par la suite.

## IDs de composants (clés)

Chaque entrée de composant est indexée par son **ID de nœud Mermaid stable** — minuscules, caractères non alphanumériques remplacés par des underscores.

```yaml
components:
  web_frontend:        # ← ceci est l’ID de nœud stable
    name: Web Frontend # ← ceci est le nom affiché dans l’UI et les diagrammes
```

Le champ `name:` est **optionnel**. S’il est absent, le nom affiché est dérivé de la clé en remplaçant les underscores par des espaces et en capitalisant le premier caractère :

| Clé               | Nom dérivé        | `name:` requis ?                       |
| ----------------- | ----------------- | -------------------------------------- |
| `web_frontend`    | `Web frontend`    | Oui — si vous voulez `Web Frontend`    |
| `backend_api`     | `Backend api`     | Oui — si vous voulez `Backend API`     |
| `user`            | `User`            | Non                                    |
| `monitoring`      | `Monitoring`      | Non                                    |
| `internet_user`   | `Internet user`   | Non                                    |
| `payment_gateway` | `Payment gateway` | Oui — si vous voulez `Payment Gateway` |

Lorsque l’application exporte un DAG en YAML, `name:` est écrit uniquement lorsqu’il diffère de la valeur dérée.

## Structure globale

```yaml
name: My Application          # Nom du DAG (requis)
description: |                # Description texte libre (optionnelle)
  Short description.

categories:                   # Catégories utilisées dans ce DAG (requis)
  - Frontends
  - Backends
  - ...

network-zones:                # Zones réseau (optionnel)
  - Internet
  - DMZ
  - ...

components:                   # Composants applicatifs
  my_component:
    name: My Component        # Optionnel — voir "IDs de composants" ci-dessus
    category: Backends        # Doit correspondre à une entrée de categories:
    zones: [DMZ]              # Optionnel — zones où ce composant est déployé
    description: ...
    technology: ...

technical-components:         # Composants techniques/infrastructure (même structure)
  my_gateway:
    name: My Gateway
    category: Auth Gateway
    zones: [DMZ]

technical-services:           # Services transverses (monitoring, logging…)
  monitoring:
    description: Prometheus + Grafana.

landscape: |                  # Relations applicatives — flèches uniquement
  flowchart TB
  component_a -->|HTTPS| component_b

technical-landscape: |        # Relations techniques — flèches uniquement (optionnel)
  flowchart TB
  component_a -->|REST| component_b

flows:                        # Flux applicatifs (diagrammes de séquence)
  - name: ...
    diagram: |
      sequenceDiagram
      ...
```

---

## Exemple complet commenté

```yaml
name: E-Commerce Platform
description: |
  Internet-facing e-commerce platform.
  Microservices architecture deployed in the cloud.

# ── Catégories utilisées dans ce DAG ──────────────────────────────────────────
categories:
  - Users
  - Frontends
  - Backends
  - Data Storage
  - External Systems
  - Auth Gateway
  - Technical Services

# ── Zones réseau ──────────────────────────────────────────────────────────────
network-zones:
  - Internet
  - VPN
  - DMZ
  - Internal DMZ
  - Intranet

# ── Composants applicatifs ────────────────────────────────────────────────────
# name: est omis lorsqu’il correspond à la règle de dérivation de la clé
# (underscores → espaces, premier caractère capitalisé).
# Spécifiez name: uniquement pour les casses non standards.
components:
  user:
    category: Users
    zones: [Internet]
    description: End user accessing the platform via a web browser.

  employee:
    category: Users
    zones: [VPN]
    description: Internal employee accessing the platform via corporate VPN.

  web_frontend:
    name: Web Frontend        # "Web frontend" serait dérivé — F majuscule nécessaire
    category: Frontends
    zones: [DMZ, Internal DMZ] # déployé dans deux zones — crée deux instances
    technology: React
    framework: Vite

  backend_api:
    name: Backend API         # "Backend api" serait dérivé — A majuscule nécessaire
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

# ── Composants techniques ─────────────────────────────────────────────────────
technical-components:
  waf:
    name: WAF                 # "Waf" serait dérivé — all-caps nécessaire
    category: Technical Services
    zones: [Internet]
    description: Web Application Firewall — filters inbound Internet traffic.

  api_gateway:
    name: API Gateway         # "Api gateway" serait dérivé
    category: Auth Gateway
    zones: [DMZ, Internal DMZ] # une instance par zone — même composant, deux déploiements
    description: Kong — protection and routing of inbound API calls.

# ── Services techniques transverses ───────────────────────────────────────────
technical-services:
  monitoring:
    description: Prometheus + Grafana — metrics and dashboards.

  logging:
    description: Elasticsearch + Kibana — centralised log aggregation.

# ── Landscape applicatif — flèches uniquement ─────────────────────────────────
# Vue logique — pas de notion de zone, pas de suffixes, un nœud par composant.
landscape: |
  flowchart TB
  user -->|HTTPS| web_frontend
  employee -->|HTTPS| web_frontend
  web_frontend -->|HTTPS/JSON| backend_api
  backend_api -->|REST| order_service
  backend_api -->|REST| payment_service
  order_service --> orders_db
  payment_service -->|HTTPS| payment_gateway

# ── Landscape technique — flèches uniquement ─────────────────────────────────
# Les sous-graphes (zones réseau) sont générés à partir du champ zones:
# de chaque composant.
#
# Convention d’ID des nœuds multi-zones :
#   Composant déployé dans une seule zone  →  utiliser sa clé telle quelle
#   (ex. backend_api)
#
#   Composant déployé dans plusieurs zones →  key__zone_id
#   (ex. api_gateway__dmz)
#
#   Zone ID = toNodeId(zone name) : minuscules, espaces → underscores
#     "DMZ"          → dmz          → api_gateway__dmz
#     "Internal DMZ" → internal_dmz → api_gateway__internal_dmz
technical-landscape: |
  flowchart TB
  user -->|HTTPS| waf
  waf -->|HTTPS| web_frontend__dmz
  employee -->|HTTPS| web_frontend__internal_dmz
  web_frontend__dmz -->|HTTPS/JSON| api_gateway__dmz
  web_frontend__internal_dmz -->|HTTPS/JSON| api_gateway__internal_dmz
  api_gateway__dmz -->|REST| backend_api
  api_gateway__internal_dmz -->|REST| backend_api
  backend_api -->|REST| order_service
  backend_api -->|REST| payment_service
  order_service --> orders_db

# ── Flux applicatifs ──────────────────────────────────────────────────────────
# Utilisez les IDs de nœuds des composants (clés) comme noms de participants
# — sans suffixes de zone.
# Les déclarations de participants sont injectées automatiquement au rendu —
# ne pas les ajouter manuellement.
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

## Règles

- **`categories:` est requis** — un fichier YAML sans liste `categories:` de niveau racine est rejeté à l’import.
- Chaque catégorie référencée par le champ `category:` d’un composant doit apparaître dans `categories:`.
- Chaque zone référencée par le champ `zones:` d’un composant doit apparaître dans `network-zones:`.
- Les clés des composants sont leurs **IDs de nœuds Mermaid stables** — minuscules, caractères non alphanumériques remplacés par des underscores. Elles doivent être uniques à travers `components:` et `technical-components:`.
- Une clé de composant est permanente. La modifier dans le YAML crée un nouveau composant ; l’ancien est perdu.
- `name:` est optionnel. Lorsqu’il est absent, le nom affiché est dérivé de la clé (`keyToName`). Spécifiez `name:` uniquement lorsque le nom affiché souhaité utilise une casse ou des caractères différents.
- `landscape:` et `technical-landscape:` contiennent uniquement des lignes de flèches. N’ajoutez **pas** de `subgraph`, déclarations de nœuds ou directives supplémentaires. L’en-tête `flowchart TB` est optionnel (ajouté automatiquement à l’import s’il est absent).
- **IDs de nœuds multi-zones dans `technical-landscape:`** — un composant déployé dans une seule zone utilise sa clé telle quelle (`backend_api`). Un composant déployé dans plusieurs zones reçoit un suffixe de zone : `key__zone_id`, où l’ID de zone correspond au nom de la zone en minuscules avec les espaces remplacés par des underscores (`"Internal DMZ"` → `internal_dmz`, donnant `api_gateway__internal_dmz`).
- Les corps `diagram:` des flows utilisent les clés simples des composants comme noms de participants — sans suffixes de zone. Les déclarations de participants sont injectées automatiquement au rendu ; ne les ajoutez **pas** manuellement.
- `technology`, `framework`, `constraints`, `zones` et `description` sont optionnels sur n’importe quel composant.
