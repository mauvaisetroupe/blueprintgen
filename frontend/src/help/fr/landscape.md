# Application Landscape

Cette vue génère et visualise le **diagramme de landscape applicatif** au format Mermaid.

## Modes d'édition

### Mode guidé (DSL Edit désactivé)

- Ajoutez des **relations** entre composants via le tableau
- Renseignez la source, la cible et éventuellement le label (protocole, description)
- Le DSL Mermaid est regénéré automatiquement

### Mode DSL (DSL Edit activé)

- Éditez directement le code Mermaid dans l'éditeur
- La syntaxe est validée en temps réel
- Les composants utilisés doivent exister dans la liste des composants du DAG

## Options de rendu

- **Layout ELK** — algorithme de positionnement avancé, recommandé pour les graphes complexes
- **Layout standard** — layout Mermaid par défaut, plus simple
- Chaque catégorie peut être groupée ou non dans un `subgraph`

## Export

- **Export SVG** — image vectorielle pour le PowerPoint
- **Export draw.io** — fichier `.drawio` éditable par l'architecte
- **Open in draw.io** — ouverture directe dans draw.io via l'API embed

## Import depuis les flows

Le bouton **Import from Flows** permet de pré-remplir les relations du landscape à partir des étapes déjà définies dans les diagrammes de séquence. Cela évite de ressaisir manuellement des relations déjà modélisées dans les flows.

## Conseils

- Commencez en mode guidé, passez en mode DSL pour les ajustements fins
- Les relations définies ici servent de base pour construire les flows
