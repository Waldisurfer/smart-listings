<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { fetchListing, type Listing } from '../api/client';

const route = useRoute();
const listing = ref<Listing | null>(null);
const error = ref('');
const imageFailed = ref(false);

const pln = (n: number) => `${n.toLocaleString('pl-PL')} zł`;
const dash = <T,>(v: T | null, fmt: (v: T) => string = String): string =>
  v === null || v === undefined ? '—' : fmt(v);

onMounted(async () => {
  try {
    listing.value = await fetchListing(String(route.params.id));
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load listing';
  }
});
</script>

<template>
  <p v-if="error" class="state error">{{ error }} — <RouterLink to="/" class="back">back to listings</RouterLink></p>
  <p v-else-if="!listing" class="state">Loading…</p>

  <article v-else class="detail">
    <RouterLink to="/" class="back">← Back to listings</RouterLink>

    <div class="hero">
      <img
        v-if="listing.image_url && !imageFailed"
        :src="listing.image_url"
        :alt="listing.title"
        @error="imageFailed = true"
      />
      <div v-else class="hero-fallback">🏠</div>
    </div>

    <h2>{{ listing.title }}</h2>
    <p class="location">
      {{ [listing.street, listing.district, listing.city].filter(Boolean).join(', ') || 'Location unknown' }}
      · <span class="badge">{{ listing.source }}</span>
      <span v-if="listing.is_incomplete" class="badge warn" title="Missing price, area, or city in the source data">incomplete data</span>
    </p>

    <div class="price-line">
      <strong>{{ dash(listing.price, pln) }}</strong>
      <span v-if="listing.offer_type === 'rent'">/mies.</span>
      <span v-if="listing.monthly_fee" class="fee">+ czynsz {{ pln(listing.monthly_fee) }}</span>
    </div>

    <dl class="attrs">
      <div><dt>Area</dt><dd>{{ dash(listing.area_m2, (v) => `${v} m²`) }}</dd></div>
      <div><dt>Rooms</dt><dd>{{ dash(listing.rooms) }}</dd></div>
      <div><dt>Floor</dt><dd>{{ dash(listing.floor, (v) => (v === 0 ? 'parter' : String(v))) }}</dd></div>
      <div><dt>Price / m²</dt><dd>{{ dash(listing.price_per_m2, pln) }}</dd></div>
      <div><dt>Type</dt><dd>{{ listing.offer_type }}</dd></div>
    </dl>

    <aside v-if="listing.summary_ai" class="ai-callout">
      <span class="ai-label">✨ AI summary</span>
      <p>{{ listing.summary_ai }}</p>
    </aside>

    <section v-if="listing.description" class="description">
      <h3>Description</h3>
      <p>{{ listing.description }}</p>
    </section>

    <a :href="listing.source_url" target="_blank" rel="noopener noreferrer" class="source-link">
      View original on {{ listing.source }} ↗
    </a>
  </article>
</template>

<style scoped>
.detail {
  max-width: 760px;
  margin: 0 auto 48px;
}

.back {
  color: var(--muted);
  font-size: 14px;
}

.back:hover {
  color: var(--accent);
}

.hero {
  margin-top: 12px;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--line);
  aspect-ratio: 16 / 9;
}

.hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.hero-fallback {
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 64px;
  opacity: 0.4;
}

h2 {
  margin: 18px 0 4px;
  font-size: 26px;
}

.location {
  margin: 0;
  color: var(--muted);
}

.badge {
  display: inline-block;
  background: var(--ink);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
  vertical-align: middle;
}

.badge.warn {
  background: #9a6700;
  margin-left: 6px;
}

.price-line {
  margin: 14px 0;
  font-size: 26px;
  color: var(--accent);
}

.price-line .fee {
  font-size: 14px;
  color: var(--muted);
  margin-left: 10px;
}

.attrs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px;
  margin: 0 0 18px;
}

.attrs dt {
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.attrs dd {
  margin: 2px 0 0;
  font-weight: 600;
}

.ai-callout {
  border-left: 3px solid var(--accent);
  background: var(--surface);
  border-radius: 0 var(--radius) var(--radius) 0;
  padding: 12px 16px;
  margin-bottom: 18px;
}

.ai-label {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ai-callout p {
  margin: 6px 0 0;
  font-style: italic;
}

.description p {
  white-space: pre-line;
}

.source-link {
  display: inline-block;
  margin-top: 8px;
  color: var(--accent);
  font-weight: 600;
}

.state {
  color: var(--muted);
  padding: 48px 0;
  text-align: center;
}

.state.error {
  color: #b3261e;
}
</style>
