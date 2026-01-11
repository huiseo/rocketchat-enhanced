import WebSocket from 'ws';
import { Client } from '@opensearch-project/opensearch';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const ROCKETCHAT_WS_URL = process.env.ROCKETCHAT_WS_URL || 'ws://rocketchat:3000/websocket';
const ROCKETCHAT_USER = process.env.ROCKETCHAT_USER;
const ROCKETCHAT_PASSWORD = process.env.ROCKETCHAT_PASSWORD;
const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://opensearch:9200';
const ROOT_URL = process.env.ROOT_URL || 'http://localhost:3000';

const INDEX_NAME = 'rocketchat_messages';

console.log('🔧 Configuration:');
console.log(`   RocketChat WS: ${ROCKETCHAT_WS_URL}`);
console.log(`   OpenSearch: ${OPENSEARCH_URL}`);
console.log(`   User: ${ROCKETCHAT_USER}`);

// OpenSearch Client
const osClient = new Client({ node: OPENSEARCH_URL });

// Message ID Generator
let messageIdCounter = 1;
function generateMessageId() {
  return `msg-${Date.now()}-${messageIdCounter++}`;
}

// Create Index if not exists
async function ensureIndex() {
  try {
    const exists = await osClient.indices.exists({ index: INDEX_NAME });
    if (!exists.body) {
      console.log('📦 Creating index with Korean analyzer (Nori)...');
      await osClient.indices.create({
        index: INDEX_NAME,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            analysis: {
              analyzer: {
                korean_analyzer: {
                  type: 'custom',
                  tokenizer: 'nori_tokenizer',
                  filter: ['nori_readingform', 'lowercase', 'nori_part_of_speech']
                }
              },
              filter: {
                nori_part_of_speech: {
                  type: 'nori_part_of_speech',
                  stoptags: ['E', 'IC', 'J', 'MAG', 'MAJ', 'MM', 'SP', 'SSC', 'SSO', 'SC', 'SE', 'XPN', 'XSA', 'XSN', 'XSV', 'UNA', 'NA', 'VSV']
                }
              }
            }
          },
          mappings: {
            properties: {
              message_id: { type: 'keyword' },
              channel_id: { type: 'keyword' },
              channel_name: { type: 'keyword' },
              text: {
                type: 'text',
                analyzer: 'korean_analyzer',
                search_analyzer: 'korean_analyzer',
                fields: {
                  raw: { type: 'keyword' }
                }
              },
              author_id: { type: 'keyword' },
              author_username: { type: 'keyword' },
              author_name: {
                type: 'text',
                analyzer: 'korean_analyzer',
                fields: {
                  raw: { type: 'keyword' }
                }
              },
              timestamp: { type: 'date' },
              thread_id: { type: 'keyword' },
              is_thread_reply: { type: 'boolean' },
              url: { type: 'keyword' }
            }
          }
        }
      });
      console.log('✅ Index created with Korean analyzer');
    } else {
      console.log('✅ Index exists');
    }
  } catch (error) {
    console.error('❌ Index error:', error.message);
  }
}

// Index a message
async function indexMessage(message, channelInfo = {}) {
  try {
    const doc = {
      message_id: message._id,
      channel_id: message.rid,
      channel_name: channelInfo.name || message.rid,
      text: message.msg || '',
      author_id: message.u?._id || '',
      author_username: message.u?.username || 'unknown',
      author_name: message.u?.name || message.u?.username || 'Unknown',
      timestamp: message.ts?.$date || message.ts || new Date().toISOString(),
      thread_id: message.tmid || null,
      is_thread_reply: !!message.tmid,
      url: `${ROOT_URL}/channel/${channelInfo.name || message.rid}?msg=${message._id}`
    };

    await osClient.index({
      index: INDEX_NAME,
      id: message._id,
      body: doc,
      refresh: true
    });

    console.log(`[INDEXED] ${message._id} in ${channelInfo.name || message.rid}: ${doc.text.substring(0, 50)}...`);
  } catch (error) {
    console.error(`[ERROR] Failed to index ${message._id}:`, error.message);
  }
}

// Realtime Sync Class
class RealtimeSync {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.subscriptions = new Map();
    this.channels = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
  }

  connect() {
    console.log('🔌 Connecting to RocketChat WebSocket...');

    this.ws = new WebSocket(ROCKETCHAT_WS_URL);

    this.ws.on('open', () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      this.sendConnect();
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('close', () => {
      console.log('❌ WebSocket closed');
      this.scheduleReconnect();
    });

    this.ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
    });
  }

  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(`🔄 Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('❌ Max reconnect attempts reached. Exiting.');
      process.exit(1);
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendConnect() {
    this.send({
      msg: 'connect',
      version: '1',
      support: ['1', 'pre2', 'pre1']
    });
  }

  async handleMessage(data) {
    try {
      const msg = JSON.parse(data);

      switch (msg.msg) {
        case 'connected':
          console.log('✅ DDP connected, session:', msg.session);
          this.sessionId = msg.session;
          this.login();
          break;

        case 'result':
          if (msg.id === 'login-1') {
            if (msg.result) {
              console.log('✅ Logged in as:', ROCKETCHAT_USER);
              await this.fetchAndSubscribeChannels();
            } else if (msg.error) {
              console.error('❌ Login failed:', msg.error.message);
            }
          }
          break;

        case 'changed':
          if (msg.collection === 'stream-room-messages') {
            const messages = msg.fields?.args || [];
            for (const message of messages) {
              if (message._id && message.msg) {
                const channelInfo = this.channels.get(message.rid) || {};
                await indexMessage(message, channelInfo);
              }
            }
          }
          break;

        case 'ping':
          this.send({ msg: 'pong' });
          break;

        case 'ready':
          // Subscription ready
          break;

        default:
          // Ignore other messages
          break;
      }
    } catch (error) {
      console.error('Message parse error:', error.message);
    }
  }

  login() {
    console.log('🔐 Logging in...');
    this.send({
      msg: 'method',
      method: 'login',
      id: 'login-1',
      params: [{
        user: { username: ROCKETCHAT_USER },
        password: ROCKETCHAT_PASSWORD
      }]
    });
  }

  async fetchAndSubscribeChannels() {
    console.log('📋 Fetching channels...');

    // Subscribe to all public rooms using '__my_messages__'
    this.subscribeToAllMessages();
  }

  subscribeToAllMessages() {
    console.log('📡 Subscribing to all messages...');

    const subId = generateMessageId();
    this.send({
      msg: 'sub',
      id: subId,
      name: 'stream-room-messages',
      params: ['__my_messages__', { useCollection: false, args: [] }]
    });

    console.log('✅ Subscribed to __my_messages__');
  }

  subscribeToRoom(roomId, roomName) {
    const subId = generateMessageId();
    this.subscriptions.set(roomId, subId);
    this.channels.set(roomId, { name: roomName });

    this.send({
      msg: 'sub',
      id: subId,
      name: 'stream-room-messages',
      params: [roomId, { useCollection: false, args: [] }]
    });

    console.log(`📡 Subscribed to: ${roomName} (${roomId})`);
  }
}

// Main
async function main() {
  console.log('🚀 RocketChat Realtime Sync starting...');

  if (!ROCKETCHAT_USER || !ROCKETCHAT_PASSWORD) {
    console.error('❌ ROCKETCHAT_USER and ROCKETCHAT_PASSWORD are required');
    console.log('   Set these in your .env file after creating an admin account');
    process.exit(1);
  }

  // Wait for OpenSearch to be ready
  let osReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      await osClient.cluster.health();
      osReady = true;
      console.log('✅ OpenSearch is ready');
      break;
    } catch (error) {
      console.log(`⏳ Waiting for OpenSearch... (${i + 1}/30)`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!osReady) {
    console.error('❌ OpenSearch not available');
    process.exit(1);
  }

  await ensureIndex();

  const sync = new RealtimeSync();
  sync.connect();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down...');
    if (sync.ws) sync.ws.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down...');
    if (sync.ws) sync.ws.close();
    process.exit(0);
  });
}

main().catch(console.error);
