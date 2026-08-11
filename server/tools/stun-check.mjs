// Verifica che il relay risponda dall'esterno.
// Manda una richiesta STUN "Binding" (non serve nessuna credenziale):
// se il server risponde, la porta e' aperta e turnserver e' vivo.
import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';

const HOST = process.argv[2] || 'cathopedia.org';
const PORT = parseInt(process.argv[3] || '3478', 10);
const MAGIC = 0x2112a442;

const id = randomBytes(12);
const req = Buffer.alloc(20);
req.writeUInt16BE(0x0001, 0);   // Binding Request
req.writeUInt16BE(0, 2);        // nessun attributo
req.writeUInt32BE(MAGIC, 4);
id.copy(req, 8);

const sock = dgram.createSocket('udp4');
const started = Date.now();

const timer = setTimeout(() => {
  console.log(`NESSUNA RISPOSTA da ${HOST}:${PORT}/udp entro 5 secondi`);
  console.log('  -> porta chiusa dal firewall, oppure turnserver non ascolta li');
  sock.close();
  process.exit(1);
}, 5000);

sock.on('message', (msg) => {
  clearTimeout(timer);
  const type = msg.readUInt16BE(0);
  if (type !== 0x0101) {
    console.log(`Risposta inattesa (tipo 0x${type.toString(16)})`);
    sock.close();
    process.exit(1);
  }

  // Cerca XOR-MAPPED-ADDRESS: e' l'indirizzo con cui il server ci vede.
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

  console.log(`RISPONDE: ${HOST}:${PORT}/udp in ${Date.now() - started} ms`);
  if (seen) console.log(`  il server ti vede come ${seen}`);
  sock.close();
  process.exit(0);
});

sock.on('error', (e) => {
  clearTimeout(timer);
  console.log('Errore di rete:', e.message);
  process.exit(1);
});

sock.send(req, PORT, HOST);
