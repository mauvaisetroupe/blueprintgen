# Composants techniques

Cette vue étend les composants applicatifs avec les informations nécessaires au **Technical Landscape**.

## Description technique

Pour chaque composant, vous pouvez renseigner :

- **Technologie** — langage, framework, runtime (ex. : Spring Boot, React, Node.js)
- **Contraintes techniques** — performances, licences, dépendances particulières

## Zones réseau

Chaque composant peut être assigné à une ou plusieurs **zones réseau** (DMZ, intranet, cloud…).

- Les zones structurent le Technical Landscape en groupes visuels
- Un composant dans plusieurs zones est un cas avancé — à modéliser avec attention

## Composants techniques purs

Des composants non-applicatifs peuvent être ajoutés ici :
logging centralisé, monitoring, SIEM, antivirus…

Ces composants apparaissent dans la zone **Technical Services** du Technical Landscape.

## Conseils

- Remplissez cette vue après avoir stabilisé la liste des composants applicatifs
- Les zones réseau définies ici servent de `subgraph` dans le Technical Landscape
