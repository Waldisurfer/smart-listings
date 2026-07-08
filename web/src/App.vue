<script setup lang="ts">
</script>

<template>
  <header class="site-header">
    <div class="container header-row">
      <RouterLink to="/" class="brand">
        <h1>Mieszkania<span class="brand-dot">.</span></h1>
        <span class="tagline">inteligentne ogłoszenia nieruchomości</span>
      </RouterLink>
    </div>
  </header>
  <main class="container">
    <RouterView />
  </main>
</template>

<style scoped>
.site-header {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  margin-bottom: 24px;
}

.header-row {
  display: flex;
  align-items: baseline;
  padding-top: 14px;
  padding-bottom: 14px;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.brand h1 {
  margin: 0;
  font-size: 26px;
}

.brand-dot {
  color: var(--accent);
}

.tagline {
  color: var(--muted);
  font-size: 13px;
}
</style>
