# Security

This view lets you document the **security aspects** of the architecture.

## Authentication and authorization

Describe the authentication and authorization system:

- **Identity Provider (IdP)** — e.g. Active Directory, Keycloak, Azure AD
- **Protocol** — OIDC, SAML, OAuth2…
- **Scope** — which components are protected, which access perimeters apply

The generated diagram visually positions the authentication flows between components and the IdP.

## API Gateway

Position an API Gateway between a client and a backend:

- Select the source and target components
- Specify the product used (e.g. Kong, AWS API Gateway, Azure APIM)

## WAF (Web Application Firewall)

Position a WAF on an inbound flow from the Internet:

- Applicable to publicly exposed components (frontend, public API)

## File Transfer & Antivirus

Applicable only to flows whose protocol is of type **FILE**:

- Position an antivirus or secure transfer component between source and target

## Tips

- This view complements the Technical Landscape — define components and zones first
- The security diagram can be exported as SVG for use in PowerPoint
