// Checks that the relay answers from outside.
// It sends a STUN "Binding" request (no credentials needed): if the
// server answers, the port is open and turnserver is alive.
import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';

// The domain is passed on the command line: no real address goes in here,
// this file ends up in a public repository.
const HOST = process.argv[2];
if (!HOST) {
  console.error('use: node stun-check.mjs DOMAIN [PORT]');
  process.exit(1);
}
const PORT = parseInt(process.argv[3] || '3478', 10);
const MAGIC = 0x2112a442;

const id = randomBytes(12);
const req = Buffer.alloc(20);
req.writeUInt16BE(0x0001, 0);   // Binding Request
req.writeUInt16BE(0, 2);        // no attributes
req.writeUInt32BE(MAGIC, 4);
id.copy(req, 8);

const sock = dgram.createSocket('udp4');
const started = Date.now();

const timer = setTimeout(() => {
  console.log(`NO ANSWER from ${HOST}:${PORT}/udp within 5 seconds`);
  console.log('  -> the port is closed by the firewall, or turnserver is not listening there');
  sock.close();
  process.exit(1);
}, 5000);

sock.on('message', (msg) => {
  clearTimeout(timer);
  const type = msg.readUInt16BE(0);
  if (type !== 0x0101) {
    console.log(`Unexpected answer (type 0x${type.toString(16)})`);
    sock.close();
    process.exit(1);
  }

  // Look for XOR-MAPPED-ADDRESS: it is the address the server sees us at.
  let off = 20;
  let seen = null;
  while (off + 4 <= msg.length) {
    const attr = msg.readUInt16BE(off);
    const len = msg.readUInt16BE(off + 2);
    if (attr === 0x0020 && len >= 8) {
      const port = msg.readUInt16BE(off + 6) ^ (MAGIC >>> 16);
      const raw = msg.readUInt32BE(off + 8) ^ MAGIC;
      seen = `${(raw >>> 24) & 255}.${(raw >>> 16) & 255}.${(raw >>> 8) & 255}.${raw & 255}:${port}`;
      break;
    }
    off += 4 + len + ((4 - (len % 4)) % 4);
  }

  console.log(`IT ANSWERS: ${HOST}:${PORT}/udp in ${Date.now() - started} ms`);
  if (seen) console.log(`  the server sees you as ${seen}`);
  sock.close();
  process.exit(0);
});

sock.on('error', (e) => {
  clearTimeout(timer);
  console.log('Network error:', e.message);
  process.exit(1);
});

sock.send(req, PORT, HOST);
