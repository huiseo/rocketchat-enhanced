# RocketChat Enhanced

> RocketChat + OpenSearch 全文検索拡張パッケージ

RocketChat公式Dockerイメージに、OpenSearchベースの全文検索機能を追加したオールインワンパッケージです。

[English](README.md) | [한국어](README.ko.md) | [中文](README.zh.md)

## 主な機能

| 機能 | 標準RocketChat | Enhanced |
|------|---------------|----------|
| グローバルメッセージ検索 | チャンネル単位のみ | ワークスペース全体検索 |
| チャンネルフィルタリング | 動作しない | 正規表現フィルタ対応 |
| CJK言語検索 | 限定的 | 完全対応（日本語、韓国語、中国語） |
| 検索ハイライト | 非対応 | 対応 |
| リアルタイムインデックス | 非対応 | 対応 |
| MCPプロトコル | 非対応 | AIツール連携対応 |

## システム要件

- **Docker**: 20.10以上
- **Docker Compose**: v2.0以上
- **メモリ**: 最低4GB（8GB推奨）
- **ディスク**: 最低10GB

## クイックスタート

### 方法1: ワンクリックインストール（推奨）

```bash
curl -fsSL https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/install.sh | bash
```

インストールスクリプトが自動的に:
- Dockerのインストール確認
- サーバーURLの入力要求
- 必要なファイルのダウンロード
- 全サービスの起動

### 方法2: 手動インストール

```bash
# 1. composeファイルをダウンロード
curl -O https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/compose.production.yml
mv compose.production.yml compose.yml

# 2. .envファイルを作成
cat > .env << 'EOF'
ROOT_URL=http://your-server:3000
PORT=3000
PROXY_PORT=3005
EOF

# 3. サービスを起動
docker compose up -d
```

## インストール後の設定

### ステップ1: 管理者アカウントの作成

1. ブラウザで`http://localhost:3000`にアクセス
2. Setup Wizardを完了
3. 管理者アカウントを作成（ユーザー名とパスワードを記録）

### ステップ2: リアルタイム検索同期の有効化

管理者アカウント作成後、同期サービスを設定します:

```bash
# .envに管理者認証情報を追加
cat >> .env << 'EOF'
ADMIN_USER=管理者ユーザー名
ADMIN_PASSWORD=管理者パスワード
EOF

# realtime-syncサービスを再起動
docker compose up -d realtime-sync
```

### ステップ3: 既存メッセージの同期（オプション）

インデックスする既存メッセージがある場合:

```bash
docker compose exec realtime-sync node src/bootstrap.js
```

## アーキテクチャ

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
│  │ Sync         │  (リアルタイムメッセージインデックス)      │
│  └──────────────┘                                           │
│                                                             │
│  ┌──────────────┐                                           │
│  │ Search Proxy │◀────── APIリクエスト（検索、チャンネル）   │
│  │   :3005      │                                           │
│  └──────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API使用方法

### 認証

すべてのAPIはRocketChat認証トークンが必要です:

```bash
# ログインしてトークンを取得
curl -X POST http://localhost:3000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"user": "ユーザー名", "password": "パスワード"}'
```

レスポンス:
```json
{
  "status": "success",
  "data": {
    "authToken": "YOUR_AUTH_TOKEN",
    "userId": "YOUR_USER_ID"
  }
}
```

### グローバルメッセージ検索

ワークスペース全体を検索（標準RocketChatでは不可能）:

```bash
curl "http://localhost:3005/api/v1/chat.search?searchText=会議" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### チャンネル別検索

```bash
curl "http://localhost:3005/api/v1/chat.search?roomId=チャンネルID&searchText=プロジェクト" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### チャンネルフィルタリング

名前パターンでチャンネルを検索:

```bash
curl 'http://localhost:3005/api/v1/channels.list?query={"name":{"$regex":"dev"}}' \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### ヘルスチェック

```bash
curl http://localhost:3005/health
```

レスポンス:
```json
{
  "status": "ok",
  "opensearch": "green",
  "opensearch_available": true
}
```

## サービス管理

```bash
# 全サービス起動
docker compose up -d

# 全サービス停止
docker compose down

# ログ表示
docker compose logs -f rocketchat
docker compose logs -f search-proxy
docker compose logs -f realtime-sync

# サービス再起動
docker compose restart search-proxy

# サービス状態確認
docker compose ps

# 既存メッセージの再同期
docker compose exec realtime-sync node src/bootstrap.js
```

## 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `ROOT_URL` | http://localhost:3000 | RocketChat外部URL |
| `PORT` | 3000 | RocketChatホストポート |
| `PROXY_PORT` | 3005 | Search Proxyホストポート |
| `RELEASE` | 7.5.0 | RocketChatバージョン |
| `MONGO_VERSION` | 7.0 | MongoDBバージョン |
| `ADMIN_USER` | admin | 同期用管理者ユーザー名 |
| `ADMIN_PASSWORD` | - | 同期用管理者パスワード |
| `GITHUB_OWNER` | huiseo | イメージのGitHub所有者 |
| `VERSION` | latest | Dockerイメージバージョン |

## トラブルシューティング

### OpenSearchが起動しない

```bash
# ログを確認
docker compose logs opensearch

# 一般的な解決方法: vm.max_map_countを増加
sudo sysctl -w vm.max_map_count=262144

# 永続化
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### OpenSearchメモリ不足

`.env`または`compose.yml`でメモリを削減:

```yaml
environment:
  - "OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m"
```

### リアルタイム同期が動作しない

```bash
# ログを確認
docker compose logs realtime-sync

# 認証情報を確認
cat .env | grep ADMIN

# 一般的なエラー:
# - "User not found" → ADMIN_USERがRocketChatユーザー名と一致するか確認
# - "Unauthorized" → ADMIN_PASSWORDが正しいか確認

# 修正後に再起動
docker compose up -d realtime-sync
```

### 検索結果がない

```bash
# OpenSearchにデータがあるか確認
curl http://localhost:9200/rocketchat_messages/_count

# countが0の場合、bootstrapを実行
docker compose exec realtime-sync node src/bootstrap.js

# search proxy状態を確認
curl http://localhost:3005/health
```

### RocketChatが起動しない

```bash
# ログを確認
docker compose logs rocketchat

# MongoDBが正常かまず確認
docker compose logs mongodb

# MongoDBは初回起動時にreplica setの初期化が必要
# 30-60秒待ってから再試行
```

## アップグレード

```bash
# 最新イメージを取得
docker compose pull

# サービスを再起動
docker compose up -d

# 検索がおかしい場合、インデックスを再構築
docker compose exec realtime-sync node src/bootstrap.js
```

## データバックアップ

```bash
# MongoDBバックアップ
docker compose exec mongodb mongodump --archive > backup.archive

# OpenSearchバックアップ（オプション、再構築可能）
curl -X PUT "http://localhost:9200/_snapshot/backup" \
  -H "Content-Type: application/json" \
  -d '{"type": "fs", "settings": {"location": "/backup"}}'
```

## アンインストール

```bash
# コンテナを停止・削除
docker compose down

# 全データを削除（警告: 復元不可）
docker compose down -v
```

## ライセンス

MIT License

## コントリビューション

IssueとPull Requestを歓迎します！

- GitHub: https://github.com/huiseo/rocketchat-enhanced
