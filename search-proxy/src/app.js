import express from 'express';
import cors from 'cors';
import { Client } from '@opensearch-project/opensearch';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3005;
const opensearchUrl = process.env.OPENSEARCH_URL || 'http://opensearch:9200';
const rocketchatUrl = process.env.ROCKETCHAT_URL || 'http://rocketchat:3000';

console.log('🔧 Configuration:');
console.log(`   OpenSearch: ${opensearchUrl}`);
console.log(`   RocketChat: ${rocketchatUrl}`);
console.log(`   Port: ${PORT}`);

// OpenSearch Client
const osClientConfig = { node: opensearchUrl };
if (opensearchUrl.startsWith('https://')) {
  osClientConfig.ssl = { rejectUnauthorized: false };
  if (process.env.OPENSEARCH_USER) {
    osClientConfig.auth = {
      username: process.env.OPENSEARCH_USER,
      password: process.env.OPENSEARCH_PASSWORD || ''
    };
  }
}
const osClient = new Client(osClientConfig);

const INDEX_NAME = 'rocketchat_messages';

// RocketChat API Helper
function createRocketChatClient(authToken, userId) {
  return axios.create({
    baseURL: rocketchatUrl,
    headers: {
      'X-Auth-Token': authToken,
      'X-User-Id': userId,
      'Content-Type': 'application/json'
    }
  });
}

// OpenSearch Health Check
let openSearchAvailable = false;
async function checkOpenSearchHealth() {
  try {
    await osClient.cluster.health();
    if (!openSearchAvailable) {
      console.log('✅ OpenSearch connected');
    }
    openSearchAvailable = true;
    return true;
  } catch (error) {
    if (openSearchAvailable) {
      console.warn('⚠️ OpenSearch disconnected:', error.message);
    }
    openSearchAvailable = false;
    return false;
  }
}

setInterval(checkOpenSearchHealth, 60000);
checkOpenSearchHealth();

// Auth Middleware
const authMiddleware = (req, res, next) => {
  const authToken = req.headers['x-auth-token'];
  const userId = req.headers['x-user-id'];

  if (!authToken || !userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'X-Auth-Token and X-User-Id headers are required'
    });
  }

  req.auth = { authToken, userId };
  next();
};

// ============================================================
// RocketChat Compatible API Endpoints
// ============================================================

// GET /api/v1/channels.list
app.get('/api/v1/channels.list', authMiddleware, async (req, res) => {
  try {
    let channels = [];
    let source = 'none';
    let filteredClientSide = false;

    const queryParam = req.query.query;
    let nameFilter = null;
    if (queryParam) {
      try {
        const parsed = JSON.parse(queryParam);
        if (parsed.name && parsed.name.$regex) {
          nameFilter = parsed.name.$regex;
        }
      } catch (e) {}
    }

    if (openSearchAvailable) {
      try {
        const response = await osClient.search({
          index: INDEX_NAME,
          body: {
            size: 0,
            aggs: {
              unique_channels: {
                terms: { field: 'channel_name', size: 1000 },
                aggs: {
                  channel_id: {
                    top_hits: { size: 1, _source: ['channel_id', 'channel_name'] }
                  }
                }
              }
            }
          }
        });

        channels = response.body.aggregations.unique_channels.buckets.map(bucket => {
          const hit = bucket.channel_id.hits.hits[0]._source;
          return { _id: hit.channel_id, name: hit.channel_name, t: 'c' };
        });

        source = 'opensearch';

        if (nameFilter) {
          const regex = new RegExp(nameFilter, 'i');
          channels = channels.filter(ch => regex.test(ch.name));
          filteredClientSide = true;
        }
      } catch (error) {
        console.warn('OpenSearch failed:', error.message);
        openSearchAvailable = false;
      }
    }

    if (!openSearchAvailable || channels.length === 0) {
      try {
        const api = createRocketChatClient(req.auth.authToken, req.auth.userId);
        const response = await api.get('/api/v1/channels.list');
        channels = response.data.channels || [];
        source = 'rocketchat';

        if (nameFilter) {
          const regex = new RegExp(nameFilter, 'i');
          channels = channels.filter(ch => regex.test(ch.name));
          filteredClientSide = true;
        }
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch channels',
          details: error.message
        });
      }
    }

    res.json({
      channels,
      count: channels.length,
      offset: 0,
      total: channels.length,
      success: true,
      _metadata: { source, opensearch_available: openSearchAvailable, filtered_client_side: filteredClientSide }
    });
  } catch (error) {
    console.error('channels.list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/chat.search
app.get('/api/v1/chat.search', authMiddleware, async (req, res) => {
  try {
    const { roomId, searchText, count = 20 } = req.query;
    let messages = [];
    let source = 'none';

    if (openSearchAvailable) {
      try {
        const must = [];
        if (searchText) must.push({ match: { text: searchText } });
        if (roomId) must.push({ term: { channel_id: roomId } });

        const response = await osClient.search({
          index: INDEX_NAME,
          body: {
            query: { bool: { must } },
            sort: [{ timestamp: 'desc' }],
            size: parseInt(count),
            highlight: {
              fields: { text: { pre_tags: ['<mark>'], post_tags: ['</mark>'] } }
            }
          }
        });

        messages = response.body.hits.hits.map(hit => ({
          _id: hit._source.message_id,
          rid: hit._source.channel_id,
          msg: hit._source.text,
          ts: hit._source.timestamp,
          u: {
            _id: hit._source.author_id || '',
            username: hit._source.author_username,
            name: hit._source.author_name || hit._source.author_username
          },
          _score: hit._score,
          _highlight: hit.highlight?.text?.[0]
        }));

        source = 'opensearch';
      } catch (error) {
        console.warn('OpenSearch search failed:', error.message);
        openSearchAvailable = false;
      }
    }

    if (!openSearchAvailable) {
      if (!roomId) {
        return res.status(400).json({
          success: false,
          error: 'roomId is required when OpenSearch is not available',
          _metadata: { opensearch_available: false }
        });
      }

      try {
        const api = createRocketChatClient(req.auth.authToken, req.auth.userId);
        const response = await api.get('/api/v1/chat.search', {
          params: { roomId, searchText, count }
        });
        messages = response.data.messages || [];
        source = 'rocketchat';
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: 'Search failed',
          details: error.message
        });
      }
    }

    res.json({
      messages,
      count: messages.length,
      success: true,
      _metadata: { source, opensearch_available: openSearchAvailable, global_search_enabled: openSearchAvailable }
    });
  } catch (error) {
    console.error('chat.search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/chat.getMessage
app.get('/api/v1/chat.getMessage', authMiddleware, async (req, res) => {
  try {
    const { msgId } = req.query;
    if (!msgId) {
      return res.status(400).json({ success: false, error: 'msgId is required' });
    }

    let message = null;
    let source = 'none';

    if (openSearchAvailable) {
      try {
        const response = await osClient.search({
          index: INDEX_NAME,
          body: { query: { term: { message_id: msgId } }, size: 1 }
        });

        if (response.body.hits.total.value > 0) {
          const hit = response.body.hits.hits[0]._source;
          message = {
            _id: hit.message_id,
            rid: hit.channel_id,
            msg: hit.text,
            ts: hit.timestamp,
            u: {
              _id: hit.author_id || '',
              username: hit.author_username,
              name: hit.author_name || hit.author_username
            }
          };
          source = 'opensearch';
        }
      } catch (error) {
        console.warn('OpenSearch getMessage failed:', error.message);
      }
    }

    if (!message) {
      try {
        const api = createRocketChatClient(req.auth.authToken, req.auth.userId);
        const response = await api.get('/api/v1/chat.getMessage', { params: { msgId } });
        message = response.data.message;
        source = 'rocketchat';
      } catch (error) {
        return res.status(404).json({ success: false, error: 'Message not found' });
      }
    }

    res.json({
      message,
      success: true,
      _metadata: { source, opensearch_available: openSearchAvailable }
    });
  } catch (error) {
    console.error('getMessage error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// MCP Protocol Endpoints
// ============================================================

app.get('/mcp/tools', authMiddleware, (req, res) => {
  res.json({
    tools: [
      {
        name: 'search_messages',
        description: 'Search RocketChat messages with Korean language support. IMPORTANT: When making HTTP requests, you MUST URL-encode the query parameters. Use URLSearchParams in JavaScript or params dict in Python requests.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query in Korean or English. MUST be URL-encoded when sent via HTTP query string.' },
            channel: { type: 'string', description: 'Filter by channel name' },
            author: { type: 'string', description: 'Filter by author username' },
            from_date: { type: 'string', description: 'Start date (ISO format)' },
            to_date: { type: 'string', description: 'End date (ISO format)' },
            limit: { type: 'number', description: 'Max results (default: 20)' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_thread',
        description: 'Get all messages in a thread',
        inputSchema: {
          type: 'object',
          properties: {
            thread_id: { type: 'string', description: 'Thread ID' }
          },
          required: ['thread_id']
        }
      },
      {
        name: 'get_message_context',
        description: 'Get context around a message',
        inputSchema: {
          type: 'object',
          properties: {
            message_id: { type: 'string', description: 'Message ID' },
            context_size: { type: 'number', description: 'Messages before/after (default: 5)' }
          },
          required: ['message_id']
        }
      }
    ]
  });
});

app.post('/mcp/execute', authMiddleware, async (req, res) => {
  const { tool, arguments: args } = req.body;

  try {
    let result;

    switch (tool) {
      case 'search_messages':
        result = await mcpSearchMessages(args);
        break;
      case 'get_thread':
        result = await mcpGetThread(args);
        break;
      case 'get_message_context':
        result = await mcpGetMessageContext(args);
        break;
      default:
        return res.status(400).json({ error: 'Unknown tool' });
    }

    res.json({ result });
  } catch (error) {
    console.error('MCP execute error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function mcpSearchMessages(args) {
  const { query, channel, author, from_date, to_date, limit = 20 } = args;

  // Debug logging
  console.log('[MCP search_messages] args:', JSON.stringify(args));
  console.log('[MCP search_messages] query:', query, 'type:', typeof query);

  if (!query || query.trim() === '') {
    console.warn('[MCP search_messages] Empty query received');
    return { total: 0, messages: [], error: 'Query is required' };
  }

  const must = [{ match: { text: query } }];
  if (channel) must.push({ term: { channel_name: channel } });
  if (author) must.push({ term: { author_username: author } });

  const filter = [];
  if (from_date || to_date) {
    const range = {};
    if (from_date) range.gte = from_date;
    if (to_date) range.lte = to_date;
    filter.push({ range: { timestamp: range } });
  }

  console.log('[MCP search_messages] OpenSearch query:', JSON.stringify({ bool: { must, filter } }));

  const response = await osClient.search({
    index: INDEX_NAME,
    body: {
      query: { bool: { must, filter } },
      highlight: { fields: { text: { pre_tags: ['<mark>'], post_tags: ['</mark>'] } } },
      sort: [{ timestamp: 'desc' }],
      size: limit
    }
  });

  console.log('[MCP search_messages] Results:', response.body.hits.total.value);

  return {
    total: response.body.hits.total.value,
    messages: response.body.hits.hits.map(hit => ({
      message_id: hit._source.message_id,
      channel_name: hit._source.channel_name,
      author: hit._source.author_username,
      text: hit._source.text,
      timestamp: hit._source.timestamp,
      highlight: hit.highlight?.text?.[0]
    }))
  };
}

async function mcpGetThread(args) {
  const { thread_id } = args;

  const response = await osClient.search({
    index: INDEX_NAME,
    body: {
      query: {
        bool: {
          should: [
            { term: { thread_id } },
            { term: { message_id: thread_id } }
          ]
        }
      },
      sort: [{ timestamp: 'asc' }],
      size: 100
    }
  });

  return {
    thread_id,
    message_count: response.body.hits.total.value,
    messages: response.body.hits.hits.map(hit => ({
      message_id: hit._source.message_id,
      author: hit._source.author_username,
      text: hit._source.text,
      timestamp: hit._source.timestamp,
      is_root: hit._source.message_id === thread_id
    }))
  };
}

async function mcpGetMessageContext(args) {
  const { message_id, context_size = 5 } = args;

  const msgResponse = await osClient.search({
    index: INDEX_NAME,
    body: { query: { term: { message_id } } }
  });

  if (msgResponse.body.hits.total.value === 0) {
    throw new Error('Message not found');
  }

  const target = msgResponse.body.hits.hits[0]._source;

  const contextResponse = await osClient.search({
    index: INDEX_NAME,
    body: {
      query: { bool: { must: [{ term: { channel_id: target.channel_id } }] } },
      sort: [{ timestamp: 'desc' }],
      size: context_size * 2 + 1
    }
  });

  return {
    target_message: {
      message_id: target.message_id,
      text: target.text,
      author: target.author_username,
      timestamp: target.timestamp
    },
    context: contextResponse.body.hits.hits.map(hit => ({
      message_id: hit._source.message_id,
      text: hit._source.text,
      author: hit._source.author_username,
      timestamp: hit._source.timestamp,
      is_target: hit._source.message_id === message_id
    }))
  };
}

// Health Check
app.get('/health', async (req, res) => {
  try {
    const osHealth = await osClient.cluster.health();
    res.json({
      status: 'ok',
      opensearch: osHealth.body.status,
      opensearch_available: openSearchAvailable
    });
  } catch (error) {
    res.json({
      status: 'degraded',
      error: error.message,
      opensearch_available: false
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Search Proxy running on port ${PORT}`);
});
