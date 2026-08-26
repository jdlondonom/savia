import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { captcha, twoFactor } from 'better-auth/plugins';
import { sendPasswordResetEmail } from '@/lib/email';
import { isDeployedEnvironment } from '@/lib/environment';

const localBaseUrl = 'http://localhost:3000';

function createAuthInstance(disableSignUp: boolean) {
  const configuredSecret = env.BETTER_AUTH_SECRET?.trim();
  if (isDeployedEnvironment() && (!configuredSecret || configuredSecret.length < 32)) {
    throw new Error('BETTER_AUTH_SECRET de al menos 32 caracteres es obligatorio fuera del entorno local.');
  }
  return betterAuth({
  appName: 'Savia',
  database: env.DB,
  secret: configuredSecret || 'savia-local-development-secret-change-before-public-access',
  baseURL: env.BETTER_AUTH_URL || localBaseUrl,
  trustedOrigins: [env.BETTER_AUTH_URL || localBaseUrl],
  hooks: {
    before: createAuthMiddleware(async (context) => {
      const body = context.body as { password?: unknown; newPassword?: unknown } | undefined;
      const candidate = context.path.endsWith('/reset-password') ? body?.newPassword : body?.password;
      if (candidate !== undefined && !isStrongPassword(candidate)) {
        throw new APIError('BAD_REQUEST', {
          message: 'La contraseña debe tener entre 12 y 128 caracteres, letras, un número y un símbolo.',
        });
      }
    }),
  },
    emailAndPassword: {
      enabled: true,
      disableSignUp,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordResetEmail({ email: user.email, name: user.name, url });
      },
    },
  user: {
    modelName: 'auth_users',
  },
  session: {
    modelName: 'auth_sessions',
    expiresIn: 60 * 60 * 12,
    updateAge: 60 * 60,
  },
  account: {
    modelName: 'auth_accounts',
  },
  verification: {
    modelName: 'auth_verifications',
    storeIdentifier: 'hashed',
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    storage: 'database',
  },
  advanced: {
    cookiePrefix: 'savia',
    ipAddress: {
      ipAddressHeaders: env.SAVIA_ENVIRONMENT === 'local'
        ? ['x-forwarded-for']
        : ['cf-connecting-ip'],
    },
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
    plugins: [
      twoFactor({
        issuer: 'Savia',
        twoFactorTable: 'auth_two_factor',
        skipVerificationOnEnable: false,
        backupCodeOptions: {
          amount: 10,
          length: 10,
        },
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 15 * 60,
        },
      }),
      ...(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        ? [captcha({
          provider: 'cloudflare-turnstile',
          secretKey: env.TURNSTILE_SECRET_KEY,
          endpoints: ['/sign-in/email', '/request-password-reset'],
        })]
        : []),
    ],
  });
}

function isStrongPassword(value: unknown): boolean {
  const password = String(value ?? '');
  return password.length >= 12
    && password.length <= 128
    && /[a-záéíóúñ]/i.test(password)
    && /\d/.test(password)
    && /[^\p{L}\p{N}]/u.test(password);
}

export const auth = createAuthInstance(true);
const provisioningAuth = createAuthInstance(false);

export async function provisionCredentialUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<{ id: string; name: string; email: string }> {
  const result = await provisioningAuth.api.signUpEmail({
    body: {
      name: input.name,
      email: input.email.toLowerCase(),
      password: input.password,
    },
  });

  return {
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
  };
}

export type AuthSession = typeof auth.$Infer.Session;
