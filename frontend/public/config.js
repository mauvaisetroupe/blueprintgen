// Configuration runtime — ce fichier peut être remplacé au démarrage du container
// sans rebuild de l'image Docker.
// Voir entrypoint.sh pour la génération dynamique depuis les variables d'environnement.
window.__APP_CONFIG__ = {
  appName: 'blueprintgen',
  logoPath: null,   // null = logo par défaut (public/logo/logo.png)
  homeUrl: null,    // null = home interne (/), sinon URL externe (ex: Architect Advisor)
}
