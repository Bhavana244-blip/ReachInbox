import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../db/prisma';

/**
 * Authentication middleware.
 * Checks if the user is authenticated via Passport session OR Bearer token.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }

  // Fallback for browsers blocking cross-domain 3rd party cookies: check Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: token },
        });
        if (user) {
          req.user = user;
          return next();
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to verify Bearer token');
      }
    }
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
