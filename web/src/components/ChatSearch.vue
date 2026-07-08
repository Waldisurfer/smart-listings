<script setup lang="ts">
import { ref } from 'vue';

export interface IntentResponse {
  filters: Record<string, string | number>;
  interpretation: string;
  degraded: boolean;
}

const emit = defineEmits<{ 'apply-filters': [IntentResponse] }>();

const query = ref('');
const busy = ref(false);

async function submit() {
  const q = query.value.trim();
  if (!q || busy.value) return;
  busy.value = true;
  try {
    const res = await fetch('/api/search/parse-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    if (!res.ok) throw new Error(`parse-intent failed (${res.status})`);
    emit('apply-filters', await res.json());
    query.value = '';
  } catch {
    // Same degraded shape the server would produce — the box never breaks.
    emit('apply-filters', {
      filters: { q },
      interpretation: 'AI unavailable — using plain text search.',
      degraded: true,
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form class="chat-search" @submit.prevent="submit">
    <input
      v-model="query"
      type="text"
      placeholder='Describe what you want… e.g. "tanie mieszkanie do wynajęcia w Krakowie, min 40m"'
      aria-label="AI chat search"
      :disabled="busy"
    />
    <button type="submit" :disabled="busy || !query.trim()">
      {{ busy ? 'Thinking…' : '✨ Search' }}
    </button>
  </form>
</template>

<style scoped>
.chat-search {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.chat-search input {
  flex: 1;
  padding: 12px 14px;
  border-color: var(--accent);
}

.chat-search button {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  padding: 0 18px;
}
</style>
