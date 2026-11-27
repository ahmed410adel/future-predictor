import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PredictionResult } from '@cvfp/data-models';
import type { Config } from '../config';

/** What one DynamoDB item holds. Partition key: `id` (string). */
export interface ResultItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null; // the title found on the CV
  cvKey: string;
  createdAt: string;
  result: PredictionResult;
  expiresAt?: number; // epoch seconds, only when RESULT_TTL_DAYS is set
}

export interface ResultsStore {
  save(item: ResultItem): Promise<void>;
  get(id: string): Promise<ResultItem | null>;
}

export class DynamoResultsStore implements ResultsStore {
  private readonly doc: DynamoDBDocumentClient;

  constructor(private readonly config: Config) {
    const client = new DynamoDBClient({
      region: config.region,
      // PLACEHOLDER: DYNAMODB_ENDPOINT lets you point at a VPC endpoint or DynamoDB Local.
      ...(config.dynamoEndpoint ? { endpoint: config.dynamoEndpoint } : {}),
    });
    this.doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
  }

  async save(item: ResultItem): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.config.resultsTable,
        Item: item,
        ConditionExpression: 'attribute_not_exists(id)', // one prediction per upload
      }),
    );
  }

  async get(id: string): Promise<ResultItem | null> {
    const out = await this.doc.send(new GetCommand({ TableName: this.config.resultsTable, Key: { id } }));
    return (out.Item as ResultItem | undefined) ?? null;
  }
}

export class MemoryResultsStore implements ResultsStore {
  readonly items = new Map<string, ResultItem>();

  async save(item: ResultItem): Promise<void> {
    if (this.items.has(item.id)) throw new Error('Result already exists.');
    this.items.set(item.id, item);
  }

  async get(id: string): Promise<ResultItem | null> {
    return this.items.get(id) ?? null;
  }
}
