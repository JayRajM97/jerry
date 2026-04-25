
import { UserProfile } from "../types";

import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { auth } from "../src/lib/firebase";

/**
 * FIREBASE AUTH SERVICE
 * Handles Google Login and session persistence.
 */

const mapFirebaseUser = (user: User): UserProfile => ({
  id: user.uid,
  name: user.displayName || 'User',
  email: user.email || '',
  avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`
});

export const authService = {
  /**
   * Check if a user is currently logged in
   */
  getCurrentUser: (): Promise<UserProfile | null> => {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        if (user) {
          resolve(mapFirebaseUser(user));
        } else {
          resolve(null);
        }
      });
    });
  },

  /**
   * Google Sign In
   */
  signInWithGoogle: async (): Promise<UserProfile> => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return mapFirebaseUser(result.user);
  },

  /**
   * Sign out
   */
  signOut: async (): Promise<void> => {
    await firebaseSignOut(auth);
  }
};
