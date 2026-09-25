require('dotenv').config();

const dns = require('node:dns');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { MongoClient, ObjectId } = require('mongodb');

const dnsServers = (process.env.DNS_SERVERS || '')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);
if (dnsServers.length > 0) {
  dns.setServers(dnsServers);
}

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.API_PORT || 3001);
const mongoClient = new MongoClient(
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
);
const allowedOrigins = new Set(
  (process.env.DASHBOARD_ORIGINS || 'http://localhost:8000,http://127.0.0.1:8000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

let readings;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function setCors(request, response) {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }

  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 32) {
      throw new Error('Request body exceeds 32 KB');
    }
    chunks.push(chunk);
  }

  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || Array.isArray(body) || typeof body !== 'object') {
    throw new Error('Reading must be a JSON object');
  }

  return body;
}

async function importLegacyReadingsIfEmpty() {
  if (await readings.countDocuments() > 0) {
    return;
  }

  try {
    const legacyFile = await fs.readFile(path.join(__dirname, 'db.json'), 'utf8');
    const legacyData = JSON.parse(legacyFile);
    const legacyReadings = Array.isArray(legacyData.readings)
      ? legacyData.readings
      : [];

    if (legacyReadings.length > 0) {
      await readings.insertMany(legacyReadings);
      console.log(`Imported ${legacyReadings.length} existing readings from db.json`);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function handleRequest(request, response) {
  setCors(request, response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/health' && request.method === 'GET') {
    try {
      await mongoClient.db().command({ ping: 1 });
      sendJson(response, 200, { status: 'ok', database: 'mongodb' });
    } catch {
      sendJson(response, 503, { status: 'unavailable', database: 'mongodb' });
    }
    return;
  }

  if (requestUrl.pathname !== '/readings') {
    sendJson(response, 404, { error: 'Not found' });
    return;
  }

  if (request.method === 'GET') {
    const documents = await readings.find({}).sort({ _id: 1 }).toArray();
    const result = documents.map(({ _id, ...reading }) => ({
      ...reading,
      id: reading.id || _id.toHexString()
    }));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'POST') {
    let reading;
    try {
      reading = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message || 'Invalid JSON body' });
      return;
    }

    const document = {
      ...reading,
      time: reading.time || new Date().toISOString()
    };
    if (!document.id) {
      document.id = new ObjectId().toHexString();
    }

    await readings.insertOne(document);
    sendJson(response, 201, document);
    return;
  }

  response.setHeader('Allow', 'GET, POST, OPTIONS');
  sendJson(response, 405, { error: 'Method not allowed' });
}

async function start() {
  await mongoClient.connect();
  const database = mongoClient.db(process.env.MONGODB_DB || 'field_shift_rover');
  readings = database.collection('readings');
  await importLegacyReadingsIfEmpty();

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error('API request failed:', error.message);
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'Database request failed' });
      } else {
        response.end();
      }
    });
  });

  server.listen(port, host, () => {
    console.log(`MongoDB readings API listening at http://${host}:${port}`);
  });

  const close = async () => {
    server.close();
    await mongoClient.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

start().catch(async (error) => {
  console.error('Could not start MongoDB readings API:', error.message);
  await mongoClient.close();
  process.exit(1);
});
