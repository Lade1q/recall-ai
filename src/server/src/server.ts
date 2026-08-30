/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { app } from './app';
import { startStaleJobCleanupJob } from './jobs/stale-job-cleanup.job';

const PORT = process.env.PORT || 3001;

// #438: a bind failure (most commonly EADDRINUSE from another worktree's server already holding
// the port) used to be reported as SUCCESS. Measured on `main`: the process prints "Server is
// running" *and exits with code 0* — it does not stay up. The HTTP server never reaches
// `listening` so it holds no handle, and `startStaleJobCleanupJob`'s interval is `unref()`ed, so
// the event loop drains and Node exits cleanly. Both signals a caller could check therefore lie:
// a human reading the log sees success, and a supervisor reading the exit code sees success too.
// (A session lost ~40 minutes of LIVE measurement to this, running against another worktree's
// backend and database without noticing.)
//
// ⚠️ Adding `server.on('error', ...)` while KEEPING the `app.listen(PORT, cb)` callback does fix
// the exit code (1) and does kill the process — but it does NOT stop the false success line.
// Express's own `app.listen` (lib/application.js:598-606) wraps that callback with `once()` and
// ALSO attaches it as an error listener — `server.once('error', done)` — so on EADDRINUSE Express
// itself calls `cb` (with the error as its unused first argument) and the success branch prints
// anyway. Measured on this repo's Express 5.2.1: 3/3 occupied-port runs still print it.
//
// That log line is worth fixing precisely because nothing but a human reads it — a repo-wide grep
// finds no script, CI step or readiness probe consuming it, so nothing else can catch the lie.
// Not passing a callback to `.listen()` — attaching `listening`/`error` on the returned server
// instead — sidesteps the wrapping entirely: 2/2 occupied-port runs then log ONLY the error, and
// a free-port run logs ONLY the success line.
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
