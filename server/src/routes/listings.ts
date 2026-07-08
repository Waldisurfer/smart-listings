/**
 * GET /api/listings + /api/listings/:id — zod validation at the boundary
 * ("never trust external data" in one visible place). Bad params → 400 with
 * readable issues; unknown id → shaped 404. `z.coerce` handles query strings.
 */
import { Router } from 'express';
import { z } from 'zod';
import { findById, findListings, getDistinctCities } from '../repo/listingsRepo.js';

const ListQuery = z.object({
  offerType: z.enum(['sale', 'rent']).default('sale'),
  source: z.enum(['otodom', 'olx']).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(128).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  minArea: z.coerce.number().nonnegative().optional(),
  maxArea: z.coerce.number().nonnegative().optional(),
  rooms: z.coerce.number().int().min(1).max(10).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** `?city=&minPrice=` — empty params mean "not set", not "validate ''". */
const dropEmpty = (query: object) =>
  Object.fromEntries(Object.entries(query).filter(([, v]) => v !== ''));

export const listingsRouter = Router();

listingsRouter.get('/meta/cities', async (_req, res) => {
  res.json({ cities: await getDistinctCities() });
});

listingsRouter.get('/listings', async (req, res) => {
  const parsed = ListQuery.safeParse(dropEmpty(req.query));
  if (!parsed.success) {
    res.status(400).json({
      error: {
        message: 'Invalid query parameters',
        issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
    });
    return;
  }
  const { items, total } = await findListings(parsed.data);
  res.json({ items, total, page: parsed.data.page, pageSize: parsed.data.pageSize });
});

listingsRouter.get('/listings/:id', async (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: { message: 'Listing id must be a positive integer' } });
    return;
  }
  const listing = await findById(id.data);
  if (!listing) {
    res.status(404).json({ error: { message: `Listing ${id.data} not found` } });
    return;
  }
  res.json(listing);
});
