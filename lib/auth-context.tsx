'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { type AdminRole, type Permission, can } from '@/types';

// Auth source of truth: admins/{email} Firestore collection only.
// Doc must exist with active !== false. role field sets permission level.
async function getAdminRole(firebaseUser: User): Promise<AdminRole | null> {
  // Diagnostic dump — Firebase Auth is dropping email somewhere; log every
  // surface where we might find it so we can see which one's populated.
  console.log('[getAdminRole] firebaseUser:', {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    providerData: firebaseUser.providerData,
  });

  // Try every possible email source in order of preference.
  let email = (
    firebaseUser.email
    || firebaseUser.providerData.find((p) => p.email)?.email
    || ''
  ).toLowerCase();

  if (!email) {
    // Final fallback: pull email from the ID token claims directly.
    try {
      const tokenResult = await firebaseUser.getIdTokenResult(true);
      console.log('[getAdminRole] id-token claims:', tokenResult.claims);
      const claimEmail = tokenResult.claims.email;
      if (typeof claimEmail === 'string') email = claimEmail.toLowerCase();
    } catch (err) {
      console.error('[getAdminRole] getIdTokenResult failed:', err);
    }
  }

  if (!email) {
    console.warn('[getAdminRole] no email found on firebaseUser, providerData, or ID token claims — aborting lookup');
    return null;
  }
  try {
    const adminDoc = await getDoc(doc(db, 'admins', email));
    if (!adminDoc.exists()) {
      console.warn(`[getAdminRole] admins/${email} doc does not exist`);
      return null;
    }
    const data = adminDoc.data();
    if (data?.active === false) {
      console.warn(`[getAdminRole] admins/${email} is disabled (active: false)`);
      return null;
    }
    return (data?.role as AdminRole) ?? 'viewer';
  } catch (err) {
    // Most common causes: bad API key / referrer restriction / network /
    // Firestore rules. Logging the raw error so we can stop guessing.
    console.error(`[getAdminRole] Firestore read failed for admins/${email}:`, err);
    return null;
  }
}

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  role: AdminRole | null;
  can: (permission: Permission) => boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithKakao: () => Promise<void>;
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
    // GoogleAuthProvider's constructor only auto-adds the 'profile' scope.
    // Without explicitly requesting 'email', Google's id_token omits the
    // email claim — which breaks our admins/{email} lookup. The senior is
    // signed in but admin role resolution fails because we never see their
    // email. Add it explicitly so the OAuth consent screen requests it and
    // the resulting token carries it.
    provider.addScope('email');
    const credential = await signInWithPopup(auth, provider);
    const r = await getAdminRole(credential.user);
    if (!r) {
      await firebaseSignOut(auth);
      throw new Error('관리자 권한이 없습니다. Firestore admins 컬렉션에 이메일을 추가하세요.');
    }
  };

  const signInWithKakao = async () => {
    // 앱과 같은 Firebase OIDC 프로바이더(oidc.kakao)를 그대로 사용 —
    // 카카오 콘솔의 리디렉트 URI(…firebaseapp.com/__/auth/handler)도 공유한다.
    // account_email 동의를 요청해야 id_token에 email이 실려 admins/{email}
    // 권한 조회가 가능하다.
    const provider = new OAuthProvider('oidc.kakao');
    provider.addScope('openid');
    provider.addScope('account_email');
    const credential = await signInWithPopup(auth, provider);
    const r = await getAdminRole(credential.user);
    if (!r) {
      await firebaseSignOut(auth);
      throw new Error(
        '관리자 권한이 없습니다. 관리자 계정 페이지에서 이 카카오 계정의 이메일을 추가하세요.',
      );
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
      signInWithKakao,
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
