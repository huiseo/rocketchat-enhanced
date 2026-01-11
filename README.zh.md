# RocketChat Enhanced

> RocketChat + OpenSearch 全文搜索扩展包

在RocketChat官方Docker镜像基础上添加了基于OpenSearch的全文搜索功能的一体化包。

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

## 主要功能

| 功能 | 默认RocketChat | Enhanced |
|------|---------------|----------|
| 全局消息搜索 | 仅限频道内 | 全工作区搜索 |
| 频道过滤 | 不工作 | 支持正则表达式过滤 |
| CJK语言搜索 | 有限 | 完全支持（中文、日文、韩文） |
| 搜索高亮 | 不支持 | 支持 |
| 实时索引 | 不支持 | 支持 |
| MCP协议 | 不支持 | 支持AI工具集成 |

## 系统要求

- **Docker**: 20.10或更高版本
- **Docker Compose**: v2.0或更高版本
- **内存**: 最低4GB（推荐8GB）
- **磁盘**: 最低10GB

## 快速开始

### 方法1：一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/install.sh | bash
```

安装脚本会自动:
- 检查Docker安装
- 提示输入服务器URL
- 下载必要文件
- 启动所有服务

### 方法2：手动安装

```bash
# 1. 下载compose文件
curl -O https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/compose.production.yml
mv compose.production.yml compose.yml

# 2. 创建.env文件
cat > .env << 'EOF'
ROOT_URL=http://your-server:3000
PORT=3000
PROXY_PORT=3005
EOF

# 3. 启动服务
docker compose up -d
```

## 安装后设置

### 步骤1：创建管理员账户

1. 在浏览器中打开`http://localhost:3000`
2. 完成Setup Wizard
3. 创建管理员账户（记住用户名和密码）

### 步骤2：启用实时搜索同步

创建管理员账户后，配置同步服务：

```bash
# 将管理员凭据添加到.env
cat >> .env << 'EOF'
ADMIN_USER=管理员用户名
ADMIN_PASSWORD=管理员密码
EOF

# 重启realtime-sync服务
docker compose up -d realtime-sync
```

### 步骤3：同步现有消息（可选）

如果有需要索引的现有消息：

```bash
docker compose exec realtime-sync node src/bootstrap.js
```

## 架构

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
│  │ Sync         │  (实时消息索引)                            │
│  └──────────────┘                                           │
│                                                             │
│  ┌──────────────┐                                           │
│  │ Search Proxy │◀────── API请求（搜索、频道）               │
│  │   :3005      │                                           │
│  └──────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API使用

### 认证

所有API都需要RocketChat认证令牌：

```bash
# 登录获取令牌
curl -X POST http://localhost:3000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"user": "用户名", "password": "密码"}'
```

响应：
```json
{
  "status": "success",
  "data": {
    "authToken": "YOUR_AUTH_TOKEN",
    "userId": "YOUR_USER_ID"
  }
}
```

### 全局消息搜索

搜索整个工作区（默认RocketChat无法实现）：

```bash
curl "http://localhost:3005/api/v1/chat.search?searchText=会议" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### 频道内搜索

```bash
curl "http://localhost:3005/api/v1/chat.search?roomId=频道ID&searchText=项目" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### 频道过滤

按名称模式搜索频道：

```bash
curl 'http://localhost:3005/api/v1/channels.list?query={"name":{"$regex":"dev"}}' \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### 健康检查

```bash
curl http://localhost:3005/health
```

响应：
```json
{
  "status": "ok",
  "opensearch": "green",
  "opensearch_available": true
}
```

## 服务管理

```bash
# 启动所有服务
docker compose up -d

# 停止所有服务
docker compose down

# 查看日志
docker compose logs -f rocketchat
docker compose logs -f search-proxy
docker compose logs -f realtime-sync

# 重启服务
docker compose restart search-proxy

# 检查服务状态
docker compose ps

# 重新同步现有消息
docker compose exec realtime-sync node src/bootstrap.js
```

## 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `ROOT_URL` | http://localhost:3000 | RocketChat外部URL |
| `PORT` | 3000 | RocketChat主机端口 |
| `PROXY_PORT` | 3005 | Search Proxy主机端口 |
| `RELEASE` | 7.5.0 | RocketChat版本 |
| `MONGO_VERSION` | 7.0 | MongoDB版本 |
| `ADMIN_USER` | admin | 同步用管理员用户名 |
| `ADMIN_PASSWORD` | - | 同步用管理员密码 |
| `GITHUB_OWNER` | huiseo | 镜像的GitHub所有者 |
| `VERSION` | latest | Docker镜像版本 |

## 故障排除

### OpenSearch无法启动

```bash
# 检查日志
docker compose logs opensearch

# 常见解决方法：增加vm.max_map_count
sudo sysctl -w vm.max_map_count=262144

# 永久生效
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### OpenSearch内存不足

在`.env`或`compose.yml`中减少内存：

```yaml
environment:
  - "OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m"
```

### 实时同步不工作

```bash
# 检查日志
docker compose logs realtime-sync

# 验证凭据
cat .env | grep ADMIN

# 常见错误：
# - "User not found" → 检查ADMIN_USER是否与RocketChat用户名匹配
# - "Unauthorized" → 检查ADMIN_PASSWORD是否正确

# 修复后重启
docker compose up -d realtime-sync
```

### 没有搜索结果

```bash
# 检查OpenSearch是否有数据
curl http://localhost:9200/rocketchat_messages/_count

# 如果count为0，运行bootstrap
docker compose exec realtime-sync node src/bootstrap.js

# 检查search proxy状态
curl http://localhost:3005/health
```

### RocketChat无法启动

```bash
# 检查日志
docker compose logs rocketchat

# 首先确保MongoDB正常
docker compose logs mongodb

# MongoDB首次运行需要初始化replica set
# 等待30-60秒后重试
```

## 升级

```bash
# 拉取最新镜像
docker compose pull

# 重启服务
docker compose up -d

# 如果搜索异常，重建索引
docker compose exec realtime-sync node src/bootstrap.js
```

## 数据备份

```bash
# 备份MongoDB
docker compose exec mongodb mongodump --archive > backup.archive

# 备份OpenSearch（可选，可重建）
curl -X PUT "http://localhost:9200/_snapshot/backup" \
  -H "Content-Type: application/json" \
  -d '{"type": "fs", "settings": {"location": "/backup"}}'
```

## 卸载

```bash
# 停止并删除容器
docker compose down

# 删除所有数据（警告：不可恢复）
docker compose down -v
```

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

- GitHub: https://github.com/huiseo/rocketchat-enhanced
