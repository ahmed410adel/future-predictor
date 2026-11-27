import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MAX_CV_BYTES, type CvContentType } from '@cvfp/data-models';
import type { Config } from '../config';

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
}

export interface CvStorage {
  /** URL the browser PUTs the file to. */
  presignUpload(key: string, contentType: CvContentType, size: number): Promise<PresignedUpload>;
  /** Reads the uploaded file. Returns null when it is not there. */
  readCv(key: string): Promise<Buffer | null>;
}

const URL_TTL_SECONDS = 300;

export class S3CvStorage implements CvStorage {
  private readonly client: S3Client;

  constructor(private readonly config: Config) {
    this.client = new S3Client({
      region: config.region,
      // PLACEHOLDER: S3_ENDPOINT lets you point at a VPC endpoint or a local emulator.
      ...(config.s3Endpoint ? { endpoint: config.s3Endpoint, forcePathStyle: true } : {}),
    });
  }

  async presignUpload(key: string, contentType: CvContentType, size: number): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.cvBucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size, // the signature fails if the browser sends a different size
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: URL_TTL_SECONDS });
    return {
      url,
      headers: { 'content-type': contentType }, // encryption: turn on bucket default SSE in Terraform
      expiresInSeconds: URL_TTL_SECONDS,
    };
  }

  async readCv(key: string): Promise<Buffer | null> {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.config.cvBucket, Key: key }));
      if (!out.Body) return null;
      if ((out.ContentLength ?? 0) > MAX_CV_BYTES) return null;
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }
}

/** Local development: files live in memory and the browser uploads through `/mock-s3/<key>`. */
export class MemoryCvStorage implements CvStorage {
  readonly files = new Map<string, Buffer>();

  constructor(private readonly config: Config) {}

  async presignUpload(key: string, contentType: CvContentType): Promise<PresignedUpload> {
    return {
      url: `${this.config.mockUploadBase}/${key}`,
      headers: { 'content-type': contentType },
      expiresInSeconds: URL_TTL_SECONDS,
    };
  }

  async readCv(key: string): Promise<Buffer | null> {
    return this.files.get(key) ?? null;
  }
}
