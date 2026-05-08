import { z } from 'zod';
import { STORAGE_SCHEMA_VERSION } from './constants';
import type { RollType } from '../domain/types';

export const RollSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  length: z.number().int().positive()
}) satisfies z.ZodType<RollType>;

export const CatalogSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  rolls: z.array(RollSchema),
  selectedRollIds: z.array(z.string())
});

export type StoredCatalog = z.infer<typeof CatalogSchema>;
