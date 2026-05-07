# Technical Landscape

Cette vue génère le **diagramme de landscape technique**, enrichissement du landscape applicatif avec les détails techniques des composants, les zones réseau et les protocoles.

## Sous-onglet Components (zones réseau)

C'est ici que vous renseignez les aspects techniques des **composants applicatifs** :

- **Technologie** — langage, framework, runtime (ex: Spring Boot, React, Node.js)
- **Contraintes techniques** — performances, licences, dépendances particulières
- **Zone réseau** — DMZ, intranet, cloud… chaque composant est assigné à une zone qui devient un `subgraph` dans le diagramme

Les **composants techniques purs** (IAM, monitoring, proxy… ajoutés dans l'onglet *Technical Components*) apparaissent quant à eux dans la zone **Technical Services**.

## Sous-onglet Relations

### Import

Le bouton **Import from Landscape** permet de pré-remplir les relations du Technical Landscape à partir des relations déjà définies dans le landscape applicatif. C'est le point de départ naturel : on importe les flux existants, puis on les enrichit.

### Types d'enrichissement

**Protocoles sur les flux existants**

Annotez les flèches entre composants applicatifs avec le protocole utilisé (HTTPS, REST, AMQP, SFTP...). Une liste de protocoles par défaut est proposée, extensible librement. Les protocoles renseignés ici surchargent ceux du landscape applicatif.

**Liens directs vers des composants techniques**

Ajoutez des flux entre des composants applicatifs et des composants techniques transverses. Exemples :

- `Backend API` → `IAM` — le backend délègue l'authentification à un Identity Provider
- `Backend API` → `Monitoring` — le backend envoie ses métriques à Prometheus/Grafana
- `Batch` → `Logging` — le batch pousse ses logs vers le système centralisé

**Insertion d'un composant technique dans un flux existant**

Un composant technique peut s'intercaler entre deux composants déjà reliés. Le flux d'origine est remplacé par deux flux passant par l'intermédiaire. Exemples :

- `User` → `Web Frontend` devient `User` → `WAF` → `Web Frontend`
- `User` → `Backend API` devient `User` → `API Gateway` → `Backend API`
- `Frontend` → `Backend` devient `Frontend` → `Proxy` → `Backend`

## Conseils

- Le Technical Landscape est basé sur le landscape applicatif : stabilisez d'abord les composants
- Les zones réseau correspondent aux `subgraph` du diagramme technique
- Utilisez les protocoles pour enrichir la lisibilité sans surcharger le diagramme
