#!/bin/sh
# Génère config.js au démarrage depuis les variables d'environnement Docker/OpenShift.
# En local dev, ce script n'est pas utilisé — public/config.js sert de fallback.

# Valeurs par défaut si les variables ne sont pas définies
APP_NAME="${APP_NAME:-blueprintgen}"
LOGO_PATH="${LOGO_PATH:-null}"
HOME_URL="${HOME_URL:-null}"

# Formate les valeurs : null reste null, les strings sont entre guillemets
format_value() {
  if [ "$1" = "null" ] || [ -z "$1" ]; then
    echo "null"
  else
    echo "\"$1\""
  fi
}

cat > /usr/share/nginx/html/config.js << EOF
window.__APP_CONFIG__ = {
  appName: $(format_value "$APP_NAME"),
  logoPath: $(format_value "$LOGO_PATH"),
  homeUrl: $(format_value "$HOME_URL"),
}
EOF

exec "$@"
