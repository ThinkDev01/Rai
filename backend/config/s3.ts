import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from './logger';

// S3 client + presigned-URL helpers for the attachments module (scheme D:
// keys are stable from presign — orgs/{orgId}/attachments/{uuidv7}.{ext} — the
// DB row is the only linkage; no copy/move ever happens).
//
// Credentials resolve the same way the rest of the stack does: the AWS SDK v3
// default chain reads AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
// straight from the environment (see cognito-auth.service.ts for the same
// pattern). No client is built at import time — first use constructs it
// lazily, so importing this file is side-effect-free (tests never touch S3).
//
// Default presign TTL is 15 minutes; S3_PRESIGN_EXPIRES overrides it.

export function getBucket(): string {
  return process.env['S3_BUCKET'] ?? '';
}

export function getPresignExpires(): number {
  const raw = parseInt(process.env['S3_PRESIGN_EXPIRES'] ?? '900', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 900;
}

let client: S3Client | null = null;
function s3Client(): S3Client {
  if (!client) {
    client = new S3Client({
      ...(process.env['AWS_REGION'] ? { region: process.env['AWS_REGION'] } : {}),
    });
  }
  return client;
}

const ROUTE = 'config.s3';

/** Presigned PUT URL — the client uploads its file straight to this. */
export async function presignPut(bucket: string, key: string, contentType: string): Promise<string> {
  return getSignedUrl(
    s3Client(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: getPresignExpires() },
  );
}

/** Presigned GET URL — used to populate Attachment.url for preview/download. */
export async function presignGet(bucket: string, key: string): Promise<string> {
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: getPresignExpires() },
  );
}

/** Presigned GET URL that serves the object with
 *  `Content-Disposition: attachment` — the browser downloads the file instead
 *  of rendering it, so the Download button never opens a viewer/new tab and
 *  needs no CORS (a cross-origin `<a download>` is honored because the
 *  response header forces the download). Filename is sanitized to a safe
 *  quoted RFC-5987-ish value (no CR/LF/quotes). */
export async function presignGetDownload(bucket: string, key: string, filename: string): Promise<string> {
  const safeName = filename.replace(/[\r\n"]/g, '_');
  return getSignedUrl(
    s3Client(),
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    }),
    { expiresIn: getPresignExpires() },
  );
}

/** True when the object exists (used to verify a file was really uploaded
 *  before a pending row is confirmed). */
export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Delete one object. Returns false on failure so a batch sweep can keep
 *  going and report a partial count instead of aborting. */
export async function deleteObject(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    logger.warn(
      { route: ROUTE, bucket, key, error: (err as Error).message },
      'S3 object delete failed',
    );
    return false;
  }
}
