# Composants techniques

Cette vue permet d'ajouter les **composants purement techniques** de l'architecture — ceux qui ne sont pas des composants applicatifs métier mais qui font partie de l'infrastructure technique.

## Exemples de composants techniques

- **IAM / IdP** — Keycloak, Active Directory, Azure AD
- **Proxy / API Gateway** — Kong, nginx, Azure APIM
- **Monitoring / Observabilité** — Prometheus, Grafana, Datadog
- **Logging centralisé** — Elasticsearch, Splunk
- **Antivirus / Scanner** — composant de sécurité sur les flux fichiers
- **WAF** — Web Application Firewall

## Différence avec les composants applicatifs

Les composants applicatifs (onglet **Components**) représentent les services métier de la solution (frontends, backends, bases de données…).

Les composants techniques ici sont des **briques d'infrastructure transverses**, non spécifiques au métier, qui apparaissent dans le **Technical Landscape** dans la zone *Technical Services*.

## Conseils

- N'ajoutez ici que les composants réellement présents dans l'architecture
- Ces composants peuvent recevoir des flux entrants/sortants comme n'importe quel composant dans le Technical Landscape
