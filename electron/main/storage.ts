import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { STORAGE_FILE, STORAGE_SCHEMA_VERSION } from '@shared/constants.js';
import type { StoredCatalog } from '@shared/ipc-contract.js';

const RollSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  length: z.number().int().positive()
});

const CatalogSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  rolls: z.array(RollSchema),
  selectedRollIds: z.array(z.string())
});

function defaultCatalog(): StoredCatalog {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    rolls: [],
    selectedRollIds: []
  };
}

function getCatalogPath(): string {
  return join(app.getPath('userData'), STORAGE_FILE);
}

export async function loadCatalog(): Promise<StoredCatalog> {
  const filePath = getCatalogPath();
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultCatalog();
    }
    console.error('[storage] readFile failed:', (err as Error).message);
    return defaultCatalog();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error('[storage] JSON.parse failed:', (err as Error).message);
    return defaultCatalog();
  }

  const result = CatalogSchema.safeParse(parsed);
  if (!result.success) {
    console.error('[storage] schema validation failed:', result.error.message);
    return defaultCatalog();
  }
  return result.data;
}

export async function saveCatalog(catalog: StoredCatalog): Promise<void> {
  const filePath = getCatalogPath();
  const tmpPath = `${filePath}.tmp`;

  await fs.mkdir(dirname(filePath), { recursive: true });

  const json = JSON.stringify(catalog, null, 2);
  await fs.writeFile(tmpPath, json, 'utf8');
  await fs.rename(tmpPath, filePath);
}
