<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { fetchCities, fetchListings, type Listing, type ListingFilters } from '../api/client';
import ChatSearch, { type IntentResponse } from '../components/ChatSearch.vue';
import ListingCard from '../components/ListingCard.vue';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 900;
// The nationwide sample's cities aren't known ahead of time — load them from the API.
const cities = ref<string[]>([]);

const route = useRoute();
const router = useRouter();

// One reactive filters object, synced to the URL: refresh/share a
// search, and chat-search results are demonstrable as a URL.
const filters = reactive<ListingFilters>({
  offerType: route.query.offerType === 'rent' ? 'rent' : 'sale',
  q: String(route.query.q ?? ''),
  city: String(route.query.city ?? ''),
  minPrice: String(route.query.minPrice ?? ''),
  maxPrice: String(route.query.maxPrice ?? ''),
  minArea: String(route.query.minArea ?? ''),
  maxArea: String(route.query.maxArea ?? ''),
  rooms: String(route.query.rooms ?? ''),
  page: Number(route.query.page ?? 1) || 1,
});

const items = ref<Listing[]>([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

// Polish plural: 1 ogłoszenie · 2-4 ogłoszenia · 0/5+/x11-14 ogłoszeń.
const resultLabel = computed(() => {
  const n = total.value;
  const t = n % 100;
  const u = n % 10;
  const word =
    n === 1 ? 'ogłoszenie' : u >= 2 && u <= 4 && !(t >= 12 && t <= 14) ? 'ogłoszenia' : 'ogłoszeń';
  return `${n} ${word}`;
});

const aiMode = ref(false);
const interpretation = ref('');
const degraded = ref(false);

// Applying a chat intent mutates several filter fields at once. Without this
// guard each mutated field's watcher would fire its own load(); we suppress
// them for the batch and issue exactly one fetch instead.
let suppressWatch = false;
// Monotonic token: a slow request that resolves after a newer one is discarded
// rather than overwriting fresh results (out-of-order response guard).
let loadSeq = 0;

// AI intent lands in the SAME filters object the manual controls drive —
// one search implementation, two input modalities.
function applyIntent(intent: IntentResponse) {
  suppressWatch = true;
  Object.assign(filters, {
    offerType: 'sale', q: '', city: '', minPrice: '', maxPrice: '',
    minArea: '', maxArea: '', rooms: '', page: 1,
  });
  for (const [key, value] of Object.entries(intent.filters)) {
    if (key in filters) (filters as Record<string, unknown>)[key] = String(value);
  }
  filters.page = 1;
  interpretation.value = intent.interpretation;
  degraded.value = intent.degraded;
  // Let the watchers flush against the suppress flag, then fetch exactly once.
  nextTick(() => {
    suppressWatch = false;
    load();
  });
}

async function load() {
  const seq = ++loadSeq;
  loading.value = true;
  error.value = '';
  const query = Object.fromEntries(
    Object.entries({ ...filters, page: String(filters.page) }).filter(([, v]) => v !== '' && v !== '1'),
  );
  router.replace({ query });
  try {
    const data = await fetchListings(filters);
    if (seq !== loadSeq) return; // superseded by a newer load()
    items.value = data.items;
    total.value = data.total;
  } catch (err) {
    if (seq !== loadSeq) return;
    error.value = err instanceof Error ? err.message : 'Nie udało się wczytać ogłoszeń';
    items.value = [];
    total.value = 0;
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

// Text input debounces; every other control fetches immediately.
let qTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => filters.q,
  () => {
    if (suppressWatch) return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      filters.page = 1;
      load();
    }, DEBOUNCE_MS);
  },
);
watch(
  () => [filters.offerType, filters.city, filters.minPrice, filters.maxPrice, filters.minArea, filters.maxArea, filters.rooms],
  () => {
    if (suppressWatch) return;
    filters.page = 1;
    load();
  },
);
watch(
  () => filters.page,
  () => {
    if (suppressWatch) return;
    load();
    window.scrollTo({ top: 0 });
  },
);

onMounted(() => {
  load();
  fetchCities()
    .then((list) => (cities.value = list))
    .catch(() => (cities.value = [])); // filter still works by typing/URL if this fails
});
</script>

<template>
  <section>
    <div class="mode-switch">
      <p class="mode-hint">Jak chcesz szukać?</p>
      <div class="mode-toggle" role="group" aria-label="Tryb wyszukiwania">
        <button :class="{ active: !aiMode }" @click="aiMode = false">
          <span class="mode-icon">🔍</span>
          <span class="mode-label">
            <strong>Zwykłe wyszukiwanie</strong>
            <small>Tekst i filtry</small>
          </span>
        </button>
        <button :class="{ active: aiMode }" @click="aiMode = true">
          <span class="mode-icon">✨</span>
          <span class="mode-label">
            <strong>Wyszukiwanie AI</strong>
            <small>Opisz, czego szukasz</small>
          </span>
        </button>
      </div>
    </div>

    <ChatSearch v-if="aiMode" large @apply-filters="applyIntent" />

    <template v-else>
      <div class="search-bar">
        <input
          v-model="filters.q"
          type="search"
          placeholder="Szukaj w tytule lub opisie… (balkon, garaż, Kazimierz)"
          aria-label="Wyszukiwanie tekstowe"
        />
      </div>

      <div class="filter-row">
        <div class="toggle" role="group" aria-label="Typ oferty">
          <button :class="{ active: filters.offerType === 'sale' }" @click="filters.offerType = 'sale'">
            Sprzedaż
          </button>
          <button :class="{ active: filters.offerType === 'rent' }" @click="filters.offerType = 'rent'">
            Wynajem
          </button>
        </div>
        <select v-model="filters.city" aria-label="Miasto">
          <option value="">Wszystkie miasta</option>
          <option v-for="c in cities" :key="c" :value="c">{{ c }}</option>
        </select>
        <input v-model="filters.minPrice" type="number" min="0" placeholder="Cena od (zł)" aria-label="Cena minimalna" />
        <input v-model="filters.maxPrice" type="number" min="0" placeholder="Cena do (zł)" aria-label="Cena maksymalna" />
        <input v-model="filters.minArea" type="number" min="0" placeholder="Pow. od (m²)" aria-label="Powierzchnia minimalna" />
        <input v-model="filters.maxArea" type="number" min="0" placeholder="Pow. do (m²)" aria-label="Powierzchnia maksymalna" />
        <select v-model="filters.rooms" aria-label="Pokoje">
          <option value="">Pokoje</option>
          <option v-for="n in 5" :key="n" :value="String(n)">{{ n }}+</option>
        </select>
      </div>
    </template>

    <p v-if="interpretation" class="interpretation" :class="{ degraded }">
      {{ interpretation }}
      <button class="dismiss" aria-label="Zamknij" @click="interpretation = ''">✕</button>
    </p>

    <p v-if="!loading && !error" class="result-count">
      {{ resultLabel }}
    </p>

    <div v-if="loading" class="grid" aria-hidden="true">
      <div v-for="n in 6" :key="n" class="skeleton" />
    </div>

    <p v-else-if="error" class="state error">{{ error }}</p>

    <p v-else-if="items.length === 0" class="state">Brak ogłoszeń pasujących do filtrów.</p>

    <div v-else class="grid">
      <ListingCard v-for="l in items" :key="l.id" :listing="l" />
    </div>

    <nav v-if="totalPages > 1" class="pagination" aria-label="Paginacja">
      <button :disabled="filters.page <= 1" @click="filters.page--">← Poprzednia</button>
      <span>strona {{ filters.page }} z {{ totalPages }}</span>
      <button :disabled="filters.page >= totalPages" @click="filters.page++">Następna →</button>
    </nav>
  </section>
</template>

<style scoped>
.search-bar {
  display: flex;
  gap: 8px;
}

.search-bar input {
  flex: 1;
  padding: 12px 14px;
  font-size: 16px;
}

.mode-switch {
  margin-bottom: 18px;
}

.mode-hint {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

/* Two rounded cards side by side — a deliberate choice, not one long bar. */
.mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-width: 520px;
}

.mode-toggle button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  text-align: left;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease,
    color 150ms ease;
}

.mode-toggle button:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow);
}

.mode-toggle button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.mode-toggle button.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  box-shadow: var(--shadow);
}

.mode-icon {
  font-size: 20px;
  line-height: 1;
}

.mode-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-label strong {
  font-size: 14px;
  font-weight: 600;
}

.mode-label small {
  font-size: 12px;
  opacity: 0.7;
}

.interpretation {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: calc(var(--radius) - 4px);
  padding: 8px 12px;
  margin: 10px 0 0;
  font-size: 14px;
}

.interpretation.degraded {
  border-color: #9a6700;
  color: #9a6700;
}

.interpretation .dismiss {
  margin-left: auto;
  border: none;
  background: none;
  padding: 2px 6px;
  color: var(--muted);
}

.filter-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.filter-row input[type='number'] {
  width: 120px; /* fits the Polish placeholders ("Cena od (zł)", "Pow. od (m²)") */
  /* No spin buttons — these are typed (e.g. 650000), not clicked step-by-step. */
  appearance: textfield;
  -moz-appearance: textfield;
}

.filter-row input[type='number']::-webkit-outer-spin-button,
.filter-row input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.toggle {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) - 4px);
  overflow: hidden;
}

.toggle button {
  border: none;
  border-radius: 0;
  padding: 8px 16px;
}

.toggle button.active {
  background: var(--accent);
  color: #fff;
}

.result-count {
  color: var(--muted);
  font-size: 13px;
  margin: 14px 0 10px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 8px;
}

.skeleton {
  height: 320px;
  border-radius: var(--radius);
  background: linear-gradient(100deg, var(--line) 40%, var(--surface) 50%, var(--line) 60%);
  background-size: 200% 100%;
  animation: pulse 1.2s infinite linear;
}

@keyframes pulse {
  from {
    background-position: 120% 0;
  }
  to {
    background-position: -80% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}

.state {
  color: var(--muted);
  padding: 48px 0;
  text-align: center;
}

.state.error {
  color: #b3261e;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin: 28px 0 40px;
  color: var(--muted);
}
</style>
