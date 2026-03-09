'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { type AdminRole, type Permission, can } from '@/types';

// Auth source of truth: admins/{email} Firestore collection only.
// Doc must exist with active !== false. role field sets permission level.
async function getAdminRole(firebaseUser: User): Promise<AdminRole | null> {
  const email = firebaseUser.email?.toLowerCase() || '';
  try {
    const adminDoc = await getDoc(doc(db, 'admins', email));
    if (adminDoc.exists() && adminDoc.data()?.active !== false) {
      return (adminDoc.data()?.role as AdminRole) ?? 'viewer';
    }
  } catch {
    // Firestore rules may reject
  }
  return null;
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  role: AdminRole | null;
  can: (permission: Permission) => boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setRole(await getAdminRole(firebaseUser));
      } else {
        setRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const r = await getAdminRole(credential.user);
    if (!r) {
      await firebaseSignOut(auth);
      throw new Error('관리자 권한이 없습니다.');
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    const r = await getAdminRole(credential.user);
    if (!r) {
      await firebaseSignOut(auth);
      throw new Error('관리자 권한이 없습니다. Firestore admins 컬렉션에 이메일을 추가하세요.');
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin: !!role,
      role,
      can: (permission: Permission) => can(role, permission),
      loading,
      signIn,
      signInWithGoogle,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
