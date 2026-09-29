import { Router } from 'express';
import passport from 'passport';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../db/prisma';

const router = Router();

// GET /auth/google - Initiate Google OAuth
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
  }),
);

// GET /auth/google/callback - Handle Google OAuth callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${config.frontend.url}/login?error=auth_failed`,
  }),
  (_req, res) => {
    // Successful authentication
    res.redirect(`${config.frontend.url}/dashboard`);
  },
);

// GET /auth/me - Get current authenticated user
router.get('/me', requireAuth, (req, res) => {
  const user = req.user as any;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  });
});

// POST /auth/logout - Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: 'Session destruction failed' });
        return;
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  });
});

// POST /auth/dev-login - Development / demo user login
router.post('/dev-login', async (req, res) => {
  try {
    const email = req.body?.email || 'demo@reachinbox.ai';
    const name = req.body?.name || 'ReachInbox Demo User';

    let user = await prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: `demo-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          email,
          name,
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
        },
      });
    }

    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Dev login session failed' });
      }
      return res.json({
        message: 'Logged in successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Dev login error', message: err.message });
  }
});

export default router;
