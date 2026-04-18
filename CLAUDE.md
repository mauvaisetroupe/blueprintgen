# DAG Generator — Brief Architecture pour Claude Code

## Contexte

Je travaille dans un centre informatique, et les solutions architects nous soummettent le DAG (doc archi générale) 

Le DAG représente possède les artefacts suivants:
1. APPLICATION LANDSCAPE - un landscape avec les composants applicatifs avec une description fonctionnelle de ces composants
2. APPLICATION FLOWS - les flux principaux entre les composants. Ces flus ne sont pas exhaustif, ni détaillés comme du BPMN, mais ils sont une sélection des diagrammes de séquences représentatifs servant à comprendre la dynamique entre les composants
3. DATA - Un positionnement dans le landscape des grandes stockages de data (golden source et replicats)
4. TECHNICAL LANDSCAPE - une landscape plus technique avec en plus du landscape fonctionnelle :
   - une description technique des composants (langage, frameworks, contraintes techniques)
   - les protocoles sur les fleches entre composants
   - les zones réseaux où sont déployés les composants
   - les appels vers des composants techniques (logging, monitoring...)

Je dois collecter les informations nécessaires pour:
1. pour comprendre la solutionn dans sa globalté
2. avoir la liste des produits du centre utilisés dans la solution
3. bootstraper un DAG modifiable par le solution architect

Je souhaite développer une application pour faire ceci
L'application permet de collecter les informations d'architecture via un questionnaire,
de visualiser un aperçu, et de générer des livrables pour les architectes.

## Collecte des données

Via un questionnaire, l'application va collecter
- Nature de la solution (SaaS, COTS, développement interne, open source...)
- Type d'exposition (internet ou non)
- Type de composants (frontend, backend, batch...)
- Flux inbound/outbound (API, fichier, autre) avec protocoles
- Type de stockage (SQL, filesystem...)
- Hosting
- Authentification / IdP
- Protection API (API Gateway)
- Protection web (WAF)
- etc.

J'ai déjà une application qui fait cela : Architect Advisor

Nous allons construire blueprintgen la suite du workflow

Dans un premier temps, le but est d'aider à collecetr les informations nécessaires à la construction de ce genre de schéma dans mermaid:

```
---
config:
    theme: neutral
    layout: elk
---

flowchart TB
  subgraph Users
    user(["👤 End User"])
  end
  subgraph Frontends
    web["Web Frontend\nSPA"]
  end
  subgraph Backends
    api["Backend API\nREST Gateway"]
    order["Order Service"]
    catalog["Catalog Service"]
    payment["Payment Service"]
  end
    
  subgraph broker
    mq["RabbitMQ"]
  end

  subgraph Batchs
    batch["Consolidation batch"]
  end
  subgraph data [Data Storage]
    odb[("Orders DB")]
    cdb[("Catalog DB")]
    pdb[("Payments DB")]
    fs[fa:fa-folder-open File System]
  end
  subgraph analytics[Analytics tools]
    datalake["Data Lake"]
    qlik["Qlik Sense"]
  end
  subgraph external [External Systems]
    pg(["🌐 Payment Gateway"])
  end
  %% users to frontend
  user -->|HTTPS| web
  %% frontend to backend
  web -->|HTTPS/JSON| api
  %% backend to backend
  api -->|REST| order
  api -->|REST| catalog
  api -->|REST| payment
  order --> catalog
  %% backend to broker
  order -->|publish| mq
  payment -->|publish| mq
  %% broker to consumers
  mq -->|consume| catalog
  mq --> batch
  %% backend to storage
  order --> odb
  catalog --> cdb
  payment --> pdb
  payment -->|HTTPS| pg
  catalog --> fs
  %% storage to analytics
  cdb --> datalake
  odb --> datalake
  pdb --> datalake
  datalake --> qlik
  %% batch
  batch --> cdb
```

## Feautures du APPLICATION LANDSACAPE


### 1. Gestion du DAG

On doit pouvoir créer, supprimer, mettre a jour un DAG
Pour l'instant, on stocke dans le storage du browser, mais on garde en tête que cela sera envoyer vers le backend plus tard

### 2. Les catégories des composants

Chaque subgraph est une catégorie de composant
Les catégorie de l'application seront collecté dans Architect Advisor

Pour que blueprintgen soit indépendant, on va ici ajouter la possibilité de sélectionner  les catéhories concernés par l'application. Ce choix dans l'idéal devrait être paramétrable
La liste des catégories est dans l'exemple ci-dessus.

### 3. Les composants

On doit facilement pouvoir entrer des composant, avec un nom, une description, et on peut prévoir la suite pour le TECHNICAL LANDSCAPE (techno, framework, contraintes techniques...)

Chaque composant doit être dans une catégorie


### 4. génération du schéma du landscape

On génére le DSL du mermaid en s'insspirant de l'exemple ci-dessus
On doit dans tous les cas. :
- préremplir avec les catégories et les applications
- laisser la possibilité de déplacer les composant dans d'autres catégories
- ajouter des fleches (relation) entre les composants

#### Editeur mermaid
On présente la possibilité d'éditer directement le DSL comme dans l'éditeur live de mermaid
Avec contrôle de la syntaxe mermaid ET que les composants sont bien dans la lsite des composants collectés
ON DOIT VISUALISER le shéma de façon interactive

#### Editeur guidé
A voir comment faire cela, mais il faut rester simple

#### Rendu
- Donner la possibilité de passer de ELK au layout par défaut
- laisser la possobilité, pour chaque catégorie, de grouper ou non dans un subgraph (quelque fois c'est plus esthétique avec ou sans regroupement)

## 5. Export

### Export en SVG du mermaid
Servira au minimum pour la  génération du DAG en powerpoint 

### Export draw.io (.drawio)
Trois modes d'export (à discuter)

**Mode A — XML natif draw.io avec positions ELK**
- ELK.js calcule le layout (positions x,y des noeuds + bendPoints des arêtes)
- Générateur XML mxGraphModel depuis ces coordonnées
- Résultat : fichier .drawio avec positions propres, éditable par l'architecte
- Flèches L1 uniquement entre zones (même philosophie que l'aperçu)

Points techniques importants - Bug ELK — Offset des arêtes intra-groupe
ELK remonte toutes les arêtes au niveau root dans le layout résultat,
mais les coordonnées des arêtes déclarées dans un groupe restent **locales au groupe**.
Il faut donc ajouter l'offset absolu du groupe à tous les points de ces arêtes.

**MODE B - Position dans le SVG**
- Le mermaid -> SVG -> on récupere les position dans le SVG
- on cree les coposant dans le fichier drawio, et on alimente 
- Voir le code que j'ai déjà écrit en java ici : https://github.com/mauvaisetroupe/ea-design-it/blob/main/src/main/java/com/mauvaisetroupe/eadesignit/service/diagram/drawio/PLantumlToDrawioPositioner.java

**Mode C — Ouverture dans draw.io avec DSL Mermaid**
- Bouton "Ouvrir dans draw.io" qui utilise l'embed API draw.io (postMessage format:mermaid)
- Garantit la cohérence visuelle entre l'aperçu et draw.io
- L'architecte finalise à la main


### Export DSL Mermaid
- Export du DSL Mermaid brut (flowchart + sequenceDiagram) pour réutilisation


## 6. énération de DAG
Je veux générer un powerpoint pour le document d'Architecture générale (DAG)
C'est un document avec 3 types de slides :
- la landcape - un image en plein écran, avec des rectangles jaunes au dessus qui décrivent fonctionnlememt les composant
- les flux - une image sur la gauche qui prends les 2/3 de la largeur et sur le 1/3 a droite des numbered bullet point qui décrivent le flux
- des tableaux avec du texte

Je souhaiterais avoir des templates avec des placeholders à remplir en particulierpour les slides avec les flux (je ne sais pas a l'avance combine de slide de flux je vais avoir)


## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vue3 + Vite  |
|Génération de powerpoint|pptxgenjs dans le browswer|
| Backend | springboot  |
| Base de données | PostgreSQL |
| Rendu diagrammes | Mermaid.js (avec layout ELK ou standard , à choisir dans l'application) |
| Export draw.io | XML mxGraphModel généré depuis ELK.js ou depuis le SVG exporté de mermaid ou en import direct du mermaid|
| Déploiement | Intranet entreprise |


## Conventions de code

- Vue3 Composition API (`<script setup>`)
- TypeScript
- Pas de `any` — typer tous les modèles
- Nommage : camelCase JS, snake_case SQL
- Commentaires en français (contexte métier)

