
const express = require("express");
const http = require("http");

const app = express();
const PORT = 3000;

// Daftar backend
const servers = [
  { host: "localhost", port: 3001, name: "Food Server 1", weight: 1, healthy: true, activeConnections: 0 },
  { host: "localhost", port: 3002, name: "Food Server 2", weight: 1, healthy: true, activeConnections: 0 },
  { host: "localhost", port: 3003, name: "Food Server 3", weight: 1, healthy: true, activeConnections: 0 }
];

let currentIndex = 0;
let weightedPosition = 0;
const ALGORITHM = (process.env.LB_ALGORITHM || "round-robin").toLowerCase();

app.get("/servers", (req, res) => {
  res.json({
    algorithm: ALGORITHM,
    servers: servers.map((server) => ({
      name: server.name,
      host: server.host,
      port: server.port,
      weight: server.weight,
      healthy: server.healthy,
      activeConnections: server.activeConnections
    }))
  });
});

app.post("/servers/register", express.json(), (req, res) => {
  const port = Number(req.body.port);
  const host = String(req.body.host || "localhost");
  const name = String(req.body.name || `Food Server ${port}`);
  const weight = Number(req.body.weight) > 0 ? Number(req.body.weight) : 1;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(400).json({ message: "Port tidak valid" });
  }

  let server = servers.find(
    (item) => item.host === host && item.port === port
  );

  if (!server) {
    server = {
      host,
      port,
      name,
      weight,
      healthy: false,
      activeConnections: 0
    };
    servers.push(server);
  } else {
    server.name = name;
    server.weight = weight;
  }

  checkHealth(server);

  res.status(201).json({
    message: "Backend didaftarkan",
    server: {
      name: server.name,
      host: server.host,
      port: server.port,
      weight: server.weight,
      healthy: server.healthy
    }
  });
});

app.delete("/servers/:port", (req, res) => {
  const port = Number(req.params.port);
  const index = servers.findIndex((server) => server.port === port);

  if (index === -1) {
    return res.status(404).json({ message: "Backend tidak ditemukan" });
  }

  const [removed] = servers.splice(index, 1);
  res.json({
    message: "Backend dicabut",
    server: removed.name,
    port: removed.port
  });
});

// Backend sehat saja yang boleh dipilih untuk menerima request.
function healthyServers() {
  return servers.filter((server) => server.healthy);
}

function getRoundRobinServer(candidates) {
  if (candidates.length === 0) return null;

  const server = candidates[currentIndex % candidates.length];
  currentIndex = (currentIndex + 1) % candidates.length;
  return server;
}

function getRandomServer(candidates) {
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function getLeastConnectionsServer(candidates) {
  if (candidates.length === 0) return null;
  // Memilih backend dengan request aktif paling sedikit, bukan mengukur CPU atau antrean.
  return candidates.reduce((best, server) =>
    server.activeConnections < best.activeConnections ? server : best
  );
}

function getWeightedRoundRobinServer(candidates) {
  if (candidates.length === 0) return null;

  const weightedServers = candidates.flatMap((server) =>
    Array(Math.max(1, server.weight)).fill(server)
  );
  const server = weightedServers[weightedPosition % weightedServers.length];
  weightedPosition = (weightedPosition + 1) % weightedServers.length;
  return server;
}

function getNextServer() {
  const candidates = healthyServers();

  if (ALGORITHM === "random") return getRandomServer(candidates);
  // Algoritma ini hanya aktif jika LB_ALGORITHM=least-connections.
  if (ALGORITHM === "least-connections") return getLeastConnectionsServer(candidates);
  if (ALGORITHM === "weighted-round-robin") return getWeightedRoundRobinServer(candidates);
  // Default-nya round-robin: bergiliran, tidak mempertimbangkan tingkat kesibukan.
  return getRoundRobinServer(candidates);
}

// GET /health: status 2xx berarti sehat; timeout atau error berarti tidak sehat.
function checkHealth(server) {
  const request = http.get(
    {
      hostname: server.host,
      port: server.port,
      path: "/health",
      timeout: 1500
    },
    (response) => {
      server.healthy = response.statusCode >= 200 && response.statusCode < 300;
      response.resume();
    }
  );

  request.on("timeout", () => request.destroy());
  request.on("error", () => {
    server.healthy = false;
  });
}

// Periksa sekarang, lalu ulangi setiap 5 detik untuk memperbarui status backend.
checkHealthLoop();
setInterval(checkHealthLoop, 5000);

function checkHealthLoop() {
  servers.forEach(checkHealth);
}

function forwardRequest(req, res, candidates, attempt = 0) {
  if (candidates.length === 0 || attempt >= servers.length) {
    if (!res.headersSent) {
      return res.status(503).json({
        message: "Tidak ada backend yang aktif",
        algorithm: ALGORITHM
      });
    }
    return res.destroy();
  }

  const target = getNextServer();
  if (!target) {
    return forwardRequest(req, res, [], attempt);
  }

  // Dipakai oleh least-connections untuk menghitung request yang sedang berjalan.
  target.activeConnections++;
  console.log(
    `[${ALGORITHM}] ${req.method} ${req.url} -> ${target.name}:${target.port}`
  );

  const proxyReq = http.request(
    {
      hostname: target.host,
      port: target.port,
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${target.host}:${target.port}`
      },
      timeout: 5000
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("timeout", () => {
    proxyReq.destroy(new Error("Backend timeout"));
  });

  proxyReq.on("error", (error) => {
    if (res.headersSent) {
      return res.destroy();
    }

    // Jika koneksi ke backend gagal, tandai tidak sehat dan coba backend sehat lain.
    // Backend yang hanya sibuk tetapi tetap merespons tidak otomatis dialihkan.
    target.healthy = false;
    target.activeConnections = Math.max(0, target.activeConnections - 1);
    console.error(`[Error] ${target.name}: ${error.message}`);

    forwardRequest(req, res, healthyServers(), attempt + 1);
  });

  proxyReq.on("close", () => {
    target.activeConnections = Math.max(0, target.activeConnections - 1);
  });

  if (req.bodyBuffer.length > 0) {
    proxyReq.write(req.bodyBuffer);
  }
  proxyReq.end();
}

// Meneruskan request ke backend menggunakan algoritma yang dipilih
app.use((req, res) => {
  const chunks = [];

  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    req.bodyBuffer = Buffer.concat(chunks);
    forwardRequest(req, res, healthyServers());
  });
});

app.listen(PORT, () => {
  console.log(`Load Balancer berjalan di port ${PORT}`);
});
