<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'

const baseUrl = import.meta.env.BASE_URL
const cfg = window.__APP_CONFIG__
const appName = cfg.appName
const fallbackLogoSrc = `${baseUrl}logo/logo.png`
const logoSrc = cfg.logoPath ?? fallbackLogoSrc
const homeUrl = cfg.homeUrl  // null = router-link interne, sinon URL externe

const handleLogoError = (event: Event) => {
  const img = event.target as HTMLImageElement
  if (img.src === logoSrc) return // pas de logoPath configuré, pas de fallback possible
  console.warn(`Erreur chargement logo : ${logoSrc}`)
  img.src = fallbackLogoSrc
}

</script>

<template>
  <div class="app-layout">
    <header>
      <div class="header-div">
        <img
          :alt="appName + ' logo'"
          class="logo"
          :src="logoSrc"
          width="110"
          @error="handleLogoError"
        />
        <span class="header-title">{{ appName }}</span>
      </div>
      <div class="wrapper">
        <nav>
          <a v-if="homeUrl" :href="homeUrl" class="nav-link">Dashboards</a>
          <router-link v-else to="/" class="nav-link">Dashboards</router-link>
        </nav>
      </div>
    </header>
    <main class="content">
      <RouterView />
    </main>
    <Toast />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}


.header-title {
  font-weight: 700;
  font-size: 1.2rem;
  color: #2c3e50;
}


.wrapper {
  display: flex;
  align-items: center;
  height: 100%;
}

nav {
  display: flex;
  gap: 2rem;
  height: 100%;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 70px;
  padding: 0 2rem;
  background-color: #efefef;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.header-div {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.nav-link {
  text-decoration: none;
  color: #64748b;
  font-weight: 600 !important;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  position: relative;
  height: 70px;
  /* Aligné sur la hauteur du header */
  transition: color 0.2s ease;
}

/* Barre d'activation sous le lien */
.nav-link::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 3px;
  background-color: #42b883;
  transition: width 0.3s ease;
}

.nav-link:hover {
  color: #2c3e50;
}

/* État actif (géré par Vue Router) */
.nav-link.router-link-active {
  color: #42b883;
}

.nav-link.router-link-active::after {
  width: 100%;
}

.content {
  flex: 1;
}
</style>
