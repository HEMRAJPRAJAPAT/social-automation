export interface StoredFile {
  key: string;
  url: string;
  path: string;
}

/**
 * Port for making a locally-rendered file publicly reachable (Instagram's
 * Graph API needs a URL, not a file upload). `LocalStorageProvider` serves
 * files from Express as a free default; swap in S3/Cloudinary later by
 * implementing this interface and changing one line in `container.ts`.
 */
export interface IStorageProvider {
  readonly name: string;

  save(localFilePath: string, key: string): Promise<StoredFile>;
  getPublicUrl(key: string): string;
}
