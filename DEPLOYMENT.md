# ZeroNetBank Production Deployment Guide

## 🚀 Pre-Deployment Checklist

### Infrastructure

- [ ] PostgreSQL 13+ server (SSL enabled)
- [ ] Redis 6+ instance (with password)
- [ ] Node.js 18+ runtime
- [ ] Load balancer (optional, for HA)
- [ ] CDN for static assets (optional)

### Security

- [ ] HTTPS/TLS certificate
- [ ] WAF (Web Application Firewall)
- [ ] DDoS protection
- [ ] HSM for key storage (recommended)
- [ ] VPN access to database
- [ ] IP whitelisting configured

### Monitoring

- [ ] Logging service (e.g., ELK, Datadog)
- [ ] Alerting system (e.g., PagerDuty)
- [ ] APM (e.g., New Relic, Datadog)
- [ ] Database monitoring
- [ ] Health checks configured

### Compliance

- [ ] PCI-DSS compliance review
- [ ] AML/KYC policies documented
- [ ] Terms of service reviewed
- [ ] Privacy policy reviewed
- [ ] Incident response plan

## 🔐 Generate Bank Keys

**CRITICAL: Do this offline if possible**

```bash
# On secure machine
npm run generate-bank-keys

# Output will include:
# - Private key: ./secrets/bank-private-key.pem
# - Public key: ./secrets/bank-public-key.pem
# - Fingerprint for verification

# Store private key in HSM or secure vault
# Distribute public key to all client devices
```

## 🗄️ Set Up PostgreSQL

### Create Database

```sql
CREATE DATABASE zeronettbank;
CREATE USER zeronettbank WITH PASSWORD 'strong-random-password';

GRANT ALL PRIVILEGES ON DATABASE zeronettbank TO zeronettbank;

-- Enable required extensions
\c zeronettbank
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "inet";

-- Run migrations
npm run migrate
```

### Backup Configuration

```bash
# Daily automated backup
0 2 * * * /usr/local/bin/pg_dump zeronettbank | \
  gzip > /backup/zeronettbank-$(date +%Y%m%d).sql.gz

# Test restore weekly
0 3 * * 0 /usr/local/bin/pg_restore /backup/latest.sql.gz --test --username zeronettbank
```

### Performance Tuning

```ini
# postgresql.conf
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
```

## 🔴 Set Up Redis

### Configuration

```bash
# redis.conf
port 6379
bind 127.0.0.1
requirepass your-strong-password
maxmemory 1gb
maxmemory-policy allkeys-lru
```

### Access Control

```bash
# Only allow internal IPs
ACL LIST
ACL SETUSER default on >strong-password
ACL SETUSER app on >app-password ~* &* +@all
```

## 🚢 Docker Deployment

### Build Image

```dockerfile
FROM node:18-alpine

# Install security tools
RUN apk add --no-cache dumb-init openssl

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source and build
COPY src ./src
COPY tsconfig.json ./
RUN npm run build

# Remove source (build artifacts only)
RUN rm -rf src

# Create non-root user
RUN addgroup -S zeronettbank && adduser -S -G zeronettbank zeronettbank
USER zeronettbank

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

Build and push:

```bash
docker build -t registry.example.com/zeronettbank:1.0.0 .
docker push registry.example.com/zeronettbank:1.0.0
```

### Docker Compose (for development)

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: zeronettbank
      POSTGRES_USER: zeronettbank
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U zeronettbank"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  zeronettbank:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      REDIS_HOST: redis
      JWT_SECRET: ${JWT_SECRET}
      BANK_PRIVATE_KEY_PATH: /run/secrets/bank_private_key
      BANK_PUBLIC_KEY_PATH: /run/secrets/bank_public_key
    secrets:
      - bank_private_key
      - bank_public_key
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  postgres_data:

secrets:
  bank_private_key:
    file: ./secrets/bank-private-key.pem
  bank_public_key:
    file: ./secrets/bank-public-key.pem
```

## ☸️ Kubernetes Deployment

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: zeronettbank-config
data:
  NODE_ENV: production
  LOG_LEVEL: info
  DB_HOST: postgres.default.svc.cluster.local
  REDIS_HOST: redis.default.svc.cluster.local
  RATE_LIMIT_MAX_REQUESTS: "1000"
```

### Secret

```bash
kubectl create secret generic zeronettbank-secrets \
  --from-file=bank-private-key=./secrets/bank-private-key.pem \
  --from-file=bank-public-key=./secrets/bank-public-key.pem \
  --from-literal=DB_PASSWORD=xxx \
  --from-literal=JWT_SECRET=xxx
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zeronettbank
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: zeronettbank
  template:
    metadata:
      labels:
        app: zeronettbank
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: zeronettbank
        image: registry.example.com/zeronettbank:1.0.0
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 3000
          name: http
        envFrom:
        - configMapRef:
            name: zeronettbank-config
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: zeronettbank-secrets
              key: DB_PASSWORD
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: zeronettbank-secrets
              key: JWT_SECRET
        volumeMounts:
        - name: keys
          mountPath: /app/secrets
          readOnly: true
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 1Gi
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          capabilities:
            drop:
              - ALL
      volumes:
      - name: keys
        secret:
          secretName: zeronettbank-secrets
          items:
          - key: bank-private-key
            path: bank-private-key.pem
          - key: bank-public-key
            path: bank-public-key.pem
---
apiVersion: v1
kind: Service
metadata:
  name: zeronettbank
spec:
  selector:
    app: zeronettbank
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

## 📊 Monitoring Integration

### Prometheus Metrics

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'zeronettbank'
    static_configs:
      - targets: ['zeronettbank:3000']
    metrics_path: '/metrics'
```

### ELK Stack

```yaml
# filebeat.yml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /var/log/zeronettbank/*.log
output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

## 🔄 SSL/TLS Setup

### Let's Encrypt Certificate

```bash
# Using certbot
sudo certbot certonly --standalone -d zeronettbank.example.com

# List certificates
sudo certbot certificates

# Auto-renewal (cron)
0 3 * * * /usr/bin/certbot renew --quiet
```

### Nginx Reverse Proxy

```nginx
server {
  listen 80;
  server_name zeronettbank.example.com;
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name zeronettbank.example.com;

  ssl_certificate /etc/letsencrypt/live/zeronettbank.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/zeronettbank.example.com/privkey.pem;
  
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # Rate limiting
  limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
  location /api {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://localhost:3000;
  }
}
```

## ✅ Post-Deployment

### Verification

```bash
# Health check
curl https://zeronettbank.example.com/health

# Get bank public key
curl https://zeronettbank.example.com/api/v1/bank/public-key

# Verify database
psql -U zeronettbank -d zeronettbank -c "SELECT COUNT(*) FROM bank_ledger;"

# Verify Redis
redis-cli -a $REDIS_PASSWORD ping
```

### Seed Initial Data

```bash
npm run seed

# Follow prompts to create:
# - SUPER_ADMIN user
# - FINANCE_ADMIN user
# - AUDITOR user
```

### Test Wallet Sync

```bash
# From wallet client
POST /api/v1/wallet/sync
{
  "walletPublicKey": "02a1b2c3...",
  "lastLedgerHash": "genesis",
  "syncNonce": "uuid...",
  "requestSignature": "sig..."
}
```

## 📈 Scaling Considerations

### Horizontal Scaling

- Stateless API servers (scale to N replicas)
- Use PostgreSQL replication (leader-follower)
- Use Redis Cluster for cache
- Load balance with sticky sessions (if needed)

### Performance Optimization

- Enable HTTP/2
- Use connection pooling (PgBouncer)
- Cache bank public key in CDN
- Compress responses (gzip)
- Monitor slow queries

### High Availability

- Multi-AZ deployment
- Database failover (automated)
- Health checks on all components
- Read replicas for audit queries

## 🆘 Incident Response

### Database Unavailable

1. Check PostgreSQL status
2. Verify network connectivity
3. Check database logs
4. Failover to replica if available
5. Alert on-call engineer

### Key Compromise

1. Activate kill switch
2. Generate new bank key
3. Notify all wallet users
4. Update public key
5. Revoke old signatures

### Ledger Corruption

1. Stop all writes (freeze wallets)
2. Run integrity check
3. Restore from backup
4. Rebuild with verification
5. Notify users

## 📞 Support

- On-call: PagerDuty integration
- Escalation: security@zeronettbank.com
- Status: status.zeronettbank.example.com

---

**Last Updated**: December 2024
**Document Version**: 1.0
