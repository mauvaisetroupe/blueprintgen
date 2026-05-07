# Security

Cette vue permet de documenter les aspects de **sécurité** de l'architecture.

## Authentification et autorisation

Décrivez le système d'authentification et d'autorisation :

- **Identity Provider (IdP)** — ex. : Active Directory, Keycloak, Azure AD
- **Protocole** — OIDC, SAML, OAuth2…
- **Portée** — quels composants sont protégés, quels périmètres d'accès

Le diagramme généré positionne visuellement les flux d'authentification entre les composants et l'IdP.

## API Gateway

Positionnez une API Gateway entre un client et un backend :

- Sélectionnez le composant source et le composant cible concernés
- Renseignez le produit utilisé (ex. : Kong, AWS API Gateway, Azure APIM)

## WAF (Web Application Firewall)

Positionnez un WAF sur un flux entrant depuis Internet :

- Applicable aux composants exposés publiquement (frontend, API publique)

## File Transfer & Antivirus

Applicable uniquement aux flux dont le protocole est de type **FILE** :

- Positionnez un antivirus ou un composant de transfert sécurisé entre source et cible

## Conseils

- Cette vue complète le Technical Landscape — définissez d'abord les composants et zones
- Le diagramme de sécurité est exportable en SVG pour le PowerPoint
