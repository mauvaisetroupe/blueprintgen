# Composants applicatifs

Cette vue permet de gérer les composants fonctionnels de l'application et leurs catégories.

## Catégories

Les catégories regroupent les composants par nature fonctionnelle (ex. : Frontends, Backends, Data Storage, External Systems…).

- Cliquez sur **+ Add Category** pour créer une catégorie
- Chaque catégorie correspond à un `subgraph` dans le diagramme Mermaid

## Composants

Un composant représente un bloc applicatif identifiable dans le landscape (service, frontend, base de données…).

- Cliquez sur **+ Add Component** dans une catégorie pour ajouter un composant
- Renseignez le **nom** (identifiant unique dans le DAG) et la **description** fonctionnelle
- La description peut contenir des sauts de ligne (`\n`) pour le rendu dans le diagramme

## Conseils

- Commencez toujours par cette vue avant de passer au Landscape
- Les composants définis ici alimentent automatiquement tous les autres onglets
- Évitez les espaces et caractères spéciaux dans les noms (ils servent d'identifiants Mermaid)
