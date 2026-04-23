<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import { computed, ref } from 'vue'

const appName = import.meta.env.VITE_APP_NAME || 'blueprintgen'
const logoSrc = import.meta.env.VITE_LOGO_PATH || '/logo/logo.svg'

const handleLogoError = (event: Event) => {
  console.warn(`Error loading logo : ${logoSrc}`)
  ;(event.target as HTMLImageElement).src = '/logo/logo.svg'
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
          <router-link to="/" class="nav-link">
            Dashboards
          </router-link>
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
  height: 100vh;
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
  position: sticky;
  top: 0;
  z-index: 100;
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
  min-height: 0;
  overflow: hidden;
}
</style>
