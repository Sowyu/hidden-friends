// Fingerprint / screen-lock gate.
// Discord ships no biometric prompt module, but it does ship the passkey
// bridge (NativeSecurityKeyManagerModule, backed by Android Credential
// Manager). A passkey assertion with userVerification "required" makes the
// OS ask for fingerprint, face, or PIN. We never verify the signature; the
// OS prompt is the lock.
import { ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";

const RP_ID = "discord.com"; // must be a domain asset-linked to the Discord app
const USER_NAME = "hidden-friends-lock";

function nativeModule(...names: string[]) {
    const g = globalThis as any;
    for (const n of names) {
        const tm = g.__turboModuleProxy?.(n);
        if (tm) return tm;
        const m = g.nativeModuleProxy?.[n] ?? (RN.NativeModules as any)?.[n];
        if (m) return m;
    }
    return undefined;
}

export const passkeys = nativeModule("NativeSecurityKeyManagerModule", "DCDSecurityKeyManager");

// ponytail: Math.random challenge. The gate is the OS prompt, not the
// signature, so cryptographic randomness buys nothing here.
function b64url(bytes: number[]) {
    const bin = String.fromCharCode(...bytes);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomB64(n: number) {
    return b64url(Array.from({ length: n }, () => Math.floor(Math.random() * 256)));
}

export function isAvailable() {
    return !!passkeys?.authenticatePasskey && !!passkeys?.registerPasskey;
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
    const res = JSON.parse(await passkeys.registerPasskey(JSON.stringify(req)));
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
    const res = JSON.parse(await passkeys.authenticatePasskey(JSON.stringify(req)));
    return res?.id === storage.credentialId;
}
