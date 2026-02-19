/**
 * Copyright (c) 2024-2026 FieldLedger. All Rights Reserved.
 *
 * Socket.IO Tenant Isolation — Integration Smoke Test
 *
 * Verifies that the join:job handler in server.js correctly prevents
 * cross-tenant real-time data leaks. Uses MongoMemoryServer (via setup.js)
 * and real Socket.IO connections over localhost.
 *
 * Test matrix:
 *   1. UserA (CompanyA) joins CompanyA's job  → ALLOWED
 *   2. UserB (CompanyB) joins CompanyA's job  → DENIED (JOB_ACCESS_DENIED)
 *   3. Emit to job room                      → only UserA receives it
 *   4. Invalid / missing jobId               → DENIED (INVALID_JOB_ID)
 *   5. Non-existent jobId                    → DENIED (JOB_ACCESS_DENIED)
 */

const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const ioClient = require('socket.io-client');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const Job = require('../models/Job');

const JWT_SECRET = process.env.JWT_SECRET;

// ── Helpers ──────────────────────────────────────────────────────────────

function mintToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, name: user.name },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

function connectSocket(port, token) {
  return ioClient(`http://127.0.0.1:${port}`, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
}

function waitForEvent(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitForNoEvent(socket, event, quietMs = 800) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, quietMs);
    const handler = (data) => {
      clearTimeout(timer);
      reject(new Error(`Unexpected "${event}" received: ${JSON.stringify(data)}`));
    };
    socket.on(event, handler);
  });
}

// ── Server factory ───────────────────────────────────────────────────────
// Replicates the EXACT auth middleware + connection handler from server.js
// so the test exercises the real mongoose query path.

function createTestSocketServer() {
  const httpServer = http.createServer();
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
  });

  // Auth middleware — identical to server.js lines 384-396
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId)
        .select('_id name email role companyId')
        .lean();
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      socket.userId = user._id.toString();
      socket.companyId = user.companyId?.toString();
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Connection handler — identical to server.js lines 398-433
  io.on('connection', (socket) => {
    const { userId, companyId, user } = socket;
    socket.join(`user:${userId}`);
    if (companyId) socket.join(`company:${companyId}`);

    socket.on('join:job', async (jobId) => {
      if (!jobId || !mongoose.Types.ObjectId.isValid(jobId)) {
        return socket.emit('error', {
          code: 'INVALID_JOB_ID',
          message: 'Invalid job ID',
        });
      }

      if (!companyId) {
        return socket.emit('error', {
          code: 'NO_COMPANY',
          message: 'Company context required',
        });
      }

      try {
        const job = await Job.findOne({ _id: jobId, companyId })
          .select('_id')
          .lean();
        if (!job) {
          return socket.emit('error', {
            code: 'JOB_ACCESS_DENIED',
            message: 'Access denied',
          });
        }
        socket.join(`job:${jobId}`);
      } catch {
        socket.emit('error', {
          code: 'JOIN_ERROR',
          message: 'Failed to join job room',
        });
      }
    });

    socket.on('leave:job', (jobId) => socket.leave(`job:${jobId}`));
    socket.emit('connected', { userId, userName: user.name });
  });

  return { httpServer, io };
}

// ── Test suite ───────────────────────────────────────────────────────────

describe('Socket.IO tenant isolation (join:job)', () => {
  let httpServer, io, port;
  let companyA, companyB;
  let userA, userB;
  let tokenA, tokenB;
  let jobA;

  // Server stays up for the entire suite
  beforeAll(async () => {
    ({ httpServer, io } = createTestSocketServer());
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    port = httpServer.address().port;
  });

  afterAll(async () => {
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  // Fixtures are recreated before each test because setup.js's afterEach
  // wipes all collections between tests.
  beforeEach(async () => {
    companyA = await Company.create({ name: 'Alvah Electric', slug: `alvah-${Date.now()}` });
    companyB = await Company.create({ name: 'RivalCorp', slug: `rival-${Date.now()}` });

    userA = await User.create({
      email: 'foremana@alvah.test',
      password: 'TestPass1234',
      name: 'Foreman A',
      role: 'foreman',
      companyId: companyA._id,
    });
    userB = await User.create({
      email: 'foremanb@rival.test',
      password: 'TestPass1234',
      name: 'Foreman B',
      role: 'foreman',
      companyId: companyB._id,
    });

    jobA = await Job.create({
      title: 'PM 46001122 – Pole Replacement',
      pmNumber: '46001122',
      status: 'in_progress',
      companyId: companyA._id,
    });

    tokenA = mintToken(userA);
    tokenB = mintToken(userB);
  });

  // ─────────────────────────────────────────────────────────────────────

  test('UserA (CompanyA) can join CompanyA\'s job room', async () => {
    const socket = connectSocket(port, tokenA);
    try {
      await waitForEvent(socket, 'connected');
      socket.emit('join:job', jobA._id.toString());
      await waitForNoEvent(socket, 'error');
    } finally {
      socket.disconnect();
    }
  });

  // ─────────────────────────────────────────────────────────────────────

  test('UserB (CompanyB) is DENIED when joining CompanyA\'s job', async () => {
    const socket = connectSocket(port, tokenB);
    try {
      await waitForEvent(socket, 'connected');
      socket.emit('join:job', jobA._id.toString());

      const err = await waitForEvent(socket, 'error');
      expect(err.code).toBe('JOB_ACCESS_DENIED');
      expect(err.message).toBe('Access denied');
    } finally {
      socket.disconnect();
    }
  });

  // ─────────────────────────────────────────────────────────────────────

  test('only UserA receives broadcasts to the job room', async () => {
    const socketA = connectSocket(port, tokenA);
    const socketB = connectSocket(port, tokenB);

    try {
      await Promise.all([
        waitForEvent(socketA, 'connected'),
        waitForEvent(socketB, 'connected'),
      ]);

      // UserA joins the job (allowed)
      socketA.emit('join:job', jobA._id.toString());
      await waitForNoEvent(socketA, 'error', 300);

      // UserB tries to join the same job (denied)
      socketB.emit('join:job', jobA._id.toString());
      await waitForEvent(socketB, 'error');

      // Server emits an update to the job room
      io.to(`job:${jobA._id.toString()}`).emit('job:update', {
        status: 'pending_gf_review',
      });

      // UserA receives it
      const update = await waitForEvent(socketA, 'job:update');
      expect(update.status).toBe('pending_gf_review');

      // UserB does NOT receive it
      await waitForNoEvent(socketB, 'job:update', 500);
    } finally {
      socketA.disconnect();
      socketB.disconnect();
    }
  });

  // ─────────────────────────────────────────────────────────────────────

  test('invalid jobId is rejected with INVALID_JOB_ID', async () => {
    const socket = connectSocket(port, tokenA);
    try {
      await waitForEvent(socket, 'connected');
      socket.emit('join:job', 'not-a-valid-objectid');

      const err = await waitForEvent(socket, 'error');
      expect(err.code).toBe('INVALID_JOB_ID');
    } finally {
      socket.disconnect();
    }
  });

  // ─────────────────────────────────────────────────────────────────────

  test('empty jobId is rejected with INVALID_JOB_ID', async () => {
    const socket = connectSocket(port, tokenA);
    try {
      await waitForEvent(socket, 'connected');
      socket.emit('join:job', '');

      const err = await waitForEvent(socket, 'error');
      expect(err.code).toBe('INVALID_JOB_ID');
    } finally {
      socket.disconnect();
    }
  });

  // ─────────────────────────────────────────────────────────────────────

  test('non-existent jobId (valid ObjectId format) is rejected', async () => {
    const socket = connectSocket(port, tokenA);
    try {
      await waitForEvent(socket, 'connected');
      const fakeId = new mongoose.Types.ObjectId().toString();
      socket.emit('join:job', fakeId);

      const err = await waitForEvent(socket, 'error');
      expect(err.code).toBe('JOB_ACCESS_DENIED');
    } finally {
      socket.disconnect();
    }
  });
});
