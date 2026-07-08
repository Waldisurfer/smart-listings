<script setup lang="ts">
import { ref } from 'vue';
import type { Listing } from '../api/client';

const props = defineProps<{ listing: Listing }>();

const imageFailed = ref(false);

const pln = (n: number) => `${n.toLocaleString('pl-PL')} zł`;

// Missing data renders as "—" in the UI, never a blank or a fake zero.
const price = () => {
  if (props.listing.price === null) return '—';
  const base = pln(props.listing.price);
  return props.listing.offer_type === 'rent' ? `${base}/mies.` : base;
};
</script>

<template>
  <RouterLink :to="`/listings/${listing.id}`" class="card">
    <div class="thumb">
      <img
        v-if="listing.image_url && !imageFailed"
        :src="listing.image_url"
        :alt="listing.title"
        loading="lazy"
        @error="imageFailed = true"
      />
      <div v-else class="thumb-fallback">🏠</div>
      <span class="badge">{{ listing.source }}</span>
    </div>
    <div class="body">
      <div class="price-row">
        <strong class="price">{{ price() }}</strong>
        <span v-if="listing.monthly_fee" class="fee">+ czynsz {{ pln(listing.monthly_fee) }}</span>
      </div>
      <h3 class="title">{{ listing.title }}</h3>
      <p class="meta">
        <span>{{ listing.area_m2 !== null ? `${listing.area_m2} m²` : '—' }}</span>
        <span>{{ listing.rooms !== null ? `${listing.rooms} pok.` : '—' }}</span>
        <span>{{ listing.price_per_m2 !== null ? `${pln(listing.price_per_m2)}/m²` : '—' }}</span>
      </p>
      <p class="location">
        {{ [listing.city, listing.district].filter(Boolean).join(', ') || '—' }}
      </p>
      <p v-if="listing.summary_ai" class="summary">{{ listing.summary_ai }}</p>
    </div>
  </RouterLink>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.card:hover {
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}

.thumb {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--line);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.thumb-fallback {
  height: 100%;
  display: grid;
  place-items: center;
  font-size: 40px;
  opacity: 0.4;
}

.badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(33, 37, 42, 0.75);
  color: #fff;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
}

.body {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.price {
  font-size: 18px;
  color: var(--accent);
}

.fee {
  font-size: 12px;
  color: var(--muted);
}

.title {
  margin: 0;
  font-size: 15px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta {
  margin: 0;
  display: flex;
  gap: 12px;
  font-size: 13px;
}

.location {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.summary {
  margin: 6px 0 0;
  font-style: italic;
  color: var(--muted);
  font-size: 13px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
