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

## Importer depuis le Landscape

Le bouton **Import from Landscape** permet de pré-remplir les relations d'un flow à partir des relations déjà définies dans le landscape applicatif.

## Modes d'édition

- **Mode guidé** — tableau d'étapes, ordre modifiable par glisser-déposer
- **Mode DSL** — édition directe du `sequenceDiagram` Mermaid

## Export PPTX

Chaque flow génère une slide dans l'export PowerPoint :
- diagramme de séquence sur les 2/3 gauche
- bullet points numérotés des étapes sur le 1/3 droit
