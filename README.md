# RocketChat Enhanced

> RocketChat + OpenSearch Full-text Search Extension

An all-in-one package that adds OpenSearch-based full-text search capabilities to the official RocketChat Docker image.

[한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md)

## Key Features

| Feature | Default RocketChat | Enhanced |
|---------|-------------------|----------|
| Global Message Search | Channel-only | Workspace-wide search |
| Channel Filtering | Not working | Regex filter support |
| CJK Language Search | Limited | Full support (Korean, Japanese, Chinese) |
| Search Highlighting | No | Yes |
| Real-time Indexing | No | Yes |
| MCP Protocol | No | AI tool integration ready |

## System Requirements

- **Docker**: 20.10 or higher
- **Docker Compose**: v2.0 or higher
- **Memory**: 4GB minimum (8GB recommended)
- **Disk**: 10GB minimum

## Quick Start

### Method 1: One-click Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/install.sh | bash
```

The install script automatically:
- Checks Docker installation
- Prompts for server URL
- Downloads required files
- Starts all services

### Method 2: Manual Installation

```bash
# 1. Download compose file
curl -O https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/compose.production.yml
mv compose.production.yml compose.yml

# 2. Create .env file
cat > .env << 'EOF'
ROOT_URL=http://your-server:3000
PORT=3000
PROXY_PORT=3005
EOF

# 3. Start services
docker compose up -d
```

## Post-Installation Setup

### Step 1: Create Admin Account

1. Open `http://localhost:3000` in your browser
2. Complete the Setup Wizard
3. Create an admin account (remember the username and password)

### Step 2: Enable Real-time Search Sync

After creating the admin account, configure the sync service:

```bash
# Add admin credentials to .env
cat >> .env << 'EOF'
ADMIN_USER=your-admin-username
ADMIN_PASSWORD=your-admin-password
EOF

# Restart realtime-sync service
docker compose up -d realtime-sync
```

### Step 3: Sync Existing Messages (Optional)

If you have existing messages to index:

```bash
docker compose exec realtime-sync node src/bootstrap.js
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌─────────────┐ │
│  │  RocketChat  │────▶│   MongoDB    │     │ OpenSearch  │ │
│  │   :3000      │     │  (ReplicaSet)│     │   :9200     │ │
│  └──────────────┘     └──────────────┘     └─────────────┘ │
│         │                                        ▲          │
│         │ WebSocket                              │          │
│         ▼                                        │          │
│  ┌──────────────┐                                │          │
│  │ Realtime     │────────────────────────────────┘          │
│  │ Sync         │  (Real-time Message Indexing)             │
│  └──────────────┘                                           │
│                                                             │
│  ┌──────────────┐                                           │
│  │ Search Proxy │◀────── API Requests (Search, Channels)    │
│  │   :3005      │                                           │
│  └──────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API Usage

### Authentication

All APIs require RocketChat authentication tokens:

```bash
# Login to get token
curl -X POST http://localhost:3000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"user": "your-username", "password": "your-password"}'
```

Response:
```json
{
  "status": "success",
  "data": {
    "authToken": "YOUR_AUTH_TOKEN",
    "userId": "YOUR_USER_ID"
  }
}
```

### Global Message Search

Search across the entire workspace (not possible in default RocketChat):

```bash
curl "http://localhost:3005/api/v1/chat.search?searchText=meeting" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### Channel-specific Search

```bash
curl "http://localhost:3005/api/v1/chat.search?roomId=CHANNEL_ID&searchText=project" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### Channel Filtering

Search channels by name pattern:

```bash
curl 'http://localhost:3005/api/v1/channels.list?query={"name":{"$regex":"dev"}}' \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### Health Check

```bash
curl http://localhost:3005/health
```

Response:
```json
{
  "status": "ok",
  "opensearch": "green",
  "opensearch_available": true
}
```

## Service Management

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f rocketchat
docker compose logs -f search-proxy
docker compose logs -f realtime-sync

# Restart a service
docker compose restart search-proxy

# Check service status
docker compose ps

# Re-sync existing messages
docker compose exec realtime-sync node src/bootstrap.js
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ROOT_URL` | http://localhost:3000 | RocketChat external URL |
| `PORT` | 3000 | RocketChat host port |
| `PROXY_PORT` | 3005 | Search Proxy host port |
| `RELEASE` | 7.5.0 | RocketChat version |
| `MONGO_VERSION` | 7.0 | MongoDB version |
| `ADMIN_USER` | admin | Admin username for sync |
| `ADMIN_PASSWORD` | - | Admin password for sync |
| `GITHUB_OWNER` | huiseo | GitHub owner for images |
| `VERSION` | latest | Docker image version |

## Troubleshooting

### OpenSearch Won't Start

```bash
# Check logs
docker compose logs opensearch

# Common fix: increase vm.max_map_count
sudo sysctl -w vm.max_map_count=262144

# Make it persistent
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### OpenSearch Out of Memory

Edit `.env` or `compose.yml` to reduce memory:

```yaml
environment:
  - "OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m"
```

### Real-time Sync Not Working

```bash
# Check logs
docker compose logs realtime-sync

# Verify credentials are set
cat .env | grep ADMIN

# Common errors:
# - "User not found" → Check ADMIN_USER matches your RocketChat username
# - "Unauthorized" → Check ADMIN_PASSWORD is correct

# Restart after fixing
docker compose up -d realtime-sync
```

### No Search Results

```bash
# Check if OpenSearch has data
curl http://localhost:9200/rocketchat_messages/_count

# If count is 0, run bootstrap
docker compose exec realtime-sync node src/bootstrap.js

# Check search proxy health
curl http://localhost:3005/health
```

### RocketChat Won't Start

```bash
# Check logs
docker compose logs rocketchat

# Ensure MongoDB is healthy first
docker compose logs mongodb

# MongoDB must initialize replica set on first run
# Wait 30-60 seconds and try again
```

## Upgrade

```bash
# Pull latest images
docker compose pull

# Restart services
docker compose up -d

# If search seems broken, rebuild index
docker compose exec realtime-sync node src/bootstrap.js
```

## Data Backup

```bash
# Backup MongoDB
docker compose exec mongodb mongodump --archive > backup.archive

# Backup OpenSearch (optional, can be rebuilt)
curl -X PUT "http://localhost:9200/_snapshot/backup" \
  -H "Content-Type: application/json" \
  -d '{"type": "fs", "settings": {"location": "/backup"}}'
```

## Uninstall

```bash
# Stop and remove containers
docker compose down

# Remove all data (WARNING: irreversible)
docker compose down -v
```

## License

MIT License

## Contributing

Issues and Pull Requests are welcome!

- GitHub: https://github.com/huiseo/rocketchat-enhanced
