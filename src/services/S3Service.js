/**
 * S3Service — wraps @aws-sdk/client-s3 v3 for client file uploads/downloads.
 * Uses the EC2 instance's IAM role (no explicit credentials).
 *
 * Bucket: donedealdigital-clientfiles (private, signed URLs only)
 */

const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = process.env.AWS_REGION || 'us-west-2';
const DEFAULT_BUCKET = process.env.CLIENTFILES_BUCKET || 'donedealdigital-clientfiles';

let cachedClient = null;
function client() {
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({ region: REGION });
  return cachedClient;
}

/**
 * Generate a pre-signed GET URL for a private S3 object.
 * TTL default: 15 minutes.
 */
async function getSignedDownloadUrl({ bucket, key, filename, expiresSec = 900 }) {
  const cmd = new GetObjectCommand({
    Bucket: bucket || DEFAULT_BUCKET,
    Key: key,
    ResponseContentDisposition: filename
      ? `attachment; filename="${filename.replace(/"/g, '')}"`
      : undefined
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresSec });
}

/**
 * Upload a buffer to S3. Returns { bucket, key, size } for DB record.
 * Key is namespaced by customer email + upload date for easy admin browsing.
 */
async function uploadBuffer({ buffer, contentType, customerEmail, filename }) {
  const bucket = DEFAULT_BUCKET;
  const safeFilename = (filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const dateFolder = new Date().toISOString().slice(0, 10);
  const emailSlug = (customerEmail || 'unknown').toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  const random = crypto.randomBytes(8).toString('hex');
  const key = `users/${emailSlug}/${dateFolder}/${random}_${safeFilename}`;

  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
    ServerSideEncryption: 'AES256'
  }));

  return { bucket, key, size: buffer.length };
}

async function deleteObject({ bucket, key }) {
  return client().send(new DeleteObjectCommand({
    Bucket: bucket || DEFAULT_BUCKET,
    Key: key
  }));
}

module.exports = {
  getSignedDownloadUrl,
  uploadBuffer,
  deleteObject,
  DEFAULT_BUCKET
};
