import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Authentication middleware.
 * Checks if the user is authenticated via Passport session.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  res.status(401).json({
    error: 'Unauthorized',
    message: 'You must be logged in to access this resource',
  });
}

/**
 * Centralized error handler middleware.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error(
    {
      err: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path,
    },
    'Unhandled error',
  );

  // Don't leak error details in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'An unexpected error occurred',
  });
}
