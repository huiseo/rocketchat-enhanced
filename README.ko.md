# RocketChat Enhanced

> RocketChat + OpenSearch 전문 검색 확장 패키지

공식 RocketChat Docker 이미지에 OpenSearch 기반 전문 검색 기능을 추가하는 올인원 패키지입니다.

[English](README.md) | [日本語](README.ja.md) | [中文](README.zh.md)

## 주요 기능

| 기능 | 기본 RocketChat | Enhanced |
|------|-----------------|----------|
| 전역 메시지 검색 | 채널별 검색만 가능 | 전체 워크스페이스 검색 |
| 채널 필터링 | 미작동 | 정규식 필터 지원 |
| 한중일 언어 검색 | 제한적 | 완벽 지원 |
| 검색 하이라이팅 | 없음 | 지원 |
| 실시간 인덱싱 | 없음 | 지원 |
| MCP 프로토콜 | 없음 | AI 도구 연동 지원 |

## 시스템 요구사항

- **Docker**: 20.10 이상
- **Docker Compose**: v2.0 이상
- **메모리**: 최소 4GB (8GB 권장)
- **디스크**: 최소 10GB

## 빠른 시작

### 방법 1: 원클릭 설치 (권장)

```bash
curl -fsSL https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/install.sh | bash
```

설치 스크립트가 자동으로:
- Docker 설치 확인
- 서버 URL 입력 요청
- 필요한 파일 다운로드
- 모든 서비스 시작

### 방법 2: 수동 설치

```bash
# 1. compose 파일 다운로드
curl -O https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/compose.production.yml
mv compose.production.yml compose.yml

# 2. .env 파일 생성
cat > .env << 'EOF'
ROOT_URL=http://your-server:3000
PORT=3000
PROXY_PORT=3005
EOF

# 3. 서비스 시작
docker compose up -d
```

## 설치 후 설정

### 1단계: 관리자 계정 생성

1. 브라우저에서 `http://localhost:3000` 접속
2. Setup Wizard 완료
3. 관리자 계정 생성 (아이디와 비밀번호 기억)

### 2단계: 실시간 검색 동기화 활성화

관리자 계정 생성 후, 동기화 서비스를 설정합니다:

```bash
# .env에 관리자 인증정보 추가
cat >> .env << 'EOF'
ADMIN_USER=관리자-아이디
ADMIN_PASSWORD=관리자-비밀번호
EOF

# realtime-sync 서비스 재시작
docker compose up -d realtime-sync
```

### 3단계: 기존 메시지 동기화 (선택사항)

인덱싱할 기존 메시지가 있는 경우:

```bash
docker compose exec realtime-sync node src/bootstrap.js
```

## 아키텍처

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
│  │ Sync         │  (실시간 메시지 인덱싱)                    │
│  └──────────────┘                                           │
│                                                             │
│  ┌──────────────┐                                           │
│  │ Search Proxy │◀────── API 요청 (검색, 채널)               │
│  │   :3005      │                                           │
│  └──────────────┘                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## API 사용법

### 인증

모든 API는 RocketChat 인증 토큰이 필요합니다:

```bash
# 로그인하여 토큰 받기
curl -X POST http://localhost:3000/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"user": "사용자명", "password": "비밀번호"}'
```

응답:
```json
{
  "status": "success",
  "data": {
    "authToken": "YOUR_AUTH_TOKEN",
    "userId": "YOUR_USER_ID"
  }
}
```

### 중요: 한글 검색 시 URL 인코딩 필수

한글, 일본어, 중국어 등 비ASCII 문자로 검색할 때는 **반드시 URL 인코딩**을 해야 합니다.

```bash
# 올바른 방법 - --data-urlencode 사용 (권장)
curl -G --data-urlencode "searchText=회의" \
  "http://localhost:3005/api/v1/chat.search" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"

# 잘못된 방법 - URL 인코딩 없음 (검색 실패)
curl "http://localhost:3005/api/v1/chat.search?searchText=회의" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

프로그래밍 언어에서는 쿼리 파라미터 빌더를 사용하세요:

```python
# Python - 올바른 방법
requests.get(url, params={"searchText": "회의"})

# Python - 잘못된 방법
requests.get(f"{url}?searchText=회의")
```

```javascript
// JavaScript - 올바른 방법
fetch(url + '?' + new URLSearchParams({searchText: '회의'}))

// JavaScript - 잘못된 방법
fetch(`${url}?searchText=회의`)
```

### 전역 메시지 검색

전체 워크스페이스에서 검색 (기본 RocketChat에서는 불가능):

```bash
curl -G --data-urlencode "searchText=회의" \
  "http://localhost:3005/api/v1/chat.search" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### 채널별 검색

```bash
curl -G --data-urlencode "searchText=프로젝트" --data-urlencode "roomId=채널ID" \
  "http://localhost:3005/api/v1/chat.search" \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### 채널 필터링

이름 패턴으로 채널 검색:

```bash
curl 'http://localhost:3005/api/v1/channels.list?query={"name":{"$regex":"dev"}}' \
  -H "X-Auth-Token: YOUR_AUTH_TOKEN" \
  -H "X-User-Id: YOUR_USER_ID"
```

### 헬스 체크

```bash
curl http://localhost:3005/health
```

응답:
```json
{
  "status": "ok",
  "opensearch": "green",
  "opensearch_available": true
}
```

## 서비스 관리

```bash
# 모든 서비스 시작
docker compose up -d

# 모든 서비스 중지
docker compose down

# 로그 보기
docker compose logs -f rocketchat
docker compose logs -f search-proxy
docker compose logs -f realtime-sync

# 서비스 재시작
docker compose restart search-proxy

# 서비스 상태 확인
docker compose ps

# 기존 메시지 재동기화
docker compose exec realtime-sync node src/bootstrap.js
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ROOT_URL` | http://localhost:3000 | RocketChat 외부 URL |
| `PORT` | 3000 | RocketChat 호스트 포트 |
| `PROXY_PORT` | 3005 | Search Proxy 호스트 포트 |
| `RELEASE` | 7.5.0 | RocketChat 버전 |
| `MONGO_VERSION` | 7.0 | MongoDB 버전 |
| `ADMIN_USER` | admin | 동기화용 관리자 아이디 |
| `ADMIN_PASSWORD` | - | 동기화용 관리자 비밀번호 |
| `GITHUB_OWNER` | huiseo | 이미지 GitHub 소유자 |
| `VERSION` | latest | Docker 이미지 버전 |

## 문제 해결

### OpenSearch가 시작되지 않음

```bash
# 로그 확인
docker compose logs opensearch

# 일반적인 해결방법: vm.max_map_count 증가
sudo sysctl -w vm.max_map_count=262144

# 영구 적용
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### OpenSearch 메모리 부족

`.env` 또는 `compose.yml`에서 메모리 줄이기:

```yaml
environment:
  - "OPENSEARCH_JAVA_OPTS=-Xms256m -Xmx256m"
```

### 실시간 동기화 작동 안함

```bash
# 로그 확인
docker compose logs realtime-sync

# 인증정보 확인
cat .env | grep ADMIN

# 일반적인 오류:
# - "User not found" → ADMIN_USER가 RocketChat 사용자명과 일치하는지 확인
# - "Unauthorized" → ADMIN_PASSWORD가 올바른지 확인

# 수정 후 재시작
docker compose up -d realtime-sync
```

### 검색 결과 없음

```bash
# OpenSearch에 데이터가 있는지 확인
curl http://localhost:9200/rocketchat_messages/_count

# count가 0이면 bootstrap 실행
docker compose exec realtime-sync node src/bootstrap.js

# search proxy 상태 확인
curl http://localhost:3005/health
```

### RocketChat이 시작되지 않음

```bash
# 로그 확인
docker compose logs rocketchat

# MongoDB가 먼저 정상인지 확인
docker compose logs mongodb

# MongoDB는 첫 실행 시 replica set 초기화 필요
# 30-60초 기다린 후 다시 시도
```

## 업그레이드

```bash
# 최신 이미지 받기
docker compose pull

# 서비스 재시작
docker compose up -d

# 검색이 이상하면 인덱스 재구축
docker compose exec realtime-sync node src/bootstrap.js
```

## 데이터 백업

```bash
# MongoDB 백업
docker compose exec mongodb mongodump --archive > backup.archive

# OpenSearch 백업 (선택사항, 재구축 가능)
curl -X PUT "http://localhost:9200/_snapshot/backup" \
  -H "Content-Type: application/json" \
  -d '{"type": "fs", "settings": {"location": "/backup"}}'
```

## 삭제

```bash
# 컨테이너 중지 및 삭제
docker compose down

# 모든 데이터 삭제 (주의: 복구 불가)
docker compose down -v
```

## 라이선스

MIT License

## 기여하기

이슈와 Pull Request를 환영합니다!

- GitHub: https://github.com/huiseo/rocketchat-enhanced
