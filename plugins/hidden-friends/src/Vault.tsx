// Full-screen vault: PIN pad (or passkey wait) then the private people list.
// Plain React Native only, so it renders the same on every Discord build.
import { findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";

import { checkPin, hasPin, mode, passkeyAvailable, setPin, unlockPasskey, validPin } from "./lock";

const C = {
    bg: "#111214",
    surface: "#1e1f22",
    key: "#2b2d31",
    keyPressed: "#3a3c42",
    text: "#f2f3f5",
    muted: "#949ba4",
    accent: "#5865f2",
    danger: "#f23f43",
};

function icon(...names: string[]) {
    for (const n of names) {
        try {
            const id = getAssetIDByName(n);
            if (typeof id === "number") return id;
        } catch {}
    }
}

function haptic() {
    try { findByProps("triggerHaptic")?.triggerHaptic?.(); } catch {}
}

function userInfo(id: string) {
    const u = findByStoreName("UserStore")?.getUser?.(id);
    const name: string = u?.globalName ?? u?.username ?? "Unknown user";
    let avatar: any;
    try {
        const a = u && findByProps("getUserAvatarURL")?.getUserAvatarURL?.(u, false, 80);
        avatar = typeof a === "string" ? { uri: a } : typeof a === "number" ? a : undefined;
    } catch {}
    return { name, sub: u?.username ? `@${u.username}` : id, avatar };
}

function openDM(id: string) {
    const mod = findByProps("openPrivateChannel");
    if (!mod) return showToast("Hidden Friends: openPrivateChannel not found");
    mod.openPrivateChannel({ recipientIds: [id] });
}

// --- PIN pad ---------------------------------------------------------------

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

function Key({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
    const back = label === "back";
    const backIcon = back ? icon("BackspaceIcon", "ic_backspace", "ArrowLeftIcon") : undefined;
    if (label === "") return <RN.View style={{ width: 76, height: 76 }} />;
    return (
        <RN.Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={back ? "Delete" : label}
            style={({ pressed }) => ({
                width: 76, height: 76, borderRadius: 38,
                alignItems: "center", justifyContent: "center",
                backgroundColor: back ? "transparent" : pressed ? C.keyPressed : C.key,
                opacity: disabled ? 0.4 : 1,
            })}
        >
            {back
                ? backIcon !== undefined
                    ? <RN.Image source={backIcon} style={{ width: 26, height: 26, tintColor: C.text }} />
                    : <RN.Text style={{ color: C.text, fontSize: 22 }}>⌫</RN.Text>
                : <RN.Text style={{ color: C.text, fontSize: 30, fontWeight: "500" }}>{label}</RN.Text>}
        </RN.Pressable>
    );
}

function Dots({ count, total, error }: { count: number; total: number; error: boolean }) {
    return (
        <RN.View style={{ flexDirection: "row", gap: 14, height: 16, alignItems: "center" }}>
            {Array.from({ length: Math.max(total, 4) }, (_, i) => (
                <RN.View
                    key={i}
                    style={{
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: error ? C.danger : i < count ? C.accent : "transparent",
                        borderWidth: i < count || error ? 0 : 1.5, borderColor: C.muted,
                    }}
                />
            ))}
        </RN.View>
    );
}

function PinPad({ onUnlocked }: { onUnlocked: () => void }) {
    const [entry, setEntry] = React.useState("");
    const [first, setFirst] = React.useState<string | null>(null); // set-up: first entry awaiting confirm
    const [error, setError] = React.useState(false);
    const shake = React.useRef(new RN.Animated.Value(0)).current;
    const setup = !hasPin();
    const target = setup ? (first ? first.length : 8) : (storage.pin as string).length;

    const fail = (msg: string) => {
        setError(true);
        haptic();
        RN.Animated.sequence([
            RN.Animated.timing(shake, { toValue: 10, duration: 40, useNativeDriver: true }),
            RN.Animated.timing(shake, { toValue: -10, duration: 40, useNativeDriver: true }),
            RN.Animated.timing(shake, { toValue: 6, duration: 40, useNativeDriver: true }),
            RN.Animated.timing(shake, { toValue: 0, duration: 40, useNativeDriver: true }),
        ]).start(() => { setError(false); setEntry(""); });
        if (msg) showToast(msg);
    };

    const submit = (value: string) => {
        if (setup) {
            if (!first) {
                if (!validPin(value)) return fail("PIN must be 4 to 8 digits");
                setFirst(value);
                setEntry("");
                return;
            }
            if (value !== first) { setFirst(null); return fail("PINs did not match, start again"); }
            setPin(value);
            showToast("PIN set");
            return onUnlocked();
        }
        if (checkPin(value)) return onUnlocked();
        fail("");
    };

    const press = (k: string) => {
        if (error) return;
        if (k === "back") return setEntry((e) => e.slice(0, -1));
        const next = entry + k;
        if (next.length > 8) return;
        setEntry(next);
        // Verify and confirm steps auto-submit at the known length; first set-up entry needs the button.
        if (!setup || first) { if (next.length === target) submit(next); }
    };

    const title = setup ? (first ? "Confirm your PIN" : "Choose a PIN") : (storage.label || "Private");
    const hint = setup ? (first ? "Enter it once more" : "4 to 8 digits. You will type it every time.") : "Enter your PIN";

    return (
        <RN.View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 24 }}>
            <RN.Text style={{ color: C.text, fontSize: 26, fontWeight: "600" }}>{title}</RN.Text>
            <RN.Text style={{ color: C.muted, fontSize: 14, marginTop: 6, marginBottom: 32 }}>{hint}</RN.Text>
            <RN.Animated.View style={{ transform: [{ translateX: shake }] }}>
                <Dots count={entry.length} total={setup && !first ? Math.max(entry.length, 4) : target} error={error} />
            </RN.Animated.View>
            <RN.View style={{ width: 76 * 3 + 24 * 2, flexDirection: "row", flexWrap: "wrap", gap: 24, marginTop: 44 }}>
                {KEYS.map((k, i) => <Key key={i} label={k} onPress={() => press(k)} disabled={k !== "back" && k !== "" && entry.length >= 8} />)}
            </RN.View>
            {setup && !first && (
                <RN.Pressable
                    onPress={() => submit(entry)}
                    disabled={!validPin(entry)}
                    accessibilityRole="button"
                    style={{ marginTop: 36, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 8, backgroundColor: C.accent, opacity: validPin(entry) ? 1 : 0.35 }}
                >
                    <RN.Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>Continue</RN.Text>
                </RN.Pressable>
            )}
        </RN.View>
    );
}

// --- Passkey wait ----------------------------------------------------------

function PasskeyWait({ onUnlocked, onCancel }: { onUnlocked: () => void; onCancel: () => void }) {
    const [msg, setMsg] = React.useState("Waiting for your fingerprint");
    React.useEffect(() => {
        let alive = true;
        (async () => {
            try {
                if (!passkeyAvailable()) throw new Error("This Discord build has no passkey module");
                if (await unlockPasskey()) { if (alive) onUnlocked(); }
                else if (alive) setMsg("Lock did not match. Reset it in the plugin settings.");
            } catch (e: any) {
                const m = String(e?.message ?? e);
                if (alive) setMsg(/cancel|AbortError/i.test(m) ? "Cancelled" : m);
            }
        })();
        return () => { alive = false; };
    }, []);
    return (
        <RN.View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
            <RN.ActivityIndicator size="large" color={C.accent} />
            <RN.Text style={{ color: C.text, fontSize: 16, marginTop: 20, textAlign: "center" }}>{msg}</RN.Text>
            <RN.Pressable onPress={onCancel} style={{ marginTop: 24, padding: 12 }}>
                <RN.Text style={{ color: C.muted, fontSize: 15 }}>Cancel</RN.Text>
            </RN.Pressable>
        </RN.View>
    );
}

// --- People list -----------------------------------------------------------

function Avatar({ id, name, source }: { id: string; name: string; source?: any }) {
    const box = { width: 44, height: 44, borderRadius: 22 };
    if (source) return <RN.Image source={source} style={box} />;
    const hue = Number(id.slice(-4)) % 360 || 0;
    return (
        <RN.View style={[box, { backgroundColor: `hsl(${hue},45%,45%)`, alignItems: "center", justifyContent: "center" }]}>
            <RN.Text style={{ color: "#fff", fontWeight: "600", fontSize: 18 }}>{name[0]?.toUpperCase() ?? "?"}</RN.Text>
        </RN.View>
    );
}

function People({ onOpen }: { onOpen: (id: string) => void }) {
    useProxy(storage);
    const users: string[] = storage.users ?? [];
    if (users.length === 0) {
        return (
            <RN.View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
                <RN.Text style={{ color: C.text, fontSize: 17, fontWeight: "600" }}>No one here yet</RN.Text>
                <RN.Text style={{ color: C.muted, fontSize: 14, marginTop: 8, textAlign: "center" }}>
                    Add people under Settings, Revenge, Plugins, Hidden Friends (wrench icon). They disappear from Messages and Friends and only show here.
                </RN.Text>
            </RN.View>
        );
    }
    return (
        <RN.ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {users.map((id) => {
                const { name, sub, avatar } = userInfo(id);
                return (
                    <RN.Pressable
                        key={id}
                        onPress={() => onOpen(id)}
                        accessibilityRole="button"
                        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? C.surface : "transparent" })}
                    >
                        <Avatar id={id} name={name} source={avatar} />
                        <RN.View style={{ flex: 1 }}>
                            <RN.Text style={{ color: C.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>{name}</RN.Text>
                            <RN.Text style={{ color: C.muted, fontSize: 13 }} numberOfLines={1}>{sub}</RN.Text>
                        </RN.View>
                    </RN.Pressable>
                );
            })}
        </RN.ScrollView>
    );
}

// --- Modal shell -----------------------------------------------------------

export default function Vault({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    const [unlocked, setUnlocked] = React.useState(false);
    React.useEffect(() => { if (!visible) setUnlocked(false); }, [visible]);
    // Leaving the app closes the vault.
    React.useEffect(() => {
        const sub = RN.AppState?.addEventListener?.("change", (s: string) => s !== "active" && onClose());
        return () => sub?.remove?.();
    }, []);

    const closeIcon = icon("CloseIcon", "ic_close", "XSmallIcon");
    const lockIcon = icon("LockIcon", "ic_lock");
    const unlockedNow = () => { haptic(); setUnlocked(true); };

    return (
        <RN.Modal visible={visible} onRequestClose={onClose} animationType="fade" statusBarTranslucent>
            <RN.View style={{ flex: 1, backgroundColor: C.bg, paddingTop: (RN.StatusBar?.currentHeight ?? 24) + 8 }}>
                <RN.View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 52 }}>
                    {lockIcon !== undefined && <RN.Image source={lockIcon} style={{ width: 18, height: 18, tintColor: unlocked ? C.accent : C.muted, marginRight: 8 }} />}
                    <RN.Text style={{ color: C.text, fontSize: 17, fontWeight: "600", flex: 1 }}>{unlocked ? (storage.label || "Private") : ""}</RN.Text>
                    <RN.Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} style={{ padding: 6 }}>
                        {closeIcon !== undefined
                            ? <RN.Image source={closeIcon} style={{ width: 22, height: 22, tintColor: C.text }} />
                            : <RN.Text style={{ color: C.text, fontSize: 18 }}>✕</RN.Text>}
                    </RN.Pressable>
                </RN.View>
                {unlocked
                    ? <People onOpen={(id) => { onClose(); openDM(id); }} />
                    : mode() === "passkey"
                        ? <PasskeyWait onUnlocked={unlockedNow} onCancel={onClose} />
                        : <PinPad onUnlocked={unlockedNow} />}
            </RN.View>
        </RN.Modal>
    );
}
