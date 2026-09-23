import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";

import { patchStores, refreshLists } from "./hide";
import { isAvailable, unlock } from "./lock";
import Settings from "./Settings";

// Nothing at module top level may throw: Revenge swallows load errors and the
// toggle just flips back. Every Discord lookup happens at use time, and every
// Discord component has a plain RN fallback.
const UNLOCK_S = 60; // list hides itself again after a minute
const MUTED = "#80848e"; // readable on both light and dark themes

// Discord 345.9 design system barrel: Text, Button, IconButton, TableRow*, all in one module.
const ui = () => findByProps("TableRow", "TableRowGroup") ?? {};

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

function Label({ children, variant, color, style }: { children: any; variant: string; color: string; style?: any }) {
    const Text = ui().Text;
    if (Text) return <Text variant={variant} color={color} style={style}>{children}</Text>;
    const size = variant.startsWith("heading") ? 16 : variant.includes("xs") ? 12 : 14;
    return <RN.Text style={[{ color: MUTED, fontSize: size }, style]}>{children}</RN.Text>;
}

function userInfo(id: string) {
    const u = findByStoreName("UserStore")?.getUser?.(id);
    const name: string = u?.globalName ?? u?.username ?? "Unknown user";
    let avatar: any;
    try {
        // Returns a CDN url, or a bundled asset number for default avatars.
        const a = u && findByProps("getUserAvatarURL")?.getUserAvatarURL?.(u, false, 64);
        avatar = typeof a === "string" ? { uri: a } : typeof a === "number" ? a : undefined;
    } catch {}
    return { name, sub: u?.username ? `@${u.username}` : id, avatar };
}

function Avatar({ id, name, source }: { id: string; name: string; source?: any }) {
    const box = { width: 32, height: 32, borderRadius: 16 };
    if (source) return <RN.Image source={source} style={box} />;
    const hue = Number(id.slice(-4)) % 360 || 0;
    return (
        <RN.View style={[box, { backgroundColor: `hsl(${hue},45%,45%)`, alignItems: "center", justifyContent: "center" }]}>
            <RN.Text style={{ color: "#fff", fontWeight: "600" }}>{name[0]?.toUpperCase() ?? "?"}</RN.Text>
        </RN.View>
    );
}

function Person({ id, onOpen }: { id: string; onOpen: () => void }) {
    const { name, sub, avatar } = userInfo(id);
    const TableRow = ui().TableRow;
    const pic = <Avatar id={id} name={name} source={avatar} />;
    if (TableRow) return <TableRow label={name} subLabel={sub} icon={pic} arrow onPress={onOpen} />;
    return (
        <RN.Pressable onPress={onOpen} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 16, gap: 12 }}>
            {pic}
            <RN.View>
                <RN.Text style={{ color: MUTED, fontSize: 16, fontWeight: "600" }}>{name}</RN.Text>
                <RN.Text style={{ color: MUTED, fontSize: 12 }}>{sub}</RN.Text>
            </RN.View>
        </RN.Pressable>
    );
}

function openDM(id: string) {
    const mod = findByProps("openPrivateChannel");
    if (!mod) return showToast("Hidden Friends: openPrivateChannel not found");
    mod.openPrivateChannel({ recipientIds: [id] }); // shape verified in Discord 345.9
}

function HiddenRow() {
    useProxy(storage);
    const [until, setUntil] = React.useState(0); // 0 = locked
    const [busy, setBusy] = React.useState(false);
    const [now, setNow] = React.useState(Date.now());

    const open = until > now;
    const lock = () => setUntil(0);

    React.useEffect(() => {
        if (!until) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [until]);

    // Leaving the app locks it again.
    React.useEffect(() => {
        const sub = RN.AppState?.addEventListener?.("change", (s: string) => s !== "active" && lock());
        return () => sub?.remove?.();
    }, []);

    const tap = async () => {
        if (busy) return;
        if (!isAvailable()) return showToast("Hidden Friends: this Discord build has no passkey module");
        setBusy(true);
        try {
            if (await unlock()) {
                haptic();
                setNow(Date.now());
                setUntil(Date.now() + UNLOCK_S * 1000);
            } else {
                showToast("Hidden Friends: lock didn't match. Reset it in the plugin settings.");
            }
        } catch (e: any) {
            // Cancelled prompts land here too; stay quiet unless it is a real error.
            const msg = String(e?.message ?? e);
            if (!/cancel|NotAllowed|AbortError/i.test(msg)) showToast(`Hidden Friends: ${msg}`);
        } finally {
            setBusy(false);
        }
    };

    if (!open) {
        const lockIcon = icon("LockIcon", "ic_lock");
        return (
            <RN.Pressable
                onPress={tap}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Unlock private list"
                style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(128,128,128,0.08)", opacity: busy ? 0.7 : 0.35 }}
            >
                {busy
                    ? <RN.ActivityIndicator size="small" color={MUTED} />
                    : lockIcon !== undefined && <RN.Image source={lockIcon} style={{ width: 14, height: 14, tintColor: MUTED }} />}
                <Label variant="text-xs/medium" color="text-muted">{busy ? "Unlocking..." : storage.label || "Private"}</Label>
            </RN.Pressable>
        );
    }

    const users: string[] = storage.users ?? [];
    const { IconButton, TableRowGroup } = ui();
    const closeIcon = icon("CloseIcon", "ic_close", "XSmallIcon");
    const left = Math.max(0, Math.ceil((until - now) / 1000));

    const rows = users.map((id) => <Person key={id} id={id} onOpen={() => { lock(); openDM(id); }} />);

    return (
        <RN.View style={{ margin: 8, borderRadius: 16, backgroundColor: "rgba(128,128,128,0.08)", overflow: "hidden" }}>
            <RN.View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, paddingVertical: 6, minHeight: 44 }}>
                <RN.View style={{ flex: 1 }}>
                    <Label variant="heading-md/semibold" color="text-strong">{storage.label || "Private"}</Label>
                    <Label variant="text-xs/medium" color="text-muted">Locks in {left}s</Label>
                </RN.View>
                {IconButton && closeIcon !== undefined
                    ? <IconButton icon={closeIcon} variant="tertiary" size="sm" onPress={lock} accessibilityLabel="Lock" />
                    : (
                        <RN.Pressable onPress={lock} accessibilityRole="button" accessibilityLabel="Lock" style={{ padding: 10 }}>
                            <RN.Text style={{ color: MUTED, fontSize: 14 }}>Lock</RN.Text>
                        </RN.Pressable>
                    )}
            </RN.View>
            {users.length === 0 ? (
                <RN.View style={{ padding: 16, paddingTop: 4 }}>
                    <Label variant="text-sm/normal" color="text-muted">No one here yet. Add people under Settings, Revenge, Plugins, Hidden Friends (wrench icon).</Label>
                </RN.View>
            ) : (
                <RN.ScrollView style={{ maxHeight: 320 }}>
                    {TableRowGroup ? <TableRowGroup>{rows}</TableRowGroup> : rows}
                </RN.ScrollView>
            )}
        </RN.View>
    );
}

// Wraps the Friends tab: original screen fills the space, our row sits under it.
// ponytail: fixed footer, not a real list item. Becomes a list item if Discord
// exposes the friends section data in a patchable form.
function withFooter(res: any) {
    return (
        <RN.View style={{ flex: 1 }}>
            <RN.View style={{ flex: 1 }}>{res}</RN.View>
            <HiddenRow />
        </RN.View>
    );
}

function patchFriendsScreen(): (() => void) | undefined {
    // Discord 345.9: modules/main_tabs_v2/native/friends/screens/FriendsScreen.tsx, default export, plain function
    const mod = findByName("FriendsScreen", false) ?? findByProps("FriendsScreen");
    if (!mod) return;
    for (const key of ["default", "FriendsScreen"]) {
        const exp = mod[key];
        if (typeof exp === "function") return after(key, mod, (_, res) => withFooter(res));
        if (exp && typeof exp.type === "function") return after("type", exp, (_, res) => withFooter(res)); // React.memo
        if (exp && typeof exp.render === "function") return after("render", exp, (_, res) => withFooter(res)); // forwardRef
    }
}

let unpatch: (() => void) | undefined;
let unpatchStores: (() => void) | undefined;

export default {
    onLoad() {
        try {
            storage.users ??= [];
            storage.label ??= "";
            unpatch = patchFriendsScreen();
            const stores = patchStores();
            unpatchStores = stores.unpatch;
            refreshLists();
            if (stores.hooks < 3) showToast(`Hidden Friends: only ${stores.hooks}/3 list hooks found, people may stay visible`);
            if (!unpatch) showToast("Hidden Friends: FriendsScreen not found, tell anika the Discord version");
        } catch (e: any) {
            showToast(`Hidden Friends failed to load: ${e?.message ?? e}`);
            throw e;
        }
    },
    onUnload() {
        unpatch?.();
        unpatch = undefined;
        unpatchStores?.();
        unpatchStores = undefined;
        refreshLists();
    },
    settings: Settings,
};
