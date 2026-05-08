# Format YAML — Référence

Le fichier `.dag.yaml` est le format de persistance textuel de BlueprintGen.
Il peut être édité directement dans un éditeur de texte ou un IDE, versionné dans Git, et réimporté à tout moment.

## Principes

- **La structure est déclarée explicitement** — les catégories, les zones réseau et l'appartenance des composants sont des données structurées, pas des informations déduites de la mise en page des diagrammes.
- **Les diagrammes décrivent uniquement les relations** — `landscape:` et `technical-landscape:` ne contiennent que des flèches ; les sous-graphes sont générés automatiquement par l'application.
- **Source de vérité unique** — la catégorie d'un composant vient de son champ `category:`, sa ou ses zones viennent de son champ `zones:`. Pas de duplication.

## Structure globale

```yaml
name: Mon Application         # Nom du DAG (obligatoire)
description: |                # Description libre (optionnel)
  Courte description.

categories:                   # Catégories utilisées dans ce DAG
  - Frontends
  - Backends
  - ...

network-zones:                # Zones réseau (optionnel)
  - Internet
  - DMZ
  - ...

components:                   # Composants applicatifs
  mon_composant:
    name: Mon Composant       # Nom d'affichage
    category: Backends        # Doit exister dans la liste categories
    zones: [DMZ]              # Optionnel — zones où ce composant est déployé
    description: ...
    technology: ...

technical-components:         # Composants techniques/infrastructure (même structure)
  ma_gateway:
    name: Ma Gateway
    category: Auth Gateway
    zones: [DMZ]

technical-services:           # Services transversaux (monitoring, logging…)
  monitoring:
    name: Monitoring
    description: ...

landscape: |                  # Relations applicatives — flèches uniquement, sans sous-graphes
  composant_a -->|HTTPS| composant_b
  ...

technical-landscape: |        # Relations techniques — flèches uniquement (optionnel)
  composant_a -->|REST| composant_b
  ...

flows:                        # Flux applicatifs (diagrammes de séquence)
  - name: ...
    diagram: |
      sequenceDiagram
      ...
```

---

## Exemple complet commenté

```yaml
name: Plateforme E-Commerce
description: |
  Plateforme e-commerce exposée sur Internet.
  Architecture microservices déployée dans le cloud.

# ── Catégories utilisées dans ce DAG ─────────────────────────────────────────
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
  - DMZ
  - Intranet

# ── Composants applicatifs ────────────────────────────────────────────────────
# Clé = identifiant Mermaid : caractères non alphanumériques remplacés par des underscores, en minuscules.
# Exemple : "Web Frontend" → web_frontend, "Backend API" → backend_api
components:
  user:
    name: User
    category: Users
    zones: [Internet]
    description: Utilisateur final accédant à la plateforme via un navigateur web.

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
      Doit garantir l'idempotence lors de la création de commandes.

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
    name: WAF
    category: Technical Services
    zones: [Internet]
    description: Web Application Firewall — filtre le trafic Internet entrant.

  api_gateway:
    name: API Gateway
    category: Auth Gateway
    zones: [DMZ]
    description: Kong — protection et routage des appels API entrants.

# ── Services techniques transversaux ─────────────────────────────────────────
technical-services:
  monitoring:
    name: Monitoring
    description: Prometheus + Grafana — métriques et tableaux de bord.

  logging:
    name: Logging
    description: Elasticsearch + Kibana — centralisation des logs applicatifs.

# ── Landscape applicatif — flèches uniquement ─────────────────────────────────
# Pas de sous-graphes, pas de déclarations de nœuds. L'application génère
# les sous-graphes automatiquement à partir de la catégorie de chaque composant.
landscape: |
  user -->|HTTPS| web_frontend
  web_frontend -->|HTTPS/JSON| backend_api
  backend_api -->|REST| order_service
  backend_api -->|REST| payment_service
  order_service --> orders_db
  payment_service -->|HTTPS| payment_gateway

# ── Landscape technique — flèches uniquement ──────────────────────────────────
# Même principe. Les sous-graphes (zones réseau) sont générés à partir du champ zones:.
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

# ── Flux applicatifs ──────────────────────────────────────────────────────────
# Les déclarations de participants sont auto-injectées au rendu depuis les noms de composants.
flows:
  - name: Passer une commande
    description: |
      Flux principal de création d'une commande depuis le frontend.
    diagram: |
      sequenceDiagram
        user->>web_frontend: Valider le panier
        web_frontend->>backend_api: POST /api/orders
        backend_api->>order_service: createOrder(items)
        order_service->>orders_db: INSERT order
        order_service-->>backend_api: orderId
        backend_api->>payment_service: processPayment(orderId)
        payment_service-->>backend_api: confirmé
        backend_api-->>web_frontend: 201 Created
        web_frontend-->>user: Confirmation de commande

  - name: Consulter le catalogue
    description: Flux de lecture du catalogue produits.
    diagram: |
      sequenceDiagram
        user->>web_frontend: Ouvrir le catalogue
        web_frontend->>backend_api: GET /api/catalog
        backend_api-->>web_frontend: 200 OK — liste produits
        web_frontend-->>user: Affichage du catalogue
```

---

## Règles à respecter

- **`categories:`** doit lister toutes les catégories référencées dans les champs `category:` des composants.
- **`network-zones:`** doit lister toutes les zones référencées dans les champs `zones:` des composants.
- Les clés de composants sont dérivées du nom d'affichage : caractères non alphanumériques remplacés par des underscores, en minuscules (`"Web Frontend"` → `web_frontend`).
- Le champ `name:` est le nom d'affichage utilisé dans les diagrammes et l'interface.
- `landscape:` et `technical-landscape:` ne contiennent que des flèches — ne pas ajouter de `subgraph`, de déclarations de nœuds, ni de `flowchart TB`.
- Les corps de `diagram:` dans les flux ne contiennent que des flèches — ne pas ajouter de déclarations `participant` ou `actor` ; elles sont auto-injectées au rendu.
- `technology`, `framework`, `constraints`, `zones` et `description` sont optionnels.
