/**
 * InMemoryBlobStore: the BlobStore fake (uploaded screenshot bytes). The real
 * S3BlobStore lives beside DynamoStore in this package.
 */
import type { BlobStore, BlobMediaType } from "@helper-assistant/domain";

export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, { bytes: Uint8Array; mediaType: BlobMediaType }>();

  async put(key: string, bytes: Uint8Array, mediaType: BlobMediaType): Promise<void> {
    this.blobs.set(key, { bytes: bytes.slice(), mediaType });
  }

  async get(key: string): Promise<{ bytes: Uint8Array; mediaType: BlobMediaType } | null> {
    const blob = this.blobs.get(key);
    return blob ? { bytes: blob.bytes.slice(), mediaType: blob.mediaType } : null;
  }
}
