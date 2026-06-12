import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as admin from 'firebase-admin';

/**
 * Loads Firebase Admin from env (optional). If unset, FCM is disabled and the app still boots.
 *
 * Precedence (first match wins):
 * - **FIREBASE_SERVICE_ACCOUNT_BASE64** — base64 of the service account JSON (recommended for Render).
 * - **FIREBASE_SERVICE_ACCOUNT_JSON** — raw JSON string (escape carefully in `.env`).
 * - **FIREBASE_SERVICE_ACCOUNT_PATH** — path to the JSON file (relative to `process.cwd()` or absolute), e.g. `./rentpilot-…-firebase-adminsdk-….json`.
 * - **GOOGLE_APPLICATION_CREDENTIALS** — path to a JSON key file (Google’s standard env; `initializeApp()` uses ADC).
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private app: admin.app.App | null = null;

  onModuleInit(): void {
    if (admin.apps.length > 0) {
      this.app = admin.app();
      this.logger.log('Firebase Admin reusing existing default app.');
      return;
    }

    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
    const jsonRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    const pathRaw = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();

    try {
      if (b64) {
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        const cred = JSON.parse(decoded) as admin.ServiceAccount;
        this.app = admin.initializeApp({ credential: admin.credential.cert(cred) });
        this.logger.log('Firebase Admin initialized (FIREBASE_SERVICE_ACCOUNT_BASE64).');
        return;
      }
      if (jsonRaw) {
        const cred = JSON.parse(jsonRaw) as admin.ServiceAccount;
        this.app = admin.initializeApp({ credential: admin.credential.cert(cred) });
        this.logger.log('Firebase Admin initialized (FIREBASE_SERVICE_ACCOUNT_JSON).');
        return;
      }
      if (pathRaw) {
        const abs = resolve(process.cwd(), pathRaw);
        if (!existsSync(abs)) {
          this.logger.error(
            `FIREBASE_SERVICE_ACCOUNT_PATH file not found: ${abs} (cwd=${process.cwd()})`,
          );
          return;
        }
        const cred = JSON.parse(readFileSync(abs, 'utf8')) as admin.ServiceAccount;
        this.app = admin.initializeApp({ credential: admin.credential.cert(cred) });
        this.logger.log('Firebase Admin initialized (FIREBASE_SERVICE_ACCOUNT_PATH).');
        return;
      }
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
        this.app = admin.initializeApp();
        this.logger.log(
          'Firebase Admin initialized (application default / GOOGLE_APPLICATION_CREDENTIALS).',
        );
        return;
      }
    } catch (e) {
      this.logger.error(
        `Firebase Admin failed to initialize: ${e instanceof Error ? e.message : String(e)}`,
      );
      return;
    }

    this.logger.warn(
      'Firebase Admin not configured — FCM disabled. Set FIREBASE_SERVICE_ACCOUNT_BASE64, FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or GOOGLE_APPLICATION_CREDENTIALS.',
    );
  }

  isConfigured(): boolean {
    return this.app !== null;
  }

  getMessaging(): admin.messaging.Messaging | null {
    if (!this.app) {
      return null;
    }
    return admin.messaging(this.app);
  }
}
