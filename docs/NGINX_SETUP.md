# Nginx Reverse Proxy Setup

This guide explains how to configure Nginx to expose the OpenSearch-powered search API for external access (e.g., AI agents).

## Overview

```
[External Request]
https://your-domain.com/mcp-api/api/v1/chat.search
                    ↓ Nginx
http://localhost:3005/api/v1/chat.search
                    ↓
[Search Proxy → OpenSearch]
```

## Prerequisites

- Nginx installed
- SSL certificate (Let's Encrypt or other)
- RocketChat Enhanced running

## Quick Setup

### 1. Copy the example configuration

```bash
sudo cp nginx/rocketchat-proxy.conf.example /etc/nginx/sites-available/rocketchat
```

### 2. Edit the configuration

```bash
sudo nano /etc/nginx/sites-available/rocketchat
```

Update these values:
- `YOUR_DOMAIN` → your actual domain (e.g., `message.example.com`)
- `/path/to/fullchain.pem` → SSL certificate path
- `/path/to/privkey.pem` → SSL private key path
- Port `3000` → RocketChat port (default: 3000)
- Port `3005` → Search Proxy port (default: 3005)

### 3. Enable the site

```bash
sudo ln -s /etc/nginx/sites-available/rocketchat /etc/nginx/sites-enabled/
```

### 4. Test and reload

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Verify

```bash
curl https://your-domain.com/mcp-api/health
```

Expected response:
```json
{"status":"ok","opensearch":"green","opensearch_available":true}
```

## API Endpoints

After setup, these endpoints are available:

| Endpoint | Description | Auth Required |
|----------|-------------|---------------|
| `/mcp-api/health` | Health check | No |
| `/mcp-api/api/v1/chat.search` | Global message search | Yes |
| `/mcp-api/api/v1/channels.list` | Channel list with filtering | Yes |
| `/mcp-api/mcp/tools` | MCP tool list | Yes |
| `/mcp-api/mcp/execute` | Execute MCP tool | Yes |

## Authentication

All data endpoints require RocketChat authentication headers:

```bash
curl "https://your-domain.com/mcp-api/api/v1/chat.search?searchText=meeting" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

To get auth token:
```bash
curl -X POST https://your-domain.com/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"user": "username", "password": "password"}'
```

## AI Agent Configuration

For AI agents using the OpenSearch-powered search:

```env
# Use the /mcp-api path for OpenSearch search
ROCKETCHAT_URL=https://your-domain.com/mcp-api
```

## Security Notes

- All data endpoints require valid RocketChat authentication
- Only `/health` endpoint is publicly accessible (returns status only, no data)
- SSL/TLS encryption is enforced via Nginx
- Consider adding rate limiting for production use

## Optional: Rate Limiting

Add to Nginx configuration:

```nginx
# In http block
limit_req_zone $binary_remote_addr zone=mcp_limit:10m rate=10r/s;

# In location /mcp-api/
limit_req zone=mcp_limit burst=20 nodelay;
```

## Troubleshooting

### 502 Bad Gateway
- Check if search-proxy is running: `docker compose ps`
- Check logs: `docker compose logs search-proxy`

### 504 Gateway Timeout
- Increase proxy timeout in Nginx:
  ```nginx
  proxy_read_timeout 60s;
  proxy_connect_timeout 60s;
  ```

### Authentication Failed
- Verify auth headers are being passed correctly
- Check RocketChat token validity
