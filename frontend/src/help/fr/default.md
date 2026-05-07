# BlueprintGen — Aide

BlueprintGen permet de construire et de documenter un **Document d'Architecture Générale (DAG)**.

## Deux façons de travailler

### Via l'interface de l'application

L'application guide la saisie des informations d'architecture à travers des formulaires et des tableaux.
Les diagrammes sont générés automatiquement et restent modifiables visuellement.
C'est l'approche recommandée pour démarrer ou pour les architectes moins à l'aise avec les fichiers texte.

Chaque section de l'application correspond à un artefact du DAG :

1. **Components** — déclarez les composants applicatifs et leurs catégories fonctionnelles
2. **Technical Components** — ajoutez les composants purement techniques (IAM, proxy, monitoring, antivirus…)
3. **Application Flows** — décrivez les flux séquentiels représentatifs entre composants
4. **Landscape** — visualisez et éditez le diagramme de landscape applicatif
5. **Technical Landscape** — diagramme enrichi avec zones réseau et protocoles
6. **Security** — positionnez les mécanismes d'authentification et de protection

### Via un fichier YAML dans votre projet

L'ensemble d'un DAG peut être exporté en un **fichier YAML lisible** (Save / Export → Export DAG (.yaml)), versionné dans le dépôt Git du projet, et réimporté dans l'application à tout moment via **Open → Open YAML**.

Cette approche convient aux architectes qui préfèrent travailler directement dans leur éditeur de texte ou IDE, gérer les révisions via Git, ou partager le DAG comme un artefact du projet au même titre que le code.

Les deux approches sont complémentaires : on peut passer de l'une à l'autre sans perte d'information.