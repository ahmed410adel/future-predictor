import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { loadConfig, type Config } from './config';
import { HttpError, sendError } from './http';
import { handleHealth } from './routes/health';
import { handleCreatePrediction, handleGetPrediction, type PredictionDeps } from './routes/predictions';
import { handleCreateUpload, handleMockUpload } from './routes/uploads';
import { BedrockPredictor, MockPredictor } from './services/ai';
import { DynamoResultsStore, MemoryResultsStore } from './services/results';
import { MemoryCvStorage, S3CvStorage } from './services/storage';

export interface AppDeps extends PredictionDeps {
  mockStorage?: MemoryCvStorage;
}

export function buildDeps(config: Config): AppDeps {
  if (config.useMocks) {
    const storage = new MemoryCvStorage(config);
    return {
      config,
      storage,
      mockStorage: storage,
      results: new MemoryResultsStore(),
      predictor: new MockPredictor(),
    };
  }
  return {
    config,
    storage: new S3CvStorage(config),
    results: new DynamoResultsStore(config),
    predictor: new BedrockPredictor(config),
  };
}

export function createApp(deps: AppDeps): Server {
  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const { pathname } = new URL(req.url ?? '/', 'http://internal');
    const method = req.method ?? 'GET';

    if (method === 'GET' && pathname === '/health') return handleHealth(req, res);
    if (method === 'POST' && pathname === '/api/uploads') return handleCreateUpload(req, res, deps);
    if (method === 'POST' && pathname === '/api/predictions') return handleCreatePrediction(req, res, deps);

    const match = pathname.match(/^\/api\/predictions\/([^/]+)$/);
    if (method === 'GET' && match) return handleGetPrediction(req, res, deps, match[1]);

    if (method === 'PUT' && pathname.startsWith('/mock-s3/') && deps.mockStorage) {
      return handleMockUpload(req, res, pathname, deps.mockStorage);
    }
    throw new HttpError(404, 'NOT_FOUND', 'Not found.');
  };

  const server = createServer((req, res) => {
    route(req, res).catch((err) => sendError(res, err));
  });
  server.requestTimeout = 120_000; // a Bedrock call can take a while
  server.headersTimeout = 20_000;
  return server;
}

if (require.main === module) {
  const config = loadConfig();
  if (config.useMocks && !config.ownerTokenSecret) {
    config.ownerTokenSecret = randomBytes(32).toString('hex'); // fine for local use only
  }
  createApp(buildDeps(config)).listen(config.port, () => {
    console.log(`backend listening on :${config.port} (${config.useMocks ? 'MOCK mode' : 'AWS mode'})`);
  });
}
