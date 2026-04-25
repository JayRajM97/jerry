
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  query, 
  where, 
  orderBy, 
  getDocFromServer,
  FirestoreError
} from 'firebase/firestore';
import { db, auth } from '../src/lib/firebase';
import { HistoryItem } from "../types";

/**
 * FIRESTORE DATABASE SERVICE
 * Handles persistence for CV history, master templates, and waitlist.
 */

const handleFirestoreError = (error: any, operationType: any, path: string | null = null) => {
  if (error instanceof FirestoreError && error.code === 'permission-denied') {
    const user = auth.currentUser;
    const errorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: user ? {
        userId: user.uid,
        email: user.email || '',
        emailVerified: user.emailVerified,
        isAnonymous: user.isAnonymous,
        providerInfo: user.providerData.map(p => ({
          providerId: p.providerId,
          displayName: p.displayName || '',
          email: p.email || ''
        }))
      } : null
    };
    throw new Error(JSON.stringify(errorInfo));
  }
  throw error;
};

export const databaseService = {
  /**
   * Initialize Database (Test Connection)
   */
  initDB: async () => {
    try {
      // Test connection as instructed
      await getDocFromServer(doc(db, 'test', 'connection'));
      console.log("Firestore connection verified.");
    } catch (error: any) {
      if (error.message && error.message.includes('offline')) {
        console.error("Please check your Firebase configuration. Client is offline.");
      }
      // We don't re-throw here to allow app to continue if possible
    }
  },

  /**
   * Fetch user's application history
   */
  getHistory: async (userId: string): Promise<HistoryItem[]> => {
    try {
      const q = query(
        collection(db, 'user_history'),
        where('userId', '==', userId),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => doc.data() as HistoryItem);
    } catch (e) {
      return handleFirestoreError(e, 'list', 'user_history');
    }
  },

  /**
   * Save a new history item
   */
  saveHistoryItem: async (userId: string, item: HistoryItem): Promise<void> => {
    try {
      await setDoc(doc(db, 'user_history', item.id), item);
    } catch (e) {
      handleFirestoreError(e, 'create', `user_history/${item.id}`);
    }
  },

  /**
   * Get Master CV Profile
   */
  getMasterCV: async (userId: string): Promise<string | null> => {
    try {
      const docSnap = await getDoc(doc(db, 'master_cv', userId));
      if (docSnap.exists()) {
        return docSnap.data().htmlContent;
      }
      return null;
    } catch (e) {
      return handleFirestoreError(e, 'get', `master_cv/${userId}`);
    }
  },

  /**
   * Update Master CV Profile
   */
  saveMasterCV: async (userId: string, htmlContent: string): Promise<void> => {
    try {
      await setDoc(doc(db, 'master_cv', userId), {
        userId,
        htmlContent,
        updatedAt: Date.now()
      });
    } catch (e) {
      handleFirestoreError(e, 'write', `master_cv/${userId}`);
    }
  },

  /**
   * Save Waitlist Survey Response
   */
  saveWaitlistResponse: async (data: any): Promise<void> => {
    const waitlistId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    try {
      await setDoc(doc(db, 'waitlist', waitlistId), {
        ...data,
        id: waitlistId,
        timestamp: Date.now()
      });
    } catch (e) {
      handleFirestoreError(e, 'create', `waitlist/${waitlistId}`);
    }
  }
};
