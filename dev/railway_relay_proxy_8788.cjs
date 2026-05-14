const dns = require('dns');
const http = require('http');
const https = require('https');

const target = 'https://bank-api-production-51cb.up.railway.app';
const port = 8788;
const targetUrl = new URL(target);

const resolver = new dns.Resolver();
resolver.setServers(['1.1.1.1', '8.8.8.8']);

function resolveHost(hostname) {
  return new Promise((resolve, reject) => {
    resolver.resolve4(hostname, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        resolve({ address: addresses[0], family: 4 });
        return;
      }

      resolver.resolve6(hostname, (err6, addresses6) => {
        if (!err6 && addresses6 && addresses6.length > 0) {
          resolve({ address: addresses6[0], family: 6 });
          return;
        }

        reject(err || err6 || new Error(`DNS lookup failed for ${hostname}`));
      });
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', target);
    const headers = { ...req.headers };
    delete headers.host;

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body =
            ['GET', 'HEAD'].includes(req.method || 'GET')
                ? undefined
                : Buffer.concat(chunks);

        const resolved = await resolveHost(targetUrl.hostname);
        headers.host = targetUrl.hostname;

        const requestOptions = {
          protocol: targetUrl.protocol,
          hostname: resolved.address,
          port: targetUrl.port || 443,
          path: `${url.pathname}${url.search}`,
          method: req.method,
          headers,
          servername: targetUrl.hostname,
          family: resolved.family,
        };

        const upstream = https.request(requestOptions, (upstreamRes) => {
          const responseHeaders = { ...upstreamRes.headers };
          delete responseHeaders['content-encoding'];
          delete responseHeaders['transfer-encoding'];

          res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
          upstreamRes.pipe(res);
        });

        upstream.on('error', (requestErr) => {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(
              JSON.stringify({
                error: 'Proxy upstream error',
                message: String(requestErr),
              }),
          );
        });

        if (body && body.length > 0) {
          upstream.write(body);
        }

        upstream.end();
      } catch (err) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(
            JSON.stringify({
              error: 'Proxy upstream error',
              message: String(err),
            }),
        );
      }
    });
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: String(err) }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ZeroNetPay relay proxy listening on http://127.0.0.1:${port}`);
});
