<script setup lang="ts">
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'
</script>

<template>
  <div class="app-layout">
    <header class="topbar">
      <span class="app-name">blueprintgen</span>
      <nav>
        <router-link to="/">DAGs</router-link>
      </nav>
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

.topbar {
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0 1.5rem;
  height: 52px;
  background: var(--p-primary-900, #1e3a5f);
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
}

.app-name {
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.03em;
}

.topbar nav a {
  color: rgba(255, 255, 255, 0.8);
  text-decoration: none;
  font-size: 0.9rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.topbar nav a:hover,
.topbar nav a.router-link-active {
  color: #fff;
  background: rgba(255,255,255,0.1);
}

.content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
