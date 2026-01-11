/**
 * Bootstrap Script
 *
 * Bulk sync existing RocketChat messages to OpenSearch.
 * Run once after initial installation.
 *
 * Usage:
 *   docker compose exec realtime-sync npm run bootstrap
 */

import { Client } from '@opensearch-project/opensearch';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ROCKETCHAT_URL = process.env.ROCKETCHAT_URL || 'http://rocketchat:3000';
const ROCKETCHAT_USER = process.env.ROCKETCHAT_USER;
const ROCKETCHAT_PASSWORD = process.env.ROCKETCHAT_PASSWORD;
const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://opensearch:9200';
const ROOT_URL = process.env.ROOT_URL || 'http://localhost:3000';

const INDEX_NAME = 'rocketchat_messages';

const osClient = new Client({ node: OPENSEARCH_URL });

async function login() {
  console.log('🔐 Logging in to RocketChat...');
  const response = await axios.post(`${ROCKETCHAT_URL}/api/v1/login`, {
    user: ROCKETCHAT_USER,
    password: ROCKETCHAT_PASSWORD
  });

  if (response.data.status !== 'success') {
    throw new Error('Login failed');
  }

  console.log('✅ Logged in as:', response.data.data.me.username);
  return {
    authToken: response.data.data.authToken,
    userId: response.data.data.userId
  };
}

async function fetchChannels(auth) {
  console.log('📋 Fetching channels...');
  const response = await axios.get(`${ROCKETCHAT_URL}/api/v1/channels.list`, {
    headers: {
      'X-Auth-Token': auth.authToken,
      'X-User-Id': auth.userId
    }
  });
  return response.data.channels || [];
}

async function fetchMessages(auth, roomId, count = 100) {
  const response = await axios.get(`${ROCKETCHAT_URL}/api/v1/channels.messages`, {
    params: { roomId, count },
    headers: {
      'X-Auth-Token': auth.authToken,
      'X-User-Id': auth.userId
    }
  });
  return response.data.messages || [];
}

async function ensureIndex() {
  try {
    const exists = await osClient.indices.exists({ index: INDEX_NAME });
    if (!exists.body) {
      console.log('📦 Creating index...');
      await osClient.indices.create({
        index: INDEX_NAME,
        body: {
          settings: { number_of_shards: 1, number_of_replicas: 0 },
          mappings: {
            properties: {
              message_id: { type: 'keyword' },
              channel_id: { type: 'keyword' },
              channel_name: { type: 'keyword' },
              text: { type: 'text', analyzer: 'standard' },
              author_id: { type: 'keyword' },
              author_username: { type: 'keyword' },
              author_name: { type: 'text' },
              timestamp: { type: 'date' },
              thread_id: { type: 'keyword' },
              is_thread_reply: { type: 'boolean' },
              url: { type: 'keyword' }
            }
          }
        }
      });
    }
  } catch (error) {
    if (!error.message.includes('already exists')) {
      throw error;
    }
  }
}

async function indexMessage(message, channelName) {
  const doc = {
    message_id: message._id,
    channel_id: message.rid,
    channel_name: channelName,
    text: message.msg || '',
    author_id: message.u?._id || '',
    author_username: message.u?.username || 'unknown',
    author_name: message.u?.name || message.u?.username || 'Unknown',
    timestamp: message.ts || new Date().toISOString(),
    thread_id: message.tmid || null,
    is_thread_reply: !!message.tmid,
    url: `${ROOT_URL}/channel/${channelName}?msg=${message._id}`
  };

  await osClient.index({
    index: INDEX_NAME,
    id: message._id,
    body: doc
  });
}

async function main() {
  console.log('🚀 Bootstrap: Syncing existing messages to OpenSearch\n');

  if (!ROCKETCHAT_USER || !ROCKETCHAT_PASSWORD) {
    console.error('❌ ROCKETCHAT_USER and ROCKETCHAT_PASSWORD required');
    process.exit(1);
  }

  await ensureIndex();

  const auth = await login();
  const channels = await fetchChannels(auth);

  console.log(`\n📊 Found ${channels.length} channels\n`);

  let totalMessages = 0;

  for (const channel of channels) {
    try {
      const messages = await fetchMessages(auth, channel._id, 500);
      console.log(`📁 ${channel.name}: ${messages.length} messages`);

      for (const message of messages) {
        if (message.msg) {
          await indexMessage(message, channel.name);
          totalMessages++;
        }
      }
    } catch (error) {
      console.warn(`   ⚠️ Error: ${error.message}`);
    }
  }

  // Refresh index
  await osClient.indices.refresh({ index: INDEX_NAME });

  console.log(`\n✅ Bootstrap complete!`);
  console.log(`   Total messages indexed: ${totalMessages}`);
}

main().catch(error => {
  console.error('❌ Bootstrap failed:', error.message);
  process.exit(1);
});
