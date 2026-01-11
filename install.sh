#!/bin/bash
#
# RocketChat Enhanced - Quick Installation Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/install.sh | bash
#
# Or:
#   wget -qO- https://raw.githubusercontent.com/huiseo/rocketchat-enhanced/main/install.sh | bash
#

set -e

# Configuration
GITHUB_REPO="huiseo/rocketchat-enhanced"
GITHUB_BRANCH="main"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Banner
echo -e "${CYAN}"
cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██████╗  ██████╗  ██████╗██╗  ██╗███████╗████████╗         ║
║   ██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝██╔════╝╚══██╔══╝         ║
║   ██████╔╝██║   ██║██║     █████╔╝ █████╗     ██║            ║
║   ██╔══██╗██║   ██║██║     ██╔═██╗ ██╔══╝     ██║            ║
║   ██║  ██║╚██████╔╝╚██████╗██║  ██╗███████╗   ██║            ║
║   ╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝            ║
║                                                               ║
║              ███████╗███╗   ██╗██╗  ██╗                       ║
║              ██╔════╝████╗  ██║██║  ██║                       ║
║              █████╗  ██╔██╗ ██║███████║                       ║
║              ██╔══╝  ██║╚██╗██║██╔══██║                       ║
║              ███████╗██║ ╚████║██║  ██║                       ║
║              ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝                       ║
║                                                               ║
║                 Enhanced with OpenSearch                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# Check Docker
echo -e "${BLUE}[1/5]${NC} Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed.${NC}"
    echo ""
    echo "Install Docker:"
    echo "  curl -fsSL https://get.docker.com | sh"
    echo "  sudo usermod -aG docker \$USER"
    echo "  # Log out and log back in"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}Docker $(docker --version | cut -d' ' -f3)${NC}"
echo -e "${GREEN}Docker Compose $(docker compose version --short)${NC}"

# Get server URL
echo ""
echo -e "${BLUE}[2/5]${NC} Server Configuration"
echo ""

# Auto-detect IP
DEFAULT_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
DEFAULT_URL="http://${DEFAULT_IP}:3000"

echo -e "Enter server URL."
echo -e "Example: http://192.168.1.100:3000 or https://chat.example.com"
echo ""
read -p "URL [${DEFAULT_URL}]: " ROOT_URL
ROOT_URL=${ROOT_URL:-$DEFAULT_URL}

# Create directory
echo ""
echo -e "${BLUE}[3/5]${NC} Creating installation directory..."

INSTALL_DIR="${HOME}/rocketchat-enhanced"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo -e "${GREEN}Installation path: ${INSTALL_DIR}${NC}"

# Download compose file
echo ""
echo -e "${BLUE}[4/5]${NC} Downloading configuration files..."

COMPOSE_URL="https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/compose.production.yml"

if command -v curl &> /dev/null; then
    curl -fsSL "$COMPOSE_URL" -o compose.yml
elif command -v wget &> /dev/null; then
    wget -q "$COMPOSE_URL" -O compose.yml
else
    echo -e "${RED}curl or wget is required.${NC}"
    exit 1
fi

# Create .env file
cat > .env << ENV_EOF
# RocketChat Enhanced Configuration
ROOT_URL=${ROOT_URL}
PORT=3000
PROXY_PORT=3005

# GitHub Container Registry Owner
GITHUB_OWNER=huiseo

# Versions
RELEASE=7.5.0
MONGO_VERSION=7.0
VERSION=latest

# Admin credentials (fill after setup)
ADMIN_USER=admin
ADMIN_PASSWORD=
ENV_EOF

echo -e "${GREEN}compose.yml downloaded${NC}"
echo -e "${GREEN}.env created${NC}"

# Start services
echo ""
echo -e "${BLUE}[5/5]${NC} Starting services... (First run may take 5-10 minutes)"
echo ""

docker compose up -d

# Wait for RocketChat
echo ""
echo -e "${YELLOW}Waiting for RocketChat to start...${NC}"

MAX_WAIT=180
WAIT=0
while [ $WAIT -lt $MAX_WAIT ]; do
    if curl -sf "${ROOT_URL}/api/info" > /dev/null 2>&1; then
        break
    fi
    echo -n "."
    sleep 5
    WAIT=$((WAIT + 5))
done
echo ""

if [ $WAIT -ge $MAX_WAIT ]; then
    echo -e "${YELLOW}RocketChat is still starting. Please check again shortly.${NC}"
else
    echo -e "${GREEN}RocketChat started successfully!${NC}"
fi

# Done
echo ""
echo -e "${GREEN}"
cat << EOF
╔═══════════════════════════════════════════════════════════════╗
║                  Installation Complete!                       ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Next steps:                                                  ║
║                                                               ║
║  1. Open in browser:                                          ║
║     ${ROOT_URL}
║                                                               ║
║  2. Create admin account                                      ║
║                                                               ║
║  3. Enable search sync (optional):                            ║
║     cd ${INSTALL_DIR}
║     nano .env  # Enter ADMIN_PASSWORD                         ║
║     docker compose restart realtime-sync                      ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║  Useful commands:                                             ║
║    docker compose ps        # Check status                    ║
║    docker compose logs -f   # View logs                       ║
║    docker compose down      # Stop services                   ║
╚═══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"
