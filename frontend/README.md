# frontend

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

## Docker

The Docker image is published to Docker Hub via GitHub Actions on every push to `main`.

### Build locally

```sh
docker build -t blueprintgen .
```

### Run

```sh
docker run -p 8080:8080 blueprintgen
```

The app is served at `http://localhost:8080/blueprintgen/`.

### Runtime configuration

The image supports runtime configuration via environment variables — no rebuild required.
At container startup, `entrypoint.sh` generates `/usr/share/nginx/html/blueprintgen/config.js` from the following variables:

| Variable | Default | Description |
|---|---|---|
| `APP_NAME` | `blueprintgen` | Application name displayed in the header |
| `LOGO_PATH` | `null` (default logo) | URL of the logo to display (can be an absolute URL) |
| `HOME_URL` | `null` (internal dashboard) | If set, the "Dashboards" nav link redirects to this external URL |

Example:

```sh
docker run -p 8080:8080 \
  -e APP_NAME="My Company Tools" \
  -e LOGO_PATH="https://mycompany.com/logo/logo.svg" \
  -e HOME_URL="https://mycompany.com/architect-advisor" \
  blueprintgen
```

### Default logo

Place your default logo at `public/logo/logo.png`. It will be served as a fallback when `LOGO_PATH` is not set.
You can also host the logo externally and reference it via `LOGO_PATH`.

## Deployment behind a reverse proxy (Nginx)

The app is designed to run at the `/blueprintgen/` path behind a main Nginx instance.

### Minimal reverse proxy configuration

```nginx
location /blueprintgen/ {
    proxy_pass http://blueprintgen-container:8080/blueprintgen/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

### Serving the logo from the main server

If your main server already hosts static assets (e.g. a Hugo site), you can serve the logo directly from there without touching the container:

```nginx
# Logo served from the main server's static directory
location /logo/ {
    root /var/www/static;
}
```

Then set `LOGO_PATH=https://mycompany.com/logo/logo.svg` when running the container.

### OpenShift

In OpenShift, pass environment variables in the `Deployment` manifest:

```yaml
spec:
  containers:
    - name: blueprintgen
      image: mauvaisetroupe/blueprintgen:latest
      env:
        - name: APP_NAME
          value: "My Company Tools"
        - name: LOGO_PATH
          value: "https://mycompany.com/logo/logo.svg"
        - name: HOME_URL
          value: "https://mycompany.com/architect-advisor"
```

Or via the CLI:

```sh
oc set env deployment/blueprintgen \
  APP_NAME="My Company Tools" \
  LOGO_PATH="https://mycompany.com/logo/logo.svg" \
  HOME_URL="https://mycompany.com/architect-advisor"
```
