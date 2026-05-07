# Application Flows

Cette vue permet de créer des **diagrammes de séquence** représentatifs des flux principaux entre composants.

## Qu'est-ce qu'un flow ?

Un flow est un diagramme de séquence (`sequenceDiagram` Mermaid) qui illustre un cas d'usage représentatif.
Il ne vise pas l'exhaustivité (ce n'est pas du BPMN), mais la compréhension de la dynamique entre composants.

## Créer un flow

1. Cliquez sur **+ New Flow** pour créer un flux
2. Donnez-lui un nom et une description
3. Ajoutez des **étapes** : chaque étape est un message entre deux composants
4. Renseignez la description du message et le protocole si nécessaire

## Modes d'édition

- **Mode guidé** — tableau d'étapes, ordre modifiable par glisser-déposer
- **Mode DSL** — édition directe du `sequenceDiagram` Mermaid

## Options visuelles

Ces options s'appliquent par flow et sont persistées automatiquement.

**Sequence / Activity**

Le même flow peut être visualisé de deux façons :
- **Sequence** — diagramme de séquence classique avec des lifelines verticales, le plus lisible pour les échanges entre composants
- **Activity** — le flow est retranscrit en flowchart (graphe orienté), utile pour mettre en évidence l'enchaînement des actions plutôt que les échanges

**Afficher les retours**

En mode Sequence, les flèches de retour (réponses, `-->>`) sont masquées par défaut pour alléger le diagramme. Activez ce toggle pour les faire apparaître.

**ELK layout** *(mode Activity uniquement)*

Utilise l'algorithme ELK pour le positionnement des nœuds dans le flowchart Activity, à la place du layout Mermaid standard. Recommandé pour les flows complexes.

**Sous-graphes** *(mode Activity uniquement)*

En mode Activity, les participants peuvent être regroupés visuellement par catégorie fonctionnelle (Frontends, Backends…). Cochez ou décochez chaque catégorie pour affiner l'affichage.

## Export PPTX

Chaque flow génère une slide dans l'export PowerPoint :
- diagramme de séquence sur les 2/3 gauche
- bullet points numérotés des étapes sur le 1/3 droit
