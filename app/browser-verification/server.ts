import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { openVerificationDatabase } from './database';
import { parseSession } from './contract';

async function readJson(request: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
    if (body.length > 1_000_000) throw new Error('Workout payload exceeds 1 MB');
  }
  return JSON.parse(body);
}

export async function startVerificationServer() {
  function requiredEnvironment(name: string): string {
    const value: unknown = process.env[name];
    if (typeof value !== 'string' || !value) throw new Error(`Missing ${name}. Launch through control.mjs up`);
    return value;
  }
  const runDirectory = requiredEnvironment('VERIFY_BROWSER_RUN_DIR');
  const runId = requiredEnvironment('VERIFY_BROWSER_RUN_ID');
  const checkout = requiredEnvironment('VERIFY_BROWSER_CHECKOUT');
  const source = requiredEnvironment('VERIFY_BROWSER_SOURCE');
  const database = await openVerificationDatabase(resolve(runDirectory, 'workout.sqlite'));
  const vite = await createViteServer({
    configFile: resolve(checkout, 'app/browser-verification/vite.config.mjs'),
    server: { middlewareMode: true },
  });
  async function api(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
      response.writeHead(403).end(JSON.stringify({ error: 'Use this verification instance origin' }));
      return;
    }
    if (request.url === '/api/identity' && request.method === 'GET') response.end(JSON.stringify(identity));
    else if (request.url === '/api/workout' && request.method === 'GET')
      response.end(JSON.stringify((await database.load()).toJSON()));
    else if (request.url === '/api/workout' && request.method === 'PUT') {
      const session = parseSession(await readJson(request));
      if (session.id !== 'browser-workout') throw new Error('Unexpected fixture workout id');
      await database.save(session);
      response.end(JSON.stringify({ saved: true }));
    } else if (request.url === '/api/evidence' && request.method === 'GET')
      response.end(JSON.stringify(await database.evidence()));
    else response.writeHead(404).end(JSON.stringify({ error: 'Unknown verification API route' }));
  }
  const server = createHttpServer((request, response) => {
    if (request.url?.startsWith('/api/')) {
      void api(request, response).catch((error: unknown) => {
        console.error(error);
        response.writeHead(400).end(JSON.stringify({ error: String(error) }));
      });
    } else vite.middlewares(request, response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing verification server port');
  const identity = {
    runId,
    checkout,
    source,
    pid: process.pid,
    databasePath: resolve(runDirectory, 'workout.sqlite'),
    url: `http://127.0.0.1:${address.port}`,
  };
  await writeFile(resolve(runDirectory, 'identity.json'), JSON.stringify(identity, null, 2));
  console.log(JSON.stringify({ ready: true, ...identity }));
  const stop = () => {
    server.closeAllConnections();
    server.close();
    void vite.close().then(() => {
      database.close();
      process.exit(0);
    });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
void startVerificationServer().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
