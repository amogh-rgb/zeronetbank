# ZeroNetBank v2

Clean rebuild of ZeroNetBank with proper TypeScript setup.

## Setup Instructions

### 1. Initialize Git Repository
```bash
cd e:\zeronetbank-v2
git init
git add .
git commit -m "Initial commit - clean setup"
```

### 2. Create GitHub Repository
- Go to https://github.com/new
- Create repository named `zeronetbank-v2`
- Do NOT initialize with README (we already have one)

### 3. Push to GitHub
```bash
git remote add origin https://github.com/amogh-rgb/zeronetbank-v2.git
git branch -M main
git push -u origin main
```

### 4. Install Dependencies (Local)
```bash
npm install
npx prisma generate
npm run build
```

### 5. Deploy to Render
- Go to https://dashboard.render.com
- Click "New +" → "Web Service"
- Connect your GitHub repo `zeronetbank-v2`
- Render will auto-detect `render.yaml` settings
- Click "Create Web Service"

## Project Structure
```
zeronetbank-v2/
├── src/
│   ├── index.ts          # Main server
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── middleware/       # Express middleware
│   └── utils/            # Utilities
├── prisma/
│   └── schema.prisma     # Database schema
├── public/               # Static files
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── render.yaml           # Render deployment config
└── .gitignore            # Git ignore rules
```

## API Endpoints

- `GET /health` - Health check
- `GET /api` - API info

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection (auto-set by Render)
- `PORT` - Server port (default: 10000)
- `NODE_ENV` - Environment (production/development)
