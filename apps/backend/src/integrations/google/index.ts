import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../../config';
import { prisma } from '../../db/prisma';
import { logger } from '../../utils/logger';

export function configureGoogleAuth(): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value || '';
          const name = profile.displayName || '';
          const avatarUrl = profile.photos?.[0]?.value || '';

          // Upsert user
          const user = await prisma.user.upsert({
            where: { googleId },
            update: {
              name,
              email,
              avatarUrl,
            },
            create: {
              googleId,
              name,
              email,
              avatarUrl,
            },
          });

          logger.info({ userId: user.id, email }, 'User authenticated via Google');
          done(null, user);
        } catch (err) {
          logger.error({ err }, 'Google auth error');
          done(err as Error, undefined);
        }
      },
    ),
  );

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          googleId: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      });
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
}
