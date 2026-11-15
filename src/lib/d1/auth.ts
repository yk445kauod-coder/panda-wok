/**
 * The `supabase.auth` subset the app uses, implemented over D1.
 *
 * Eleven call sites reach into `supabase.auth`, and they are the reason the D1
 * backend could not be switched on before: the data shim spoke `.from()` and
 * `.rpc()` but had no auth, so a `DATA_BACKEND=d1` deploy would have signed
 * nobody in. This module closes that gap by providing the same method names and
 * return shapes, so those call sites run unchanged.
 *
 * Two tables carry the account, mirroring what Supabase Auth held:
 * `auth_users` (id, email, encrypted_password, metadata, confirmation) and
 * `auth_identities` (the provider row). `profiles` is the app's own table and is
 * **not** written by a trigger here — Supabase had `handle_new_user` for that,
 * and D1 has no such trigger, so the caller creates the profile explicitly. That
 * is deliberate: the signup flow already reads the profile back and repairs it,
 * so an explicit insert makes the previously-implicit step visible and testable.
 *
 * Sessions are stateless signed cookies (see `d1-session.ts`), so sign-in mints
 * one and sign-out clears it. There is no refresh token to rotate.
 */

import "server-only";

import { cookies } from "next/headers";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  readSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/d1-session";
import { getD1Database } from "@/lib/d1/database";
import { newUuid } from "@/lib/d1/coerce";

export type D1AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  email_confirmed_at: string | null;
  created_at: string;
  user_metadata: Record<string, unknown>;
};

export type D1AuthResult<T> = { data: T; error: { message: string; code?: string } | null };

type AuthUserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  encrypted_password: string | null;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  raw_user_meta_data: string | null;
  created_at: string;
};

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toUser(row: AuthUserRow): D1AuthUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    email_confirmed_at: row.email_confirmed_at,
    created_at: row.created_at,
    user_metadata: parseMetadata(row.raw_user_meta_data),
  };
}

/** Reads the caller's session cookie into a user id, or null. */
async function sessionUserId(): Promise<string | null> {
  const store = await cookies();
  const claims = await readSessionToken(store.get(SESSION_COOKIE)?.value);
  return claims?.sub ?? null;
}

async function findUserById(id: string): Promise<AuthUserRow | null> {
  return getD1Database()
    .prepare(
      `SELECT "id", "email", "phone", "encrypted_password", "email_confirmed_at",
              "phone_confirmed_at", "raw_user_meta_data", "created_at"
         FROM "auth_users" WHERE "id" = ?1 LIMIT 1`,
    )
    .bind(id)
    .first<AuthUserRow>();
}

async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  return getD1Database()
    .prepare(
      `SELECT "id", "email", "phone", "encrypted_password", "email_confirmed_at",
              "phone_confirmed_at", "raw_user_meta_data", "created_at"
         FROM "auth_users" WHERE "email" = ?1 LIMIT 1`,
    )
    .bind(email.trim().toLowerCase())
    .first<AuthUserRow>();
}

/**
 * Creates the account and its provider identity, then returns the row.
 *
 * The two inserts are not in one transaction because D1's batch cannot return
 * the generated id mid-batch; the id is therefore minted first and both rows are
 * written with it, so a failure between them leaves a user with no identity
 * rather than an identity pointing at nothing. `auth_identities` is only ever
 * read through its user, so that ordering fails safe.
 */
async function insertUser(params: {
  email: string;
  password: string;
  phone: string | null;
  metadata: Record<string, unknown>;
  emailConfirmed: boolean;
}): Promise<D1AuthResult<D1AuthUser>> {
  const db = getD1Database();
  const id = newUuid();
  const now = new Date().toISOString();
  const email = params.email.trim().toLowerCase();

  const existing = await findUserByEmail(email);
  if (existing) {
    return { data: null as unknown as D1AuthUser, error: { message: "User already registered", code: "user_already_exists" } };
  }

  const encrypted = await hashPassword(params.password);
  try {
    await db
      .prepare(
        `INSERT INTO "auth_users"
           ("id", "email", "encrypted_password", "phone", "email_confirmed_at",
            "raw_app_meta_data", "raw_user_meta_data", "created_at", "updated_at")
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
      )
      .bind(
        id,
        email,
        encrypted,
        params.phone,
        params.emailConfirmed ? now : null,
        JSON.stringify({ provider: "email", providers: ["email"] }),
        JSON.stringify(params.metadata),
        now,
      )
      .run();

    await db
      .prepare(
        `INSERT INTO "auth_identities"
           ("id", "user_id", "provider", "provider_id", "identity_data", "created_at")
         VALUES (?1, ?2, 'email', ?3, ?4, ?5)`,
      )
      .bind(newUuid(), id, id, JSON.stringify({ email }), now)
      .run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "signup failed";
    return { data: null as unknown as D1AuthUser, error: { message, code: "signup_failed" } };
  }

  const row = await findUserById(id);
  if (!row) {
    return { data: null as unknown as D1AuthUser, error: { message: "user insert did not persist" } };
  }
  return { data: toUser(row), error: null };
}

/** Mints the session cookie for a user id. */
async function startSession(userId: string): Promise<boolean> {
  const token = await createSessionToken(userId);
  if (!token) return false;
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions());
  return true;
}

export class D1AuthClient {
  /**
   * Signs in by email + password. Returns the same `{ data, error }` shape as
   * `supabase.auth.signInWithPassword`, including the neutral message the caller
   * turns into its "check your email or password" copy — this never reveals
   * whether the address exists.
   */
  async signInWithPassword(params: { email: string; password: string }): Promise<
    D1AuthResult<{ user: D1AuthUser | null; session: { user: D1AuthUser } | null }>
  > {
    const row = await findUserByEmail(params.email);
    const ok = row ? await verifyPassword(params.password, row.encrypted_password) : false;
    if (!row || !ok) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials", code: "invalid_credentials" },
      };
    }

    const signedIn = await startSession(row.id);
    if (!signedIn) {
      return {
        data: { user: null, session: null },
        error: { message: "AUTH_SECRET is not configured", code: "session_unavailable" },
      };
    }

    await getD1Database()
      .prepare(`UPDATE "auth_users" SET "last_sign_in_at" = ?1 WHERE "id" = ?2`)
      .bind(new Date().toISOString(), row.id)
      .run();

    const user = toUser(row);
    return { data: { user, session: { user } }, error: null };
  }

  /**
   * Public sign-up. The D1 backend always creates the account confirmed: there
   * is no mailer, and the product already treats confirmation as optional (the
   * Supabase path created users with `email_confirm: true` for the same reason).
   */
  async signUp(params: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown> };
  }): Promise<D1AuthResult<{ user: D1AuthUser | null; session: { user: D1AuthUser } | null }>> {
    const metadata = params.options?.data ?? {};
    const phone = typeof metadata.phone === "string" ? metadata.phone : null;
    const created = await insertUser({
      email: params.email,
      password: params.password,
      phone,
      metadata,
      emailConfirmed: true,
    });
    if (created.error) return { data: { user: null, session: null }, error: created.error };

    const signedIn = await startSession(created.data.id);
    return {
      data: { user: created.data, session: signedIn ? { user: created.data } : null },
      error: null,
    };
  }

  /** Clears the session cookie. Stateless, so there is nothing else to revoke. */
  async signOut(): Promise<D1AuthResult<null>> {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    return { data: null, error: null };
  }

  /** The signed-in user, read from the session cookie plus one D1 row. */
  async getUser(): Promise<D1AuthResult<{ user: D1AuthUser | null }>> {
    const id = await sessionUserId();
    if (!id) return { data: { user: null }, error: null };
    const row = await findUserById(id);
    // A session naming a deleted user is treated as no session rather than an
    // error, so removing an account does not leave a half-broken page behind.
    return { data: { user: row ? toUser(row) : null }, error: null };
  }

  /**
   * The claims the middleware and analytics route read. `sub` is the only field
   * either of them uses; the rest of the Supabase JWT claim set is not needed.
   */
  async getClaims(): Promise<D1AuthResult<{ claims: { sub: string } | null }>> {
    const id = await sessionUserId();
    return { data: { claims: id ? { sub: id } : null }, error: null };
  }

  /**
   * Password reset. There is no mailer on D1, so this reports success without
   * sending anything — the same shape the Supabase path returns so the endpoint
   * cannot be used to discover which accounts exist. An operator resets through
   * the console.
   */
  async resetPasswordForEmail(): Promise<D1AuthResult<null>> {
    return { data: null, error: null };
  }

  /**
   * Email-link callback. The D1 backend never issues a confirmation link (users
   * are created confirmed), so a code cannot be valid; reporting an error sends
   * the visitor to sign-in with a clear reason instead of a dead session.
   */
  async exchangeCodeForSession(): Promise<D1AuthResult<{ session: null }>> {
    return { data: { session: null }, error: { message: "No confirmation link is issued on this deployment" } };
  }

  /** The service-role surface the signup flow uses. */
  readonly admin = {
    createUser: async (params: {
      email: string;
      password: string;
      email_confirm?: boolean;
      user_metadata?: Record<string, unknown>;
    }): Promise<D1AuthResult<{ user: D1AuthUser | null }>> => {
      const metadata = params.user_metadata ?? {};
      const phone = typeof metadata.phone === "string" ? metadata.phone : null;
      const created = await insertUser({
        email: params.email,
        password: params.password,
        phone,
        metadata,
        emailConfirmed: params.email_confirm !== false,
      });
      if (created.error) return { data: { user: null }, error: created.error };
      return { data: { user: created.data }, error: null };
    },

    deleteUser: async (userId: string): Promise<D1AuthResult<null>> => {
      const db = getD1Database();
      try {
        await db.prepare(`DELETE FROM "auth_identities" WHERE "user_id" = ?1`).bind(userId).run();
        await db.prepare(`DELETE FROM "auth_users" WHERE "id" = ?1`).bind(userId).run();
      } catch (error) {
        const message = error instanceof Error ? error.message : "delete failed";
        return { data: null, error: { message } };
      }
      return { data: null, error: null };
    },
  };
}
