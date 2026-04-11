/**
 * Wait until hostname "postgres" resolves and port 5432 accepts connections.
 * Avoids migrate.js failing with EAI_AGAIN / ECONNREFUSED when api starts before Docker DNS/embeds DB.
 */
const net = require('net');

const host = process.env.PGHOST || 'postgres';
const port = Number(process.env.PGPORT || 5432);
const maxAttempts = Number(process.env.WAIT_FOR_PG_ATTEMPTS || 60);
const delayMs = Number(process.env.WAIT_FOR_PG_DELAY_MS || 2000);

function tryConnect() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve();
    });
    socket.on('error', reject);
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error('connect timeout'));
    });
  });
}

async function main() {
  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      await tryConnect();
      console.log(`Postgres reachable at ${host}:${port} (attempt ${i})`);
      process.exit(0);
    } catch (err) {
      console.log(`Waiting for Postgres ${host}:${port} (${i}/${maxAttempts}) — ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.error(`Postgres not reachable after ${maxAttempts} attempts`);
  process.exit(1);
}

main();
