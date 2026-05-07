# Technical Components

This view lets you add **purely technical components** to the architecture — infrastructure bricks that are not business application components.

## Examples of technical components

- **IAM / IdP** — Keycloak, Active Directory, Azure AD
- **Proxy / API Gateway** — Kong, nginx, Azure APIM
- **Monitoring / Observability** — Prometheus, Grafana, Datadog
- **Centralized Logging** — Elasticsearch, Splunk
- **Antivirus / Scanner** — security component on file flows
- **WAF** — Web Application Firewall

## Difference from application components

Application components (in the **Components** tab) represent the business services of the solution (frontends, backends, databases…).

Technical components here are **cross-cutting infrastructure bricks**, not business-specific, and appear in the **Technical Landscape** under the *Technical Services* zone.

## Tips

- Only add components that are actually present in the architecture
- These components can have inbound/outbound flows like any other component in the Technical Landscape
