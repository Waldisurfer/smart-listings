import { createRouter, createWebHistory } from 'vue-router';
import ListingDetailView from './views/ListingDetailView.vue';
import ListingsView from './views/ListingsView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'listings', component: ListingsView },
    { path: '/listings/:id', name: 'listing-detail', component: ListingDetailView },
  ],
});
