# Format YAML — référence

Le fichier `.dag.yaml` est le format de persistance texte de BlueprintGen.
Il peut être édité directement dans un éditeur de texte ou un IDE, versionné dans Git, et réimporté dans l'application.

## Structure globale

```yaml
name: Mon Application          # Nom du DAG (obligatoire)
description: |                 # Description libre (optionnel)
  Application de gestion des commandes
  déployée en intranet.

components: ...                # Composants applicatifs
technical-components: ...      # Composants techniques (IAM, proxy…)
technical-services: ...        # Services techniques transverses (monitoring, logging…)
landscape: |                   # Diagramme de landscape applicatif (Mermaid flowchart)
  flowchart TB
  ...
technical-landscape: |         # Diagramme de landscape technique (optionnel)
  flowchart TB
  ...
flows:                         # Flux applicatifs (séquences)
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
  Plateforme de vente en ligne exposée sur Internet.
  Architecture microservices déployée en cloud.

# ── Composants applicatifs ────────────────────────────────────────────────────
# Chaque clé est l'identifiant Mermaid du composant (pas d'espaces ni de caractères spéciaux).
components:
  WebFrontend:
    description: |
      SPA React exposée sur Internet.
      Point d'entrée utilisateur.
    technology: React
    framework: Vite

  BackendAPI:
    description: API REST centrale — routage vers les services métier.
    technology: Spring Boot

  OrderService:
    description: Gestion du cycle de vie des commandes.
    technology: Spring Boot
    constraints: |
      Doit garantir l'idempotence des créations de commande.

  PaymentService:
    description: Intégration avec la passerelle de paiement externe.
    technology: Node.js

  OrdersDB:
    description: Base de données des commandes.
    technology: PostgreSQL

# ── Composants techniques (IAM, proxy, gateway…) ─────────────────────────────
technical-components:
  APIGateway:
    description: Kong — protection et routage des appels API entrants.

  WAF:
    description: Web Application Firewall — filtrage du trafic Internet entrant.

# ── Services techniques transverses (monitoring, logging…) ───────────────────
technical-services:
  Monitoring:
    description: Prometheus + Grafana — métriques et dashboards.

  Logging:
    description: Elasticsearch + Kibana — centralisation des logs applicatifs.

# ── Landscape applicatif ──────────────────────────────────────────────────────
# Bloc Mermaid flowchart. Les identifiants doivent correspondre aux clés dans components.
landscape: |
  flowchart TB
    subgraph Users
      User["👤 Utilisateur"]
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

# ── Landscape technique ───────────────────────────────────────────────────────
# Même structure que landscape, mais organisé par zones réseau.
technical-landscape: |
  flowchart TB
    subgraph Internet
      User["👤 Utilisateur"]
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

# ── Flux applicatifs ──────────────────────────────────────────────────────────
flows:
  - name: Passer une commande
    description: |
      Flux principal de création de commande depuis le frontend.
    diagram: |
      sequenceDiagram
        actor User
        User->>WebFrontend: Valider le panier
        WebFrontend->>BackendAPI: POST /api/orders
        BackendAPI->>OrderService: createOrder(items)
        OrderService->>OrdersDB: INSERT order
        OrderService-->>BackendAPI: orderId
        BackendAPI->>PaymentService: processPayment(orderId)
        PaymentService-->>BackendAPI: confirmed
        BackendAPI-->>WebFrontend: 201 Created
        WebFrontend-->>User: Confirmation commande

  - name: Consulter le catalogue
    description: Flux de lecture du catalogue produits.
    diagram: |
      sequenceDiagram
        actor User
        User->>WebFrontend: Ouvrir le catalogue
        WebFrontend->>BackendAPI: GET /api/catalog
        BackendAPI-->>WebFrontend: 200 OK — liste produits
        WebFrontend-->>User: Afficher le catalogue
```

---

## Règles à respecter

- Les **identifiants** (clés sous `components`, `technical-components`, etc.) ne doivent pas contenir d'espaces — utilisez la notation CamelCase ou PascalCase.
- Les identifiants dans `landscape` et `technical-landscape` doivent correspondre exactement aux clés déclarées dans les sections `components` / `technical-components` / `technical-services`.
- Les valeurs multilignes (descriptions, diagrammes) utilisent la syntaxe YAML block scalar `|`.
- Les champs `technology`, `framework`, `constraints` sont optionnels.
