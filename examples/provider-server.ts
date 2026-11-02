import { createServer } from 'node:http';
import { sampleSnapshot } from '../server/sample-snapshot.js';

// Frozen at process start so repeated reads do not invent scheduling changes.
const snapshot = sampleSnapshot();
const server = createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/snapshot') {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(snapshot));
});
server.listen(4312, '127.0.0.1', () =>
  console.log('Fictional provider API: http://127.0.0.1:4312/snapshot'),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
