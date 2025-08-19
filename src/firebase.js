// src/firebase.js
// Firebase v10+ modular SDK
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
} from "firebase/auth";
import { getDatabase, ref, push, onValue, serverTimestamp } from "firebase/database";

// --- Your config (unchanged) ---
const firebaseConfig = {
    apiKey: "AIzaSyCoHvpzSUYDs-vwW45dvfQTm1mYcmHAT7w",
    authDomain: "land-map-app-e2e0e.firebaseapp.com",
    databaseURL: "https://land-map-app-e2e0e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "land-map-app-e2e0e",
    storageBucket: "land-map-app-e2e0e.firebasestorage.app",
    messagingSenderId: "168004732987",
    appId: "1:168004732987:web:00971689116dc5f23ef41e",
    measurementId: "G-BRZYYFR13J",
};

// --- Initialize ---
const app = initializeApp(firebaseConfig);
let analytics;
{ analytics = getAnalytics(app); }

const auth = getAuth(app);
const db = getDatabase(app);

// ---------- AUTH HELPERS ----------
export function onAuthChanged(cb) {
    return onAuthStateChanged(auth, cb);
}

export async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
}

export async function loginWithEmail(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
}

export async function registerWithEmail(email, password, displayName = "") {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
        await updateProfile(cred.user, { displayName });
    }
    return cred.user;
}

export async function logout() {
    await signOut(auth);
}

// (optional) anonymous sign-in (ยังคงไว้ใช้กรณีต้องการ guest)
export function ensureAnonAuth() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            try {
                if (!user) {
                    await signInAnonymously(auth);
                    return; // จะ call onAuthStateChanged อีกรอบ
                }
                resolve(user.uid);
            } catch (e) {
                reject(e);
            }
        });
    });
}

// ---------- DATABASE HELPERS (ของเดิม) ----------
export function saveLand(dbPayload) {
    const landsRef = ref(db, "lands");
    return push(landsRef, { ...dbPayload, createdAt: serverTimestamp() });
}

export function subscribeLands(callback) {
    const landsRef = ref(db, "lands");
    return onValue(landsRef, (snap) => {
        const data = snap.val() || {};
        const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        callback(list);
    });
}

export function sendChatMessage(text, uid, displayName = "") {
    const roomRef = ref(db, `chats/global`);
    return push(roomRef, {
        text: String(text || ""),
        uid,
        name: displayName || (uid ? `User-${uid.slice(0, 6)}` : "Guest"),
        createdAt: serverTimestamp(),
    });
}

export function subscribeChat(callback) {
    const roomRef = ref(db, `chats/global`);
    return onValue(roomRef, (snap) => {
        const data = snap.val() || {};
        const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
        list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        callback(list);
    });
}

export { app, analytics, auth, db };
