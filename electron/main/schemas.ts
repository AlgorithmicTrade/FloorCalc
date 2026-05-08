import { z } from 'zod';
import { STORAGE_SCHEMA_VERSION } from '@shared/constants.js';

export const RollSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  length: z.number().int().positive()
});

export const CatalogSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  rolls: z.array(RollSchema),
  selectedRollIds: z.array(z.string())
});
