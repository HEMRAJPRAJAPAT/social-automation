import fs from 'node:fs/promises';
import path from 'node:path';

import { ensureDir } from '../utils/fs.js';
import { childLogger } from '../utils/logger.js';

import type { IStorageProvider, StoredFile } from './IStorageProvider.js';

const log = childLogger('local-storage');

/**
 * Serves rendered files from the local filesystem via Express static hosting
 * (mounted in `api/app.ts`). This is the free default storage backend —
 * Instagram's Graph API needs a publicly reachable URL, and this satisfies
 * that without any paid object storage. Swap for S3/Cloudinary later by
 * implementing `IStorageProvider`.
 */
export class LocalStorageProvider implements IStorageProvider {
  public readonly name = 'local';

  constructor(
    private readonly outputDir: string,
    private readonly publicBaseUrl: string,
  ) {}

  async save(localFilePath: string, key: string): Promise<StoredFile> {
    const destPath = path.join(this.outputDir, key);
    await ensureDir(path.dirname(destPath));
    await fs.copyFile(localFilePath, destPath);
    log.info({ key, destPath }, 'saved file to local storage');
    return { key, url: this.getPublicUrl(key), path: destPath };
  }

  getPublicUrl(key: string): string {
    const base = this.publicBaseUrl.replace(/\/+$/, '');
    const cleanKey = key.replace(/^\/+/, '');
    return `${base}/${cleanKey}`;
  }
}
