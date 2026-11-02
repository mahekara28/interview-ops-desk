import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp-server.js';
import { Store } from './store.js';
import { dataPath } from './config.js';
const store = new Store(dataPath);
const server = createMcpServer(store);
await server.connect(new StdioServerTransport());
process.stdin.on('end', () => {
  store.close();
});
