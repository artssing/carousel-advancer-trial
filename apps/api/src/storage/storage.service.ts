import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

export interface StoredFile {
  url: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Storage abstraction — SSOT for "where do uploaded media files live".
 *
 * Driver selected by env `STORAGE_DRIVER` (default `local`):
 *   - `local` — writes to apps/api/uploads/, served statically at /uploads/*.
 *     Zero external dependencies; good for dev + small deployments.
 *   - `s3` — any S3-compatible endpoint (AWS S3, Cloudflare R2, Backblaze B2,
 *     MinIO). R2 is the cheapest (no egress fee) and is the intended
 *     production target. Flip via env — no code change needed:
 *       STORAGE_DRIVER=s3
 *       S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
 *       S3_BUCKET=authentik-media
 *       S3_ACCESS_KEY_ID=...
 *       S3_SECRET_ACCESS_KEY=...
 *       S3_PUBLIC_BASE_URL=https://media.authentik.hk   (R2 custom domain / public bucket URL)
 *     Requires `npm install @aws-sdk/client-s3 -w apps/api` (not installed yet —
 *     deliberately deferred until a real bucket exists; see production-setup doc).
 *
 * Callers never see the driver — they just get back a stable `url` to store
 * in Listing.images / OrderEvidence.mediaUrl etc. Swapping driver later does
 * NOT require a DB migration; existing rows keep whatever URL they were given
 * (old base64 data URLs continue to render fine in <img>/<video> — no backfill
 * needed).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'local' | 's3';
  // process.cwd()-relative, NOT __dirname-relative — __dirname differs between
  // ts-node/nest-watch (src/storage) and compiled dist (dist/storage), which
  // would silently split reads/writes across two different directories
  // (and dist/ is gitignored + wiped on every build, losing files). cwd is
  // stable: `nest start` / `node dist/main.js` are both invoked from apps/api/.
  private readonly uploadsDir = join(process.cwd(), 'uploads');

  constructor(private readonly config: ConfigService) {
    this.driver = (this.config.get<string>('STORAGE_DRIVER') ?? 'local') as 'local' | 's3';
  }

  async upload(file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<StoredFile> {
    if (this.driver === 's3') {
      return this.uploadToS3(file);
    }
    return this.uploadToLocalDisk(file);
  }

  private async uploadToLocalDisk(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }): Promise<StoredFile> {
    await mkdir(this.uploadsDir, { recursive: true });
    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
    const filename = `${randomUUID()}.${ext}`;
    await writeFile(join(this.uploadsDir, filename), file.buffer);
    const apiPort = this.config.get<string>('API_PORT') ?? '4000';
    const base = this.config.get<string>('API_PUBLIC_BASE_URL') ?? `http://localhost:${apiPort}`;
    return {
      url: `${base}/uploads/${filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  // S3-compatible adapter — code-complete but inert until @aws-sdk/client-s3
  // is installed and STORAGE_DRIVER=s3 is set. Throws a clear error otherwise
  // rather than silently falling back, so a misconfigured prod env fails loud.
  private async uploadToS3(_file: { buffer: Buffer; originalname: string; mimetype: string; size: number }): Promise<StoredFile> {
    this.logger.error('STORAGE_DRIVER=s3 set but @aws-sdk/client-s3 adapter not wired up yet.');
    throw new Error(
      'S3 storage driver selected but not implemented in this environment. ' +
        'Run: npm install @aws-sdk/client-s3 -w apps/api, then implement uploadToS3() ' +
        'using S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_PUBLIC_BASE_URL.',
    );
  }
}
