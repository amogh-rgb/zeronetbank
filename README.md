# ZeroNetPay Fintech System

Secure, scalable, production-ready Admin Dashboard + Client Wallet System with real-time database synchronization.

## 🚀 Features

- **MongoDB Atlas** cloud database with atomic transactions
- **Socket.IO** real-time synchronization
- **JWT** authentication with role-based access control
- **Admin Dashboard** with fund management and user controls
- **Client Dashboard** with real-time balance updates
- **Production-ready** security and monitoring
- **Atomic operations** for financial transactions

## 📁 Folder Structure

```
zeronetpay-fintech/
├── src/
│   ├── controllers/
│   │   ├── AdminController.ts      # Admin API endpoints
│   │   ├── AuthController.ts       # Authentication logic
│   │   └── ClientController.ts     # Client API endpoints
│   ├── middleware/
│   │   └── auth.ts                 # JWT authentication middleware
│   ├── models/
│   │   ├── User.ts                 # User MongoDB model
│   │   ├── Transaction.ts          # Transaction MongoDB model
│   │   └── AdminLog.ts             # Admin activity log model
│   ├── routes/
│   │   ├── admin.ts                # Admin API routes
│   │   ├── auth.ts                 # Authentication routes
│   │   └── client.ts               # Client API routes
│   ├── server.ts                   # Main server with Socket.IO
│   └── types.ts                    # TypeScript type definitions
├── public/
│   ├── admin-dashboard.html        # Admin dashboard UI
│   ├── client-dashboard.html       # Client dashboard UI
│   └── index.html                  # Landing page
├── dist/                           # Compiled JavaScript
├── logs/                           # Application logs
├── tests/                          # Test files
├── .env.example                    # Environment configuration
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript configuration
├── eslint.config.js               # Linting rules
├── README.md                       # This file
└── Dockerfile                      # Docker configuration
```

## 🛠️ Installation & Setup

### Prerequisites

- Node.js 18+
- MongoDB Atlas account
- npm or yarn

### 1. Clone and Install

```bash
git clone <repository-url>
cd zeronetpay-fintech
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Production Settings
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/zeronetpay
JWT_SECRET=your-super-secure-jwt-secret-key
CLIENT_URL=https://yourdomain.com
```

### 3. Database Setup

Create MongoDB Atlas cluster and collections:

```javascript
// MongoDB Collections (auto-created)
db.users
db.transactions
db.adminlogs
```

### 4. Build and Run

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Production with PM2
npm install -g pm2
pm2 start dist/server.js --name zeronetpay
```

## 🔐 Security Features

### Authentication & Authorization
- JWT tokens with expiration
- Role-based access control (admin/user)
- Password hashing with bcrypt (12 rounds)
- Token refresh mechanism

### API Security
- Rate limiting (100 requests/15min)
- Input validation with express-validator
- CORS configuration
- Helmet security headers
- Request logging

### Database Security
- MongoDB Atlas encryption
- IP whitelisting
- Connection pooling
- Transaction atomicity

## 📡 API Endpoints

### Authentication
```http
POST /api/auth/login          # User/Admin login
POST /api/auth/register       # User registration
POST /api/auth/change-password # Change password
POST /api/auth/verify         # Verify token
```

### Admin APIs (JWT + Admin Role Required)
```http
GET  /api/admin/dashboard     # Dashboard statistics
GET  /api/admin/users         # List all users
GET  /api/admin/user/:walletId # User details + transactions
POST /api/admin/add-funds     # Add money to user account
POST /api/admin/remove-funds  # Remove money from user account
GET  /api/admin/logs          # Admin activity logs
```

### Client APIs (JWT + User Role Required)
```http
GET  /api/user/profile        # User profile
GET  /api/user/balance        # Current balance
GET  /api/user/transactions   # Transaction history
GET  /api/user/transaction-stats # Transaction statistics
```

## 🔄 Real-time Events (Socket.IO)

### Client Events
```javascript
socket.emit('join', walletId); // Join wallet room
```

### Server Events
```javascript
// Balance updates
socket.emit('balanceUpdated', {
  walletId,
  newBalance,
  change,
  type: 'credit|debit',
  reason
});

// New transactions
socket.emit('newTransaction', {
  transactionId,
  walletId,
  amount,
  type: 'credit|debit',
  status: 'success|pending|failed'
});

// Transaction sync
socket.emit('transactionSynced', {
  transactionId,
  status: 'success'
});

// Admin actions
socket.emit('adminAction', {
  action: 'add-funds|remove-funds',
  targetWallet,
  amount
});
```

## 🗄️ Database Schema

### Users Collection
```javascript
{
  userId: "uuid",
  name: "John Doe",
  email: "john@example.com",
  passwordHash: "bcrypt_hash",
  walletId: "WLT_1234567890",
  balance: 1000.50,
  role: "admin|user",
  createdAt: ISODate,
  updatedAt: ISODate
}
```

### Transactions Collection
```javascript
{
  transactionId: "txn_1234567890",
  senderWallet: "WLT_1234567890",
  receiverWallet: "WLT_0987654321",
  amount: 100.00,
  type: "credit|debit",
  mode: "online|offline",
  status: "pending|success|failed",
  digitalSignature: "signature_hash",
  syncedAt: ISODate,
  createdAt: ISODate
}
```

### AdminLogs Collection
```javascript
{
  adminId: "uuid",
  actionType: "credit|debit|view|search",
  targetWallet: "WLT_1234567890",
  amount: 100.00,
  description: "Admin credit",
  ipAddress: "192.168.1.1",
  userAgent: "Chrome/91.0",
  createdAt: ISODate
}
```

## 🚀 Deployment Guide

### 1. MongoDB Atlas Setup

1. Create MongoDB Atlas cluster
2. Create database user with read/write permissions
3. Whitelist IP addresses (or 0.0.0.0/0 for testing)
4. Get connection string

### 2. Environment Setup

```bash
# Production environment
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/zeronetpay
JWT_SECRET=$(openssl rand -base64 32)
CLIENT_URL=https://yourdomain.com
```

### 3. SSL/HTTPS Setup

```nginx
# Nginx configuration
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Process Management (PM2)

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/server.js --name zeronetpay

# Save PM2 configuration
pm2 save
pm2 startup

# Monitor application
pm2 monit
pm2 logs zeronetpay
```

### 5. Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 5000
CMD ["npm", "start"]
```

```bash
docker build -t zeronetpay .
docker run -p 5000:5000 --env-file .env zeronetpay
```

## 📊 Monitoring & Logging

### Winston Logging

```javascript
// Logs are stored in:
logs/error.log      # Error logs
logs/combined.log   # All logs
```

### Health Check

```http
GET /health
```

Response:
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 12345.67
}
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Integration tests
npm run test:integration
```

## 🔧 Development Scripts

```bash
npm run dev          # Development server with hot reload
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run format       # Format code with Prettier
npm run test         # Run tests
npm run docs         # Generate API documentation
```

## 🚨 Security Checklist

- [ ] Change JWT_SECRET to strong random key
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure MongoDB Atlas IP whitelist
- [ ] Set up rate limiting rules
- [ ] Enable database backups
- [ ] Configure monitoring alerts
- [ ] Set up log rotation
- [ ] Enable CORS for specific domains
- [ ] Configure firewall rules
- [ ] Set up intrusion detection
- [ ] Regular security audits

## 📈 Performance Optimization

### Database Indexing
```javascript
// Auto-created indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ walletId: 1 }, { unique: true });
db.transactions.createIndex({ senderWallet: 1, createdAt: -1 });
db.transactions.createIndex({ receiverWallet: 1, createdAt: -1 });
```

### Caching Strategy
- Redis for session storage (future)
- CDN for static assets
- Database query result caching

### Scaling Considerations
- Horizontal scaling with load balancer
- Database read replicas
- Microservices architecture (future)

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- Documentation: [docs/](./docs/)
- Issues: [GitHub Issues](https://github.com/your-repo/issues)
- Email: support@zeronetpay.com

---

**ZeroNetPay** - Secure Digital Banking for the Future 🚀
