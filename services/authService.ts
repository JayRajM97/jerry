
import { UserProfile } from "../types";

// Keys for local persistence of session
const SESSION_KEY = 'ru_session_user';

/**
 * MOCK AUTH SERVICE
 * In a real production app, replace this with Firebase Auth or Supabase Auth.
 *
 * There is no identity provider behind this — whoever opens the app says who they
 * are and that is taken at face value. What matters for persistence is that the
 * user id is DERIVED FROM THE EMAIL rather than random: every save in
 * databaseService is keyed by user.id, so a random id per sign-in would orphan
 * the previous session's resume and history on every sign-out.
 */

/** Stable, filesystem/key-safe id for an email. Same email always gives the same id. */
export function userIdForEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  const slug = normalized.replace(/[^a-z0-9]+/g, '_').slice(0, 32);
  return `usr_${slug}_${Math.abs(hash).toString(36)}`;
}

export interface SignInIdentity {
  name: string;
  email: string;
}

export const authService = {
  /**
   * Check if a user is currently logged in (persisted session)
   */
  getCurrentUser: async (): Promise<UserProfile | null> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;

    try {
      const parsed = JSON.parse(stored) as UserProfile;
      if (!parsed?.email) return null;
      // Older sessions stored a random id. Re-derive it from the email so data
      // saved under the stable id is still found after this upgrade.
      const expectedId = userIdForEmail(parsed.email);
      if (parsed.id !== expectedId) {
        const upgraded = { ...parsed, id: expectedId };
        localStorage.setItem(SESSION_KEY, JSON.stringify(upgraded));
        return upgraded;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  /**
   * Sign in as whoever is using the app. Named signInWithGoogle for continuity with
   * the existing call site; there is no Google OAuth behind it.
   */
  signInWithGoogle: async (identity: SignInIdentity): Promise<UserProfile> => {
    await new Promise(resolve => setTimeout(resolve, 600)); // Network delay simulation

    const email = identity.email.trim();
    const name = identity.name.trim() || email.split('@')[0] || 'You';

    const user: UserProfile = {
      id: userIdForEmail(email),
      name,
      email,
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return user;
  },

  /**
   * Sign out
   */
  signOut: async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    localStorage.removeItem(SESSION_KEY);
  }
};
