#!/bin/bash
# ZeroNetBank Backend Setup Script
# Automates key generation, database setup, and initial seeding

set -e

echo "════════════════════════════════════════════════════════"
echo "  ZeroNetBank Backend Setup"
echo "════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check Node.js
echo -e "${BLUE}[1/5]${NC} Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js${NC} $NODE_VERSION installed"
echo ""

# Check PostgreSQL
echo -e "${BLUE}[2/5]${NC} Checking PostgreSQL installation..."
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL not found. Please install PostgreSQL 13+${NC}"
    exit 1
fi
PG_VERSION=$(psql --version)
echo -e "${GREEN}✅ PostgreSQL${NC} $PG_VERSION installed"
echo ""

# Check Redis
echo -e "${BLUE}[3/5]${NC} Checking Redis installation..."
if ! command -v redis-cli &> /dev/null; then
    echo -e "${YELLOW}⚠️ Redis not found (optional but recommended)${NC}"
else
    REDIS_VERSION=$(redis-cli --version)
    echo -e "${GREEN}✅ Redis${NC} $REDIS_VERSION installed"
fi
echo ""

# Install dependencies
echo -e "${BLUE}[4/5]${NC} Installing NPM dependencies..."
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Environment setup
echo -e "${BLUE}[5/5]${NC} Configuring environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ Created${NC} .env file (update with your settings)"
    
    # Prompt for critical values
    echo ""
    echo -e "${YELLOW}Please review and update these critical settings in .env:${NC}"
    echo "  - DATABASE_URL: PostgreSQL connection"
    echo "  - REDIS_URL: Redis connection (optional)"
    echo "  - JWT_SECRET: Random secret for tokens"
    echo "  - PORT: Server port (default: 3000)"
else
    echo -e "${GREEN}✅ .env${NC} already configured"
fi
echo ""

# Generate keys
echo -e "${BLUE}Generating ECDSA P-256 keys...${NC}"
npm run generate-bank-keys
echo -e "${GREEN}✅ Keys generated in${NC} ./secrets/"
echo ""

# Initialize database
echo -e "${BLUE}Creating database schema...${NC}"
npm run migrate
echo -e "${GREEN}✅ Database initialized${NC}"
echo ""

# Seed initial data
echo -e "${BLUE}Creating initial admin users...${NC}"
npm run seed
echo -e "${GREEN}✅ Admin users created${NC}"
echo ""

echo "════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo ""
echo "1. Start the development server:"
echo -e "   ${YELLOW}npm run dev${NC}"
echo ""
echo "2. Verify the server is running:"
echo -e "   ${YELLOW}curl http://localhost:3000/health${NC}"
echo ""
echo "3. Test wallet sync (use a wallet's public key):"
echo -e "   ${YELLOW}curl -X POST http://localhost:3000/api/v1/wallet/sync \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{...wallet request...}'${NC}"
echo ""
echo "4. View generated bank public key:"
echo -e "   ${YELLOW}cat ./secrets/bank-public-key.pem${NC}"
echo ""
echo "5. For admin operations, log in with:"
echo -e "   SUPER_ADMIN created during seed process"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  - README.md - Architecture overview"
echo "  - THREAT_MODEL.md - Security analysis"
echo "  - DEPLOYMENT.md - Production guide"
echo ""
