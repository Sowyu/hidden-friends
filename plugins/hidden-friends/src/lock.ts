// Two lock modes.
// "pin": a local PIN, works on any build.
// "passkey": Android Credential Manager passkey assertion via Discord's own
//   bridge (DCDSecurityKeyManager), which is what makes the OS ask for a
//   fingerprint. Passkey providers verify the calling app against the rpId's
//   /.well-known/assetlinks.json, and Revenge is re-signed with a per-device
//   key, so this only works once you host assetlinks for your own domain and
//   set that domain as rpId. See README.
import { ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

export type LockMode = "pin" | "passkey";
export const mode = (): LockMode => (storage.lockMode === "passkey" ? "passkey" : "pin");

// PIN ----------------------------------------------------------------------
// ponytail: PIN stored as plain text in plugin storage (device-local MMKV).
// Hash it if the threat model ever includes someone reading app storage.
export const hasPin = () => typeof storage.pin === "string" && storage.pin.length > 0;
export const setPin = (p: string) => { storage.pin = p; };
export const checkPin = (p: string) => hasPin() && p === storage.pin;
export const validPin = (p: string) => /^\d{4,8}$/.test(p);

// Passkey ------------------------------------------------------------------
const USER_NAME = "hidden-friends-lock";
const rpId = () => (typeof storage.rpId === "string" && storage.rpId.trim()) || "discord.com";

function nativeModule(...names: string[]) {
    const g = globalThis as any;
    for (const n of names) {
        try {
            const tm = g.__turboModuleProxy?.(n);
            if (tm) return tm;
        } catch {}
        const m = g.nativeModuleProxy?.[n] ?? (RN.NativeModules as any)?.[n];
        if (m) return m;
    }
    return undefined;
}
const passkeys = () => nativeModule("DCDSecurityKeyManager", "NativeSecurityKeyManagerModule");

// ponytail: Math.random challenge, hand-rolled base64url (Hermes has no btoa).
// The gate is the OS prompt, not the signature, so randomness quality is moot.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function randomB64(n: number) {
    let out = "";
    for (let i = 0; i < Math.ceil((n * 4) / 3); i++) out += B64[Math.floor(Math.random() * 64)];
    return out;
}

export function passkeyAvailable() {
    const m = passkeys();
    return typeof m?.authenticatePasskey === "function" && typeof m?.registerPasskey === "function";
}

async function enroll(): Promise<string> {
    const publicKey = {
        rp: { id: rpId(), name: "Hidden Friends" },
        user: { id: randomB64(16), name: USER_NAME, displayName: "Hidden Friends lock (plugin)" },
        challenge: randomB64(32),
        pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
        timeout: 60000,
        attestation: "none",
    };
    // Discord's native bridge reads requestJson.publicKey, same shape as navigator.credentials.create
    const raw = await passkeys().registerPasskey(JSON.stringify({ publicKey }));
    const res = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!res?.id) throw new Error("passkey registration returned no id");
    return res.id as string;
}

/** Resolves true when the OS confirmed the user. Throws on cancel/failure. */
export async function unlockPasskey(): Promise<boolean> {
    if (!passkeyAvailable()) throw new Error("passkey module missing");
    if (!storage.credentialId) {
        storage.credentialId = await enroll();
        return true; // enrolment itself required user verification
    }
    const publicKey = {
        rpId: rpId(),
        challenge: randomB64(32),
        allowCredentials: [{ type: "public-key", id: storage.credentialId }],
        userVerification: "required",
        timeout: 60000,
    };
    const raw = await passkeys().authenticatePasskey(JSON.stringify({ publicKey }));
    const res = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res?.id === storage.credentialId;
}
