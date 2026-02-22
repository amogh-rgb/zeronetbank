# 🌐 Global Bank Access - Cloudflare Tunnel Setup

## Problem
Currently, the bank server is only accessible at `http://10.202.142.229:3000` which is a local IP address. Users need to manually type this URL and it only works when connected to the same network.

## Solution: Cloudflare Tunnel (FREE)
Cloudflare Tunnel provides a secure way to expose your local server to the internet without:
- ❌ Opening ports on your router
- ❌ Static IP requirements
- ❌ Complex DNS configuration
- ❌ SSL certificate management

## Setup Instructions

### 1. Install Cloudflare Tunnel
```bash
# Windows (PowerShell as Administrator)
winget install Cloudflare.Cloudflared

# Or download from: https://github.com/cloudflare/cloudflared/releases/latest
```

### 2. Login to Cloudflare
```bash
cloudflared tunnel login
```
This will open a browser window to login to your Cloudflare account (free).

### 3. Create a Tunnel
```bash
cloudflared tunnel create zeronetpay-bank
```

### 4. Create Configuration File
Create `cloudflare-tunnel.yml` in your bank directory:

```yaml
tunnel: zeronetpay-bank
credentials-file: C:\Users\YOUR_USERNAME\.cloudflared\zeronetpay-bank.json

ingress:
  - hostname: zeronetpay-bank.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

### 5. Setup DNS (Free)
```bash
cloudflared tunnel route dns zeronetpay-bank zeronetpay-bank.yourdomain.com
```

### 6. Start the Tunnel
```bash
cloudflared tunnel run zeronetpay-bank
```

### 7. Update Your App Configuration
Update `lib/core/config/app_config.dart`:

```dart
class AppConfig {
  // Use your Cloudflare Tunnel URL
  static const String baseUrl = "https://zeronetpay-bank.yourdomain.com";
  
  static const int connectTimeout = 10000;
  static const int receiveTimeout = 10000;
}
```

## Alternative: Use Cloudflare Workers (FREE)

If you don't want to run a tunnel continuously, you can use Cloudflare Workers:

### 1. Create a Worker Script
```javascript
// worker.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Proxy requests to your local server
    if (url.pathname.startsWith('/api/')) {
      const localUrl = `http://10.202.142.229:3000${url.pathname}${url.search}`;
      
      try {
        const response = await fetch(localUrl, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });
        
        return response;
      } catch (error) {
        return new Response('Bank server unavailable', { status: 503 });
      }
    }
    
    return new Response('ZeroNetPay Bank API', { status: 200 });
  }
}
```

### 2. Deploy Worker
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login
wrangler login

# Deploy
wrangler deploy worker.js
```

## Alternative: Free Hosting Services

### 1. Railway.app (Free Tier)
- Deploy your Node.js app directly
- Gets a public URL automatically
- Free tier: 500 hours/month

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

### 2. Render.com (Free Tier)
- Free web service hosting
- Auto-deploys from GitHub
- Free tier: 750 hours/month

### 3. Vercel (Serverless)
- Convert to serverless functions
- Free tier: 100GB bandwidth/month

## Network Configuration for Flutter App

### Dynamic Server Detection
Create `lib/core/services/dynamic_server_service.dart`:

```dart
import 'package:dio/dio.dart';

class DynamicServerService {
  static final List<String> _possibleServers = [
    'https://zeronetpay-bank.yourdomain.com', // Cloudflare Tunnel
    'https://zeronetpay.railway.app',         // Railway
    'https://zeronetpay.onrender.com',        // Render
    'http://10.202.142.229:3000',            // Local network
  ];

  static Future<String> findWorkingServer() async {
    final dio = Dio();
    dio.options.timeout = Duration(seconds: 5);

    for (final server in _possibleServers) {
      try {
        final response = await dio.get('$server/health');
        if (response.statusCode == 200) {
          return server;
        }
      } catch (e) {
        continue; // Try next server
      }
    }
    
    throw Exception('No working server found');
  }
}
```

### Update App Initialization
In your app initialization:

```dart
// main.dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  try {
    final serverUrl = await DynamicServerService.findWorkingServer();
    await ApiConfigService.instance.setBaseUrl(serverUrl);
    print('Connected to bank server: $serverUrl');
  } catch (e) {
    print('Failed to connect to bank server: $e');
    // Show server selection UI
  }
  
  runApp(MyApp());
}
```

## Security Considerations

### 1. Environment Variables
Create `.env` file in bank directory:

```env
# Cloudflare Tunnel (optional)
CLOUDFLARE_TUNNEL_TOKEN=your_token_here

# Email Service
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Security
JWT_SECRET=your_jwt_secret_here
CORS_ORIGIN=https://yourappdomain.com
```

### 2. Rate Limiting
The intelligent rate limiting middleware already handles this.

### 3. HTTPS Enforcement
Cloudflare Tunnel automatically provides HTTPS.

## Testing the Setup

### 1. Local Testing
```bash
# Start bank server
npm run dev

# Start tunnel in another terminal
cloudflared tunnel run zeronetpay-bank

# Test with curl
curl https://zeronetpay-bank.yourdomain.com/health
```

### 2. Mobile App Testing
Update your app config and test:
- ✅ Works on mobile data (not just WiFi)
- ✅ Works from any location globally
- ✅ Automatic server detection
- ✅ Fallback to local server when available

## Cost Breakdown (All FREE Options)

| Service | Cost | Limitations |
|---------|------|-------------|
| Cloudflare Tunnel | $0 | Unlimited bandwidth |
| Railway.app | $0 | 500 hours/month |
| Render.com | $0 | 750 hours/month |
| Cloudflare Workers | $0 | 100GB bandwidth/month |
| Ethereal Email | $0 | Testing only |

## Recommendation

**Use Cloudflare Tunnel** because:
- ✅ Completely free
- ✅ Unlimited bandwidth
- ✌ No deployment complexity
- ✌ Works with existing server
- ✌ Automatic HTTPS
- ✌ Global CDN

## Quick Start Commands

```bash
# 1. Install cloudflared
winget install Cloudflare.Cloudflared

# 2. Login
cloudflared tunnel login

# 3. Create tunnel
cloudflared tunnel create zeronetpay-bank

# 4. Create config file (copy from above)
# 5. Setup DNS
cloudflared tunnel route dns zeronetpay-bank zeronetpay-bank.yourdomain.com

# 6. Run tunnel
cloudflared tunnel run zeronetpay-bank

# 7. Update app config with your new URL
```

That's it! Your bank server is now globally accessible for FREE! 🎉
