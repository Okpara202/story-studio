import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DEFAULT_URL_TTL_SEC, type ListResult, type ObjectStore } from "./types.ts";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

const isMissing = (err: unknown) =>
  err instanceof NoSuchKey || (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404);

export class R2Store implements ObjectStore {
  readonly kind = "r2";
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.s3 = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      // Newer SDKs add CRC32 checksums by default, which breaks presigned PUTs on R2.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async getText(key: string): Promise<string | null> {
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return (await res.Body?.transformToString("utf-8")) ?? null;
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  async putText(key: string, body: string, contentType = "application/json") {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Status and job files change often; never let a CDN or browser cache them.
        CacheControl: "no-store",
      }),
    );
  }

  async putBuffer(key: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async getToFile(key: string, filePath: string) {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty object: ${key}`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await pipeline(res.Body as Readable, createWriteStream(filePath));
  }

  async putFile(key: string, filePath: string, contentType: string) {
    const { size } = await stat(filePath);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }

  async list(prefix: string, opts: { delimiter?: string } = {}): Promise<ListResult> {
    const keys: string[] = [];
    const prefixes: string[] = [];
    let token: string | undefined;
    do {
      const res = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          Delimiter: opts.delimiter,
          ContinuationToken: token,
        }),
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      for (const p of res.CommonPrefixes ?? []) if (p.Prefix) prefixes.push(p.Prefix);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return { keys, prefixes };
  }

  async listObjects(prefix: string) {
    const objects: { key: string; size: number }[] = [];
    let token: string | undefined;
    do {
      const res = await this.s3.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of res.Contents ?? []) if (o.Key) objects.push({ key: o.Key, size: o.Size ?? 0 });
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deletePrefix(prefix: string): Promise<number> {
    if (!prefix.endsWith("/")) throw new Error(`Refusing to delete a prefix without a trailing slash: ${prefix}`);
    const { keys } = await this.list(prefix);
    // Single deletes (free on R2) instead of DeleteObjects, which needs checksums R2 handles inconsistently.
    for (let i = 0; i < keys.length; i += 8) {
      await Promise.all(keys.slice(i, i + 8).map((k) => this.delete(k)));
    }
    return keys.length;
  }

  presignGet(key: string, opts: { expiresIn?: number; downloadName?: string } = {}) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: opts.downloadName
          ? `attachment; filename="${opts.downloadName.replace(/"/g, "")}"`
          : undefined,
      }),
      { expiresIn: opts.expiresIn ?? DEFAULT_URL_TTL_SEC },
    );
  }

  presignPut(key: string, contentType: string, opts: { expiresIn?: number } = {}) {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: opts.expiresIn ?? DEFAULT_URL_TTL_SEC },
    );
  }
}
