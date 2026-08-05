import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import axios from 'axios';

import { env } from '../config/env.js';

import { childLogger } from './logger.js';

const log = childLogger('fs-utils');

export const STORAGE_ROOT = path.resolve(env.STORAGE_ROOT);
export const TEMP_DIR = path.join(STORAGE_ROOT, 'temp');
export const OUTPUT_DIR = path.join(STORAGE_ROOT, 'output');
export const CACHE_DIR = path.join(STORAGE_ROOT, 'cache');

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function executionWorkDir(executionId: string): string {
  return path.join(TEMP_DIR, executionId);
}

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  await ensureDir(path.dirname(destPath));
  const response = await axios.get<NodeJS.ReadableStream>(url, {
    responseType: 'stream',
    timeout: 30_000,
  });

  await new Promise<void>((resolve, reject) => {
    const writer = createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
    response.data.on('error', reject);
  });
}

export async function sha256OfFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

export function sha256OfString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Deletes files under `dir` older than `maxAgeMs` (spec bonus: automatic temp cleanup). */
export async function cleanupOldFiles(dir: string, maxAgeMs: number): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return 0;
  }

  const now = Date.now();
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        removed += await cleanupOldFiles(fullPath, maxAgeMs);
        const remaining = await fs.readdir(fullPath);
        if (remaining.length === 0 && now - stat.mtimeMs > maxAgeMs) {
          await fs.rmdir(fullPath);
        }
        continue;
      }
      if (now - stat.mtimeMs > maxAgeMs) {
        await fs.unlink(fullPath);
        removed++;
      }
    } catch (error) {
      log.warn({ fullPath, error }, 'failed to clean up file');
    }
  }
  return removed;
}

export async function ensureStorageDirs(): Promise<void> {
  await Promise.all([ensureDir(TEMP_DIR), ensureDir(OUTPUT_DIR), ensureDir(CACHE_DIR)]);
}
