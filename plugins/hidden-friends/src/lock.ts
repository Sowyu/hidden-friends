// Fingerprint / screen-lock gate.
// Discord ships no biometric prompt module, but it does ship the passkey
// bridge (DCDSecurityKeyManager, backed by Android Credential Manager). A
// passkey assertion with userVerification "required" makes the OS ask for
// fingerprint, face, or PIN. We never verify the signature; the OS prompt is
// the lock.
import { ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

const RP_ID = "discord.com"; // must be a domain asset-linked to the Discord app
const USER_NAME = "hidden-friends-lock";

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

export const passkeys = () => nativeModule("DCDSecurityKeyManager", "NativeSecurityKeyManagerModule");

// ponytail: Math.random challenge, hand-rolled base64url (Hermes has no btoa).
// The gate is the OS prompt, not the signature, so randomness quality is moot.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function randomB64(n: number) {
    let out = "";
    for (let i = 0; i < Math.ceil((n * 4) / 3); i++) out += B64[Math.floor(Math.random() * 64)];
    return out;
}

export function isAvailable() {
    const m = passkeys();
    return typeof m?.authenticatePasskey === "function" && typeof m?.registerPasskey === "function";
}

async function enroll(): Promise<string> {
    const req = {
        rp: { id: RP_ID, name: "Hidden Friends" },
        user: { id: randomB64(16), name: USER_NAME, displayName: "Hidden Friends lock (plugin)" },
        challenge: randomB64(32),
        pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
            authenticatorAttachment: "platform",
            residentKey: "required",
            userVerification: "required",
        },
        timeout: 60000,
        attestation: "none",
    };
    const raw = await passkeys().registerPasskey(JSON.stringify(req));
    const res = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!res?.id) throw new Error("passkey registration returned no id");
    return res.id as string;
}

/** Resolves true when the OS confirmed the user. Throws on cancel/failure. */
export async function unlock(): Promise<boolean> {
    if (!isAvailable()) throw new Error("passkey module missing");
    if (!storage.credentialId) {
        storage.credentialId = await enroll();
        return true; // enrolment itself required user verification
    }
    const req = {
        rpId: RP_ID,
        challenge: randomB64(32),
        allowCredentials: [{ type: "public-key", id: storage.credentialId }],
        userVerification: "required",
        timeout: 60000,
    };
    const raw = await passkeys().authenticatePasskey(JSON.stringify(req));
    const res = typeof raw === "string" ? JSON.parse(raw) : raw;
    return res?.id === storage.credentialId;
}
