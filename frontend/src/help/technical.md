# Technical Landscape

Cette vue génère le **diagramme de landscape technique**, enrichissement du landscape applicatif avec zones réseau, protocoles et composants techniques.

## Sous-onglets

### Components (zones réseau)

- Visualisez les composants applicatifs organisés par **zone réseau**
- Assignez ou modifiez les zones directement depuis cette vue
- Les composants techniques purs (logging, monitoring…) apparaissent dans **Technical Services**

### Relations

- Ajoutez des **protocoles** sur les flèches entre composants (HTTPS, REST, AMQP, SFTP…)
- Une liste de protocoles par défaut est proposée, extensible librement
- Les protocoles renseignés ici surchargent ceux du landscape applicatif

## Composants sécurité

Des éléments de sécurité peuvent être positionnés sur les flux :

- **API Gateway** — entre un client et un backend exposé
- **WAF** — entre Internet et un frontend ou une API
- **Antivirus / File Transfer** — sur les flux de type FILE

## Conseils

- Le Technical Landscape est basé sur le landscape applicatif : stabilisez d'abord les composants
- Les zones réseau correspondent aux `subgraph` du diagramme technique
- Utilisez les protocoles pour enrichir la lisibilité sans surcharger le diagramme
