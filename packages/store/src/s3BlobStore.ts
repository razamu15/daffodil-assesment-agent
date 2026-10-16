/**
 * S3BlobStore: the real BlobStore on the private uploads bucket. The media type
 * travels as the object's Content-Type; an object without a supported one fails
 * loudly instead of being guessed.
 *
 * Call sites: apps/local-server (DATA_BACKEND=aws) and, from gate I3, the Lambda handlers.
 */
import { GetObjectCommand, NoSuchKey, PutObjectCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import { BlobMediaTypeSchema } from "@helper-assistant/domain";
import type { BlobMediaType, BlobStore } from "@helper-assistant/domain";

export class S3BlobStore implements BlobStore {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, bytes: Uint8Array, mediaType: BlobMediaType): Promise<void> {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: bytes, ContentType: mediaType }));
  }

  async get(key: string): Promise<{ bytes: Uint8Array; mediaType: BlobMediaType } | null> {
    try {
      const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const mediaType = BlobMediaTypeSchema.parse(object.ContentType);
      return { bytes: await object.Body!.transformToByteArray(), mediaType };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }
}
