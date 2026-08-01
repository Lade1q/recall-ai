/* eslint-disable no-console */
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { app } from './app';
import { startStaleJobCleanupJob } from './jobs/stale-job-cleanup.job';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
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
