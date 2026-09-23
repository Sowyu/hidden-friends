import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { showToast } from "@vendetta/ui/toasts";

import { isAvailable, unlock } from "./lock";
import Settings from "./Settings";

// Nothing at module top level may throw: Revenge swallows load errors and the
// toggle just flips back. Every Discord lookup happens at use time.
const UNLOCK_MS = 60_000; // list hides itself again after a minute

function displayName(id: string) {
    const u = findByStoreName("UserStore")?.getUser?.(id);
    return u?.globalName ?? u?.username ?? id;
}

function openDM(id: string) {
    const mod = findByProps("openPrivateChannel");
    if (!mod) return showToast("Hidden Friends: openPrivateChannel not found");
    mod.openPrivateChannel({ recipientIds: [id] }); // shape verified in Discord 345.9
}

function HiddenRow() {
    useProxy(storage);
    const [open, setOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        const t = setTimeout(() => setOpen(false), UNLOCK_MS);
        return () => clearTimeout(t);
    }, [open]);

    const tap = async () => {
        if (open) return setOpen(false);
        if (busy) return;
        if (!isAvailable()) return showToast("Hidden Friends: no passkey module in this Discord build");
        setBusy(true);
        try {
            if (await unlock()) setOpen(true);
        } catch (e: any) {
            // cancelled prompts land here too; stay quiet unless it is a real error
            if (!/cancel|NotAllowed|AbortError/i.test(String(e?.message ?? e))) showToast(`Hidden Friends: ${e?.message ?? e}`);
        } finally {
            setBusy(false);
        }
    };

    const users: string[] = storage.users ?? [];
    return (
        <RN.View>
            {open && users.map((id) => (
                <RN.Pressable
                    key={id}
                    onPress={() => { setOpen(false); openDM(id); }}
                    style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 16 }}
                >
                    <RN.Text style={{ color: "#dbdee1", fontSize: 16 }}>{displayName(id)}</RN.Text>
                </RN.Pressable>
            ))}
            {open && users.length === 0 && (
                <RN.Text style={{ color: "#949ba4", padding: 16 }}>No one added yet. Add user IDs in the plugin settings.</RN.Text>
            )}
            <RN.Pressable onPress={tap} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
                <RN.Text style={{ color: "rgba(128,128,128,0.35)", fontSize: 12 }}>
                    {open ? "▲" : storage.label ?? ""}
                </RN.Text>
            </RN.Pressable>
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

export default {
    onLoad() {
        try {
            storage.users ??= [];
            storage.label ??= "";
            storage.credentialId ??= null;
            unpatch = patchFriendsScreen();
            if (!unpatch) showToast("Hidden Friends: FriendsScreen not found, tell anika the Discord version");
        } catch (e: any) {
            showToast(`Hidden Friends failed to load: ${e?.message ?? e}`);
            throw e;
        }
    },
    onUnload() {
        unpatch?.();
        unpatch = undefined;
    },
    settings: Settings,
};
