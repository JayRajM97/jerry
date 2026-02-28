
import { UserProfile } from "../types";

// Keys for local persistence of session
const SESSION_KEY = 'ru_session_user';

/**
 * MOCK AUTH SERVICE
 * In a real production app, replace this with Firebase Auth or Supabase Auth.
 */

export const authService = {
  /**
   * Check if a user is currently logged in (persisted session)
   */
  getCurrentUser: async (): Promise<UserProfile | null> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  },

  /**
   * Simulate Google Sign In
   */
  signInWithGoogle: async (): Promise<UserProfile> => {
    await new Promise(resolve => setTimeout(resolve, 1500)); // Network delay simulation

    const mockUser: UserProfile = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      name: 'Jerry Maguire',
      email: 'jerry@sportsmanagement.com',
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jerry'
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(mockUser));
    return mockUser;
  },

  /**
   * Sign out
   */
  signOut: async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    localStorage.removeItem(SESSION_KEY);
  }
};
