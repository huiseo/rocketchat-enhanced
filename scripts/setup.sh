#!/bin/bash
#
# RocketChat Enhanced - Setup Script
#
# Run this script after creating a RocketChat admin account.
# It will sync existing messages to OpenSearch.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          RocketChat Enhanced - Setup Wizard              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check .env file
if [ ! -f "$PROJECT_DIR/.env" ]; then
    echo -e "${YELLOW}.env file not found. Copying from .env.example...${NC}"
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
fi

# Load current .env
source "$PROJECT_DIR/.env"

# Check if admin credentials are set
if [ -z "$ROCKETCHAT_ADMIN_PASSWORD" ]; then
    echo ""
    echo -e "${YELLOW}Enter RocketChat admin credentials${NC}"
    echo "   (The admin account you created during RocketChat setup)"
    echo ""

    read -p "Admin username [admin]: " admin_user
    admin_user=${admin_user:-admin}

    read -sp "Admin password: " admin_password
    echo ""

    if [ -z "$admin_password" ]; then
        echo -e "${RED}Password is required${NC}"
        exit 1
    fi

    # Update .env
    sed -i "s/^ROCKETCHAT_ADMIN_USER=.*/ROCKETCHAT_ADMIN_USER=$admin_user/" "$PROJECT_DIR/.env"
    sed -i "s/^ROCKETCHAT_ADMIN_PASSWORD=.*/ROCKETCHAT_ADMIN_PASSWORD=$admin_password/" "$PROJECT_DIR/.env"

    echo -e "${GREEN}Admin credentials saved to .env${NC}"
fi

echo ""
echo -e "${BLUE}Restarting services...${NC}"
cd "$PROJECT_DIR"
docker compose up -d realtime-sync

echo ""
echo -e "${BLUE}Waiting for services to be ready...${NC}"
sleep 10

echo ""
echo -e "${BLUE}Syncing existing messages...${NC}"
docker compose exec -T realtime-sync npm run bootstrap

echo ""
echo -e "${GREEN}"
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete!                       ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  RocketChat:    http://localhost:3000                    ║"
echo "║  Search API:    http://localhost:3005                    ║"
echo "║                                                          ║"
echo "║  New messages will be synced in real-time.               ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
