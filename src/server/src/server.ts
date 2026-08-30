/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { app } from './app';
import { startStaleJobCleanupJob } from './jobs/stale-job-cleanup.job';

const PORT = process.env.PORT || 3001;

// #438: a bind failure (most commonly EADDRINUSE from another worktree's server already holding
// the port) used to be silent — the process kept running, looking alive, while every request
// actually landed on whatever else is holding the port (measured: a session ran a ~40-minute LIVE
// test against another worktree's backend/database this way, undetected).
//
// ⚠️ Passing a callback to `app.listen(PORT, cb)` does NOT fix this on its own, even with a
// separate `server.on('error', ...)` beside it: Express's own `app.listen` (lib/application.js)
// wraps that callback with `once()` and ALSO attaches it as an `error` listener —
// `server.once('error', done)` — so on EADDRINUSE, Express itself calls `cb` (with the error as
// its unused first argument), printing "Server is running" from the success branch anyway.
// Measured on this repo's Express 5.2.1: an occupied-port run with a `.listen(PORT, cb)` callback
// prints "Server is running" 3/3 times even with `server.on('error', ...)` attached separately.
// Not passing a callback to `.listen()` — attaching `listening`/`error` directly on the returned
// server instead — sidesteps that wrapping entirely: 2/2 occupied-port runs then log ONLY the
// error, and a free-port run logs ONLY the success line.
const server = app.listen(PORT);

server.on('listening', () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Cổng ${PORT} đã bị chiếm — server KHÔNG khởi động được. Đổi PORT trong .env.`);
  } else {
    console.error('Không khởi động được server:', err);
  }
  process.exit(1);
});

startStaleJobCleanupJob();

// Centralized handler for uncaught promise rejections
process.on('unhandledRejection', (err: unknown) => {
  console.error('UNHANDLED REJECTION! Shutting down gracefully...');
  if (err instanceof Error) {
    console.error(err.name, err.message, err.stack);
  } else {
    console.error(err);
  }
  server.close(() => {
    process.exit(1);
  });
});

// Centralized handler for uncaught runtime exceptions
process.on('uncaughtException', (err: Error) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down gracefully...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});
