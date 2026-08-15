import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

/** MIME → file extension for the types whose subtype isn't the extension. */
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
};

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
 *       S3_BUCKET=certifine-media
 *       S3_ACCESS_KEY_ID=...
 *       S3_SECRET_ACCESS_KEY=...
 *       S3_PUBLIC_BASE_URL=https://media.certifinehk.com  (R2 custom domain)
 *     Live on UAT + PROD since 2026-07-30 (buckets certifine-media /
 *     certifine-media-uat); secrets live in env/api.{prod,uat}.env (infra repo).
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
  private s3Client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {
    this.driver = (this.config.get<string>('STORAGE_DRIVER') ?? 'local') as 'local' | 's3';
  }

  /**
   * Object key = random UUID + an extension derived from the MIME type.
   *
   * The extension deliberately does NOT come from `originalname`: that string
   * is client-controlled, and `"a.png/../../x".split('.').pop()` yields a
   * segment containing slashes — path traversal out of uploads/ on the local
   * driver, and an injected key prefix on S3. Unknown types get `.bin`.
   */
  private keyFor(mimetype: string): string {
    const subtype = mimetype.split('/')[1]?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
    const ext = MIME_EXT[mimetype] ?? (subtype || 'bin');
    return `${randomUUID()}.${ext}`;
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
    const filename = this.keyFor(file.mimetype);
    await writeFile(join(this.uploadsDir, filename), file.buffer);
    const apiPort = this.config.get<string>('API_PORT') ?? '4000';
    const base = this.config.get<string>('API_PUBLIC_BASE_URL') ?? `http://localhost:${apiPort}`;
    return {
      url: `${base}/uploads/${filename}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  // S3-compatible adapter (AWS S3 / Cloudflare R2 / B2 / MinIO). Configure via
  // STORAGE_DRIVER=s3 + S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY
  // /S3_PUBLIC_BASE_URL. Fails loud on missing config rather than silently
  // falling back, so a half-configured prod env is obvious.
  private async uploadToS3(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  }): Promise<StoredFile> {
    const bucket = this.config.get<string>('S3_BUCKET');
    const publicBase = this.config.get<string>('S3_PUBLIC_BASE_URL');
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    if (!bucket || !publicBase || !endpoint || !accessKeyId || !secretAccessKey) {
      this.logger.error('STORAGE_DRIVER=s3 but S3_* env vars are incomplete.');
      throw new Error('S3 storage misconfigured — set S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY/S3_PUBLIC_BASE_URL.');
    }

    if (!this.s3Client) {
      this.s3Client = new S3Client({
        // R2 ignores region but the SDK requires a value; 'auto' is the R2 convention.
        region: this.config.get<string>('S3_REGION') ?? 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true, // R2 / MinIO need path-style addressing
      });
    }

    const key = this.keyFor(file.mimetype);
    await this.s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

    return {
      url: `${publicBase.replace(/\/$/, '')}/${key}`,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }
}
