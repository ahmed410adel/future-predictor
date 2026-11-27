export interface Config {
  port: number;
  backendUrl: string;
  s3UploadOrigin: string;
  rateLimitPerMinute: number;
  trustProxy: boolean;
  publicDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, publicDir = ''): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is not valid.');
  const backendUrl = (env.BACKEND_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '');
  new URL(backendUrl); // throws on a bad value
  const origin = (env.S3_UPLOAD_ORIGIN ?? '').trim().replace(/\/+$/, '');
  if (origin) new URL(origin);
  return {
    port,
    backendUrl,
    s3UploadOrigin: origin,
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 6),
    trustProxy: (env.TRUST_PROXY ?? 'false').toLowerCase() === 'true',
    publicDir,
  };
}
