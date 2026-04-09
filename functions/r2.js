/**
 * Cloudflare R2 via S3-compatible API (AWS SDK v3).
 * Set R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL (params) and
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (secrets).
 */
const { defineSecret, defineString } = require('firebase-functions/params');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const r2AccessKeyId = defineSecret('R2_ACCESS_KEY_ID');
const r2SecretAccessKey = defineSecret('R2_SECRET_ACCESS_KEY');
const r2AccountId = defineString('R2_ACCOUNT_ID');
const r2Bucket = defineString('R2_BUCKET_NAME');
const r2PublicBaseUrl = defineString('R2_PUBLIC_BASE_URL');

/** @returns {{ client: import('@aws-sdk/client-s3').S3Client, bucket: string, publicBase: string }} */
function getR2Context() {
  const accountId = String(r2AccountId.value() || '').trim();
  const bucket = String(r2Bucket.value() || '').trim();
  const publicBase = String(r2PublicBaseUrl.value() || '')
    .trim()
    .replace(/\/$/, '');
  const accessKeyId = r2AccessKeyId.value();
  const secretAccessKey = r2SecretAccessKey.value();
  if (!accountId || !bucket || !publicBase || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Server missing R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY'
    );
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });
  return { client, bucket, publicBase };
}

function publicUrlForKey(publicBase, key) {
  const segs = String(key)
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent);
  return `${publicBase.replace(/\/$/, '')}/${segs.join('/')}`;
}

/**
 * @param {{ client: import('@aws-sdk/client-s3').S3Client, bucket: string, publicBase: string }} ctx
 * @param {string} key
 * @param {Buffer | Uint8Array} body
 * @param {string} [contentType]
 */
async function putObjectBuffer(ctx, key, body, contentType) {
  await ctx.client.send(
    new PutObjectCommand({
      Bucket: ctx.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream'
    })
  );
  return { path: key, download_url: publicUrlForKey(ctx.publicBase, key) };
}

/**
 * @param {{ client: import('@aws-sdk/client-s3').S3Client, bucket: string, publicBase: string }} ctx
 * @param {string} key
 * @param {import('stream').Readable} stream
 * @param {string} [contentType]
 * @param {number} [contentLength] — required for R2/S3 when Body is a stream (avoids undefined x-amz-decoded-content-length)
 */
async function putObjectStream(ctx, key, stream, contentType, contentLength) {
  const len =
    typeof contentLength === 'number' && Number.isFinite(contentLength) && contentLength >= 0
      ? Math.trunc(contentLength)
      : undefined;
  await ctx.client.send(
    new PutObjectCommand({
      Bucket: ctx.bucket,
      Key: key,
      Body: stream,
      ContentType: contentType || 'application/octet-stream',
      ...(len !== undefined ? { ContentLength: len } : {})
    })
  );
  return { path: key, download_url: publicUrlForKey(ctx.publicBase, key) };
}

/**
 * @param {{ client: import('@aws-sdk/client-s3').S3Client, bucket: string }} ctx
 * @param {string} key
 */
async function deleteObjectKey(ctx, key) {
  const k = typeof key === 'string' ? key.trim() : '';
  if (!k) return;
  try {
    await ctx.client.send(new DeleteObjectCommand({ Bucket: ctx.bucket, Key: k }));
  } catch (e) {
    const status = e?.$metadata?.httpStatusCode;
    if (status === 404) return;
    throw e;
  }
}

module.exports = {
  r2AccessKeyId,
  r2SecretAccessKey,
  r2AccountId,
  r2Bucket,
  r2PublicBaseUrl,
  getR2Context,
  publicUrlForKey,
  putObjectBuffer,
  putObjectStream,
  deleteObjectKey
};
