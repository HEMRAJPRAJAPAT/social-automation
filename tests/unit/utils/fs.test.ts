import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cleanupOldFiles, ensureDir, sha256OfFile, sha256OfString } from '../../../src/utils/fs.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-automation-fs-test-'));
  tempDirs.push(dir);
  return dir;
}

describe('sha256OfString', () => {
  it('is deterministic for the same input', () => {
    expect(sha256OfString('hello')).toBe(sha256OfString('hello'));
  });

  it('differs for different input', () => {
    expect(sha256OfString('hello')).not.toBe(sha256OfString('world'));
  });
});

describe('sha256OfFile', () => {
  it('matches the checksum of the file contents', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'a.txt');
    await fs.writeFile(filePath, 'hello');

    expect(await sha256OfFile(filePath)).toBe(sha256OfString('hello'));
  });
});

describe('ensureDir', () => {
  it('creates nested directories that do not yet exist', async () => {
    const dir = await makeTempDir();
    const nested = path.join(dir, 'a', 'b', 'c');

    await ensureDir(nested);

    const stat = await fs.stat(nested);
    expect(stat.isDirectory()).toBe(true);
  });

  it('is a no-op when the directory already exists', async () => {
    const dir = await makeTempDir();
    await expect(ensureDir(dir)).resolves.not.toThrow();
  });
});

describe('cleanupOldFiles', () => {
  it('removes files older than maxAgeMs and keeps recent ones', async () => {
    const dir = await makeTempDir();
    const oldFile = path.join(dir, 'old.txt');
    const newFile = path.join(dir, 'new.txt');
    await fs.writeFile(oldFile, 'old');
    await fs.writeFile(newFile, 'new');

    const oldTime = new Date(Date.now() - 60_000);
    await fs.utimes(oldFile, oldTime, oldTime);

    const removed = await cleanupOldFiles(dir, 30_000);

    expect(removed).toBe(1);
    await expect(fs.access(oldFile)).rejects.toThrow();
    await expect(fs.access(newFile)).resolves.not.toThrow();
  });

  it('returns 0 for a directory that does not exist', async () => {
    expect(await cleanupOldFiles('/path/does/not/exist', 1000)).toBe(0);
  });

  it('recurses into subdirectories and removes them once empty', async () => {
    const dir = await makeTempDir();
    const subDir = path.join(dir, 'sub');
    await ensureDir(subDir);
    const oldFile = path.join(subDir, 'old.txt');
    await fs.writeFile(oldFile, 'old');
    const oldTime = new Date(Date.now() - 60_000);
    await fs.utimes(oldFile, oldTime, oldTime);
    await fs.utimes(subDir, oldTime, oldTime);

    await cleanupOldFiles(dir, 30_000);

    await expect(fs.access(subDir)).rejects.toThrow();
  });
});
