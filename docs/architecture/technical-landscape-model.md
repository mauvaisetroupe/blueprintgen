# Modélisation du Technical Landscape — Décision d'architecture

## Problème

Dans le landscape applicatif, `myAppli` est un composant logique unique.
Dans le landscape technique, `myAppli` peut être déployé dans **plusieurs zones réseau** (ex. : une instance en DMZ pour les customers, une instance en Internal pour les employees).

Si on duplique `myAppli` en deux nœuds dans le diagramme, les **relations existantes** deviennent ambiguës :
- `employee → myAppli` : vers quelle instance ?
- `customer → myAppli` : vers quelle instance ?
- Et la communication entre les deux instances (`myAppli_dmz → myAppli_internal`) n'est pas modélisée.

Le concept de **relation logique** (landscape applicatif) n'est plus suffisant : il faut savoir vers **quelle instance physique** pointe chaque relation.

---

## Inspiration C4 / ArchiMate

### C4 Model
C4 distingue explicitement :
- **Container** (composant logique, ex. `myAppli`)
- **Deployment View** : les containers sont déployés sur des **Deployment Nodes** (zones réseau). Un container peut avoir plusieurs instances dans des nodes différents.

Les relations dans la deployment view pointent vers des **instances déployées**, pas vers des containers logiques.

### ArchiMate
ArchiMate distingue :
- **Application Component** (couche applicative, logique)
- **Technology Node** (couche technique, infrastructure)
- **Realization** : un Application Component est réalisé par un ou plusieurs nœuds technique
- **Assignment** : lie un composant à son nœud de déploiement

Dans les deux frameworks, la notion d'**instance de déploiement** est explicite et les relations techniques pointent vers ces instances.

---

## Proposition de modèle

### Deux niveaux de composant

```
Component (logique)          ComponentInstance (physique)
──────────────────           ─────────────────────────────
id                           id
name                         componentId  → Component
description                  networkZoneId → NetworkZone
categoryId                   label?       (ex: "DMZ replica")
technology?
framework?
constraints?
```

Un `Component` sans déploiement multi-zone a **exactement une** `ComponentInstance` (créée implicitement, dans sa zone unique).

Un `Component` déployé en multi-zone a **N instances**, chacune dans une zone différente.

### Relations au niveau technique

Les relations du landscape applicatif restent **logiques** (Component → Component).

Le landscape technique introduit des **TechnicalRelation** qui pointent vers des instances :

```
TechnicalRelation
─────────────────
id
fromInstanceId  → ComponentInstance
toInstanceId    → ComponentInstance
protocol?
label?
```

Ces relations techniques sont distinctes des relations applicatives. Elles peuvent être :
- générées automatiquement depuis les relations logiques (cas simple : 1 instance par composant)
- ajustées manuellement par l'architecte quand un composant est multi-zone

### Zones réseau

```
NetworkZone
───────────
id
name        (Internet, DMZ, Internal, External, …)
order
isDefault   (zones prédéfinies non renommables)
```

Stockées dans `dag.technicalLandscape.networkZones[]`.

---

## Workflow utilisateur — cas multi-zone

1. L'architecte crée `myAppli` dans le landscape applicatif (composant logique)
2. Dans le technical landscape, il assigne `myAppli` à deux zones : DMZ et Internal
3. Le système crée automatiquement deux instances : `myAppli [DMZ]` et `myAppli [Internal]`
4. Les relations logiques existantes (`employee → myAppli`, `customer → myAppli`) sont **projetées** sur les instances :
   - par défaut : toutes les instances reçoivent toutes les relations (à affiner)
   - l'architecte ajuste manuellement : `employee → myAppli [Internal]`, `customer → myAppli [DMZ]`
5. La relation inter-instances `myAppli [DMZ] → myAppli [Internal]` est ajoutée manuellement

---

## Impact sur le modèle de données existant

| Élément | Application Landscape | Technical Landscape |
|---|---|---|
| Composants | `Component` (logique) | `ComponentInstance` (physique) |
| Relations | `Relation` (logique, Component→Component) | `TechnicalRelation` (Instance→Instance) |
| Zones réseau | — | `NetworkZone[]` dans `TechnicalLandscape` |
| Données techniques | `Component.technology/framework/constraints` | portées par `Component` (partagées) |

Les données techniques (`technology`, `framework`, `constraints`) restent sur `Component` car elles décrivent le composant logique, pas l'instance déployée.

---

## Alternative écartée : zone unique par composant

Ajouter `networkZoneId?: string` directement sur `Component` — simple mais ne couvre pas le cas multi-zone, qui est explicitement mentionné comme réel dans notre contexte.

---

## Questions ouvertes

1. **Génération automatique des instances** : quand l'architecte assigne une zone à un composant, crée-t-on l'instance automatiquement ou à la demande ?
2. **Projection des relations logiques** : comment l'UI guide-t-elle l'architecte pour rerouter les relations existantes vers les bonnes instances ?
3. **Composants techniques purs** (logging, monitoring…) : ils n'ont pas d'équivalent logique — sont-ils directement des `ComponentInstance` dans une zone "Technical Services" ?


1. **Génération automatique des instances** : quand l'architecte assigne une zone à un composant, crée-t-on l'instance automatiquement ou à la demande ?
2. **Projection des relations logiques** : comment l'UI guide-t-elle l'architecte pour rerouter les relations existantes vers les bonnes instances ?
3. **Composants techniques purs** (logging, monitoring…) : ils n'ont pas d'équivalent logique — sont-ils directement des `ComponentInstance` dans une zone "Technical Services" ?

Mes réponses
1. On peut  assigner automatiquement, pourquoi le contraire, as-tu une idée en tête?
2. La plupart du temps 1 composant = 1 instance, on mappe facilement. Si il y a plusieurs instance, on propose de pouvoir changer, mais seulement si il y a plusieurs instances
3. Je verrais bien plutot un "technicalService" parce que au final si j'utilise splunk, pour moi c'est un service, il est peut être sur plusieirs instance lui-même, je ne le sais pas et je ne veux pas le savoir
   