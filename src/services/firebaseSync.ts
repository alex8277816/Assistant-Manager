import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  BusinessCardItem,
  CloudBackupRecord,
  MemoItem,
  TaskItem,
  ThemeAccent,
  ThemeMode,
  WorkflowPlugin,
} from '../types/assistant';
import { decryptText, encryptText } from '../utils/cryptoVault';

const app = initializeApp(firebaseConfig);
const databaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
export const auth = getAuth(app);

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
] as const;

const googleProvider = new GoogleAuthProvider();
const calendarGoogleProvider = new GoogleAuthProvider();
GOOGLE_CALENDAR_SCOPES.forEach((scope) => calendarGoogleProvider.addScope(scope));

// Strictly in-memory OAuth access token cache (never persisted to localStorage/sessionStorage)
let cachedCalendarAccessToken: string | null = null;
const tokenListeners = new Set<(token: string | null) => void>();

function setCalendarAccessToken(token: string | null) {
  cachedCalendarAccessToken = token;
  tokenListeners.forEach((cb) => cb(token));
}

export function getGoogleCalendarAccessToken(): string | null {
  return cachedCalendarAccessToken;
}

export function subscribeCalendarToken(cb: (token: string | null) => void): () => void {
  tokenListeners.add(cb);
  cb(cachedCalendarAccessToken);
  return () => {
    tokenListeners.delete(cb);
  };
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return false;
    }
    return true;
  }
}

export function subscribeAuth(cb: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      setCalendarAccessToken(null);
    }
    cb(user);
  });
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken && cachedCalendarAccessToken === null) {
    // Keep standard login separate unless calendar scope was granted
  }
  return result.user;
}

export async function connectGoogleCalendarPopup(): Promise<{
  user: User;
  accessToken: string;
}> {
  const result = await signInWithPopup(auth, calendarGoogleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('未能取得 Google Calendar 授權存取權杖，請重試。');
  }
  setCalendarAccessToken(credential.accessToken);
  return { user: result.user, accessToken: credential.accessToken };
}

export function disconnectGoogleCalendarToken(): void {
  setCalendarAccessToken(null);
}

export async function signOutGoogle(): Promise<void> {
  setCalendarAccessToken(null);
  await signOut(auth);
}

export interface RemoteVaultMeta {
  vaultSalt: string;
  vaultCheckCipher: string;
  vaultCheckIv: string;
  themeMode: ThemeMode;
  themeAccent: ThemeAccent;
}

export async function fetchUserVaultMeta(uid: string): Promise<RemoteVaultMeta | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      vaultSalt: d.vaultSalt,
      vaultCheckCipher: d.vaultCheckCipher,
      vaultCheckIv: d.vaultCheckIv,
      themeMode: d.themeMode,
      themeAccent: d.themeAccent,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeUserVaultMeta(
  uid: string,
  onMeta: (meta: RemoteVaultMeta) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onMeta({
        vaultSalt: d.vaultSalt,
        vaultCheckCipher: d.vaultCheckCipher,
        vaultCheckIv: d.vaultCheckIv,
        themeMode: d.themeMode,
        themeAccent: d.themeAccent,
      });
    },
    () => {
      // Gracefully stay in offline mode if snapshot listener fails
    }
  );
}

export async function upsertUserVaultMeta(
  uid: string,
  meta: RemoteVaultMeta
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        vaultSalt: meta.vaultSalt,
        vaultCheckCipher: meta.vaultCheckCipher,
        vaultCheckIv: meta.vaultCheckIv,
        themeMode: meta.themeMode,
        themeAccent: meta.themeAccent,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        vaultSalt: meta.vaultSalt,
        vaultCheckCipher: meta.vaultCheckCipher,
        vaultCheckIv: meta.vaultCheckIv,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateRemoteThemePrefs(
  uid: string,
  themeMode: ThemeMode,
  themeAccent: ThemeAccent
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    await updateDoc(ref, {
      themeMode,
      themeAccent,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function pushEncryptedSyncItem(
  uid: string,
  key: CryptoKey,
  kind: 'task' | 'memo' | 'plugin' | 'card',
  item: TaskItem | MemoItem | WorkflowPlugin | BusinessCardItem
): Promise<void> {
  const safeId = item.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `users/${uid}/items/${safeId}`;
  const ref = doc(db, 'users', uid, 'items', safeId);

  try {
    const { ciphertext, iv } = await encryptText(key, JSON.stringify(item));
    const existing = await getDoc(ref);
    const version =
      'version' in item && typeof item.version === 'number' ? Math.max(1, item.version) : 1;
    const deleted = 'deleted' in item ? Boolean(item.deleted) : false;

    if (!existing.exists()) {
      await setDoc(ref, {
        ownerId: uid,
        kind,
        ciphertext,
        iv,
        version,
        deleted,
        clientUpdatedAt: item.updatedAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prevVersion = Number(existing.data().version || 1);
      await updateDoc(ref, {
        ciphertext,
        iv,
        version: Math.max(version, prevVersion),
        deleted,
        clientUpdatedAt: item.updatedAt,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export interface DecryptedRemoteBatch {
  tasks: TaskItem[];
  memos: MemoItem[];
  plugins: WorkflowPlugin[];
  cards: BusinessCardItem[];
}

export function subscribeEncryptedSyncItems(
  uid: string,
  key: CryptoKey,
  onBatch: (batch: DecryptedRemoteBatch) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/items`;
  const q = query(collection(db, 'users', uid, 'items'), where('ownerId', '==', uid));

  return onSnapshot(
    q,
    async (snapshot) => {
      const tasks: TaskItem[] = [];
      const memos: MemoItem[] = [];
      const plugins: WorkflowPlugin[] = [];
      const cards: BusinessCardItem[] = [];

      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        try {
          const json = await decryptText(key, d.ciphertext, d.iv);
          const parsed = JSON.parse(json);
          if (d.kind === 'task') tasks.push({ ...parsed, syncStatus: 'synced' });
          else if (d.kind === 'memo') memos.push({ ...parsed, syncStatus: 'synced' });
          else if (d.kind === 'plugin') plugins.push({ ...parsed, syncStatus: 'synced' });
          else if (d.kind === 'card') cards.push({ ...parsed, syncStatus: 'synced' });
        } catch {
          // Skip items encrypted under an older rotated key
        }
      }

      onBatch({ tasks, memos, plugins, cards });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function createCloudBackupSnapshot(
  uid: string,
  backup: Omit<CloudBackupRecord, 'createdAtMs'>
): Promise<void> {
  const safeId = backup.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const path = `users/${uid}/backups/${safeId}`;
  try {
    await setDoc(doc(db, 'users', uid, 'backups', safeId), {
      ownerId: uid,
      label: backup.label.slice(0, 120),
      itemCount: backup.itemCount,
      ciphertext: backup.ciphertext,
      iv: backup.iv,
      salt: backup.salt,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function listCloudBackupSnapshots(uid: string): Promise<CloudBackupRecord[]> {
  const path = `users/${uid}/backups`;
  try {
    const q = query(
      collection(db, 'users', uid, 'backups'),
      where('ownerId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      const createdAtMs =
        data.createdAt && typeof data.createdAt.toMillis === 'function'
          ? data.createdAt.toMillis()
          : Date.now();
      return {
        id: d.id,
        label: data.label,
        itemCount: data.itemCount,
        ciphertext: data.ciphertext,
        iv: data.iv,
        salt: data.salt,
        createdAtMs,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteCloudBackupSnapshot(uid: string, backupId: string): Promise<void> {
  const path = `users/${uid}/backups/${backupId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'backups', backupId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
