import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  signup: (email: string, pass: string, name: string, birthYear: number) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const res = await signInWithPopup(auth, provider);
    
    // Check if user exists in Firestore, if not create basic profile
    const userDoc = await getDoc(doc(db, 'users', res.user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', res.user.uid), {
        uid: res.user.uid,
        displayName: res.user.displayName,
        email: res.user.email,
        birthYear: 1995, // Default for google login
        createdAt: Date.now(),
        stats: {
          streaks: 0,
          completions: 0
        }
      });
    }
  };

  const signup = async (email: string, pass: string, name: string, birthYear: number) => {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(res.user, { displayName: name });
    
    // Create user profile in Firestore
    await setDoc(doc(db, 'users', res.user.uid), {
      uid: res.user.uid,
      displayName: name,
      email: email,
      birthYear: birthYear,
      createdAt: Date.now(),
      stats: {
        streaks: 0,
        completions: 0
      }
    });

    // Initialize first month (May 2026 as per user's excel)
    const currentMonthId = '2026-05';
    const excelHabits = [
      'Eat clean (No junk food ❌)',
      'Exercise / Workout',
      'Drink 1 big cup milk (morning)',
      'Prayer + Gratitude',
      'Wake up at 5:30–6:00 AM',
      'Make your bed',
      'Meditation (5–10 min)',
      'Deep Study (4–6 hours)',
      '🚰 Drink 3–4L water (total)',
    ];
    
    const initialGridData: Record<string, boolean[]> = {};
    excelHabits.forEach(h => {
      initialGridData[h] = Array(31).fill(false);
    });

    await setDoc(doc(db, `users/${res.user.uid}/months`, currentMonthId), {
      userId: res.user.uid,
      monthId: currentMonthId,
      gridData: initialGridData,
      updatedAt: Date.now()
    });
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
