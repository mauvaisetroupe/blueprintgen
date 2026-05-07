# BlueprintGen — Help

BlueprintGen helps you build and document an **Architecture Blueprint (DAG)**.

## Two ways to work

### Through the application interface

The application guides you through entering architecture information using forms and tables.
Diagrams are generated automatically and remain visually editable.
This is the recommended approach to get started, or for architects less comfortable with text files.

Each section of the application corresponds to an artifact of the DAG:

1. **Components** — declare application components and their functional categories
2. **Technical Components** — add purely technical components (IAM, proxy, monitoring, antivirus…)
3. **Application Flows** — describe the representative sequence flows between components
4. **Landscape** — visualize and edit the application landscape diagram
5. **Technical Landscape** — enriched diagram with network zones and protocols
6. **Security** — position authentication and protection mechanisms

### Via a YAML file in your project

An entire DAG can be exported as a **human-readable YAML file** (Save / Export → Export DAG (.yaml)), versioned in the project's Git repository, and re-imported into the application at any time via **Open → Open YAML**.

This approach suits architects who prefer working directly in their text editor or IDE, managing revisions through Git, or sharing the DAG as a project artifact alongside the code.

Both approaches are complementary: you can switch between them without any loss of information.