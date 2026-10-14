/**
 * InMemoryBlobStore: the BlobStore fake (uploaded screenshot bytes). The real
 * S3BlobStore lives beside DynamoStore in this package.
 */
import type { BlobStore, ImageMediaType } from "@helper-assistant/domain";

export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, { bytes: Uint8Array; mediaType: ImageMediaType }>();

  async put(key: string, bytes: Uint8Array, mediaType: ImageMediaType): Promise<void> {
    this.blobs.set(key, { bytes: bytes.slice(), mediaType });
  }

  async get(key: string): Promise<{ bytes: Uint8Array; mediaType: ImageMediaType } | null> {
    const blob = this.blobs.get(key);
    return blob ? { bytes: blob.bytes.slice(), mediaType: blob.mediaType } : null;
  }
}
