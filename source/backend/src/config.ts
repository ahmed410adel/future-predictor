export interface Config {
  port: number;
  useMocks: boolean;
  region: string;
  cvBucket: string;
  resultsTable: string;
  bedrockModelId: string;
  ownerTokenSecret: string;
  s3Endpoint?: string;
  dynamoEndpoint?: string;
  bedrockEndpoint?: string;
  resultTtlDays?: number;
  /** Where the browser should send mock uploads (local mode only). */
  mockUploadBase: string;
}

const PLACEHOLDER = /^REPLACE_ME/;

function optional(value: string | undefined): string | undefined {
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const useMocks = (env.USE_MOCKS ?? 'true').toLowerCase() !== 'false';
  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT is not valid.');

  const config: Config = {
    port,
    useMocks,
    region: env.AWS_REGION ?? 'us-east-1',
    cvBucket: env.CV_BUCKET ?? 'REPLACE_ME_cv-bucket-name',
    resultsTable: env.RESULTS_TABLE ?? 'REPLACE_ME_results-table-name',
    bedrockModelId: env.BEDROCK_MODEL_ID ?? 'amazon.nova-lite-v1:0',
    ownerTokenSecret: env.OWNER_TOKEN_SECRET ?? '',
    s3Endpoint: optional(env.S3_ENDPOINT),
    dynamoEndpoint: optional(env.DYNAMODB_ENDPOINT),
    bedrockEndpoint: optional(env.BEDROCK_ENDPOINT),
    resultTtlDays: optional(env.RESULT_TTL_DAYS) ? Number(env.RESULT_TTL_DAYS) : undefined,
    mockUploadBase: '/mock-s3',
  };

  if (!useMocks) {
    // Refuse to start with placeholder values instead of failing later with a confusing AWS error.
    const missing = (
      [
        ['CV_BUCKET', config.cvBucket],
        ['RESULTS_TABLE', config.resultsTable],
        ['OWNER_TOKEN_SECRET', config.ownerTokenSecret],
      ] as const
    )
      .filter(([, v]) => !v || PLACEHOLDER.test(v))
      .map(([k]) => k);
    if (missing.length > 0) throw new Error(`Set these before using real AWS: ${missing.join(', ')}`);
    if (config.ownerTokenSecret.length < 32) throw new Error('OWNER_TOKEN_SECRET must be at least 32 characters.');
  }
  return config;
}
