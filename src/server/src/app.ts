import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler, AppError } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth.middleware';
import { authRouter } from './routes/auth.routes';
import { planRouter } from './routes/plan.routes';
import { reviewQueueRouter } from './routes/review-queue.routes';

const app = express();

// Apply global middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health Check Route
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// API Routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/plans', authMiddleware, planRouter);
app.use('/api/v1/review-queue', authMiddleware, reviewQueueRouter);

// Catch-all route for non-existent resources
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError('Route not found', 404, 'NOT_FOUND'));
});

// Centralized error handling
app.use(errorHandler);

export { app };
