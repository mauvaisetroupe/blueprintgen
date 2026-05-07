# Technical Landscape

This view generates the **technical landscape diagram**, enriching the application landscape with technical details, network zones, and protocols.

## Components sub-tab (network zones)

This is where you fill in the technical details of **application components**:

- **Technology** — language, framework, runtime (e.g. Spring Boot, React, Node.js)
- **Technical constraints** — performance, licensing, specific dependencies
- **Network zone** — DMZ, intranet, cloud… each component is assigned to a zone that becomes a `subgraph` in the diagram

**Purely technical components** (IAM, monitoring, proxy… added in the *Technical Components* tab) appear in the **Technical Services** zone.

## Relations sub-tab

### Import

The **Import from Landscape** button pre-fills the Technical Landscape relations from those already defined in the application landscape. This is the natural starting point: import existing flows, then enrich them.

### Enrichment types

**Protocols on existing flows**

Annotate arrows between application components with the protocol used (HTTPS, REST, AMQP, SFTP…). A default list of protocols is provided, freely extendable. Protocols set here override those from the application landscape.

**Direct links to technical components**

Add flows between application components and cross-cutting technical components. Examples:

- `Backend API` → `IAM` — the backend delegates authentication to an Identity Provider
- `Backend API` → `Monitoring` — the backend sends metrics to Prometheus/Grafana
- `Batch` → `Logging` — the batch pushes logs to the centralized logging system

**Inserting a technical component into an existing flow**

A technical component can be inserted between two already-connected components. The original flow is replaced by two flows passing through the intermediary. Examples:

- `User` → `Web Frontend` becomes `User` → `WAF` → `Web Frontend`
- `User` → `Backend API` becomes `User` → `API Gateway` → `Backend API`
- `Frontend` → `Backend` becomes `Frontend` → `Proxy` → `Backend`

## Tips

- The Technical Landscape is based on the application landscape — stabilize components first
- Network zones map to `subgraph` elements in the technical diagram
- Use protocols to improve readability without cluttering the diagram
