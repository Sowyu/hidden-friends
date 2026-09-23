import { findByName, findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";

import { isAvailable, unlock } from "./lock";
import Settings from "./Settings";

const { FormRow } = Forms;
const UserStore = findByStoreName("UserStore");
const { openPrivateChannel } = findByProps("openPrivateChannel");

storage.users ??= [] as string[]; // user IDs
storage.label ??= "";             // text on the hidden row; empty = blank row
storage.credentialId ??= null;    // passkey id once enrolled

const UNLOCK_MS = 60_000; // list hides itself again after a minute

function displayName(id: string) {
    const u = UserStore.getUser?.(id);
    return u?.globalName ?? u?.username ?? id;
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

    return (
        <RN.View>
            {open && (storage.users as string[]).map((id) => (
                <FormRow
                    key={id}
                    label={displayName(id)}
                    onPress={() => { setOpen(false); openPrivateChannel(id); }}
                />
            ))}
            {open && storage.users.length === 0 && (
                <FormRow label="No one added yet. Add user IDs in the plugin settings." />
            )}
            <RN.Pressable onPress={tap} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 16 }}>
                <RN.Text style={{ color: "rgba(128,128,128,0.35)", fontSize: 12 }}>
                    {open ? "▲" : storage.label}
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
        unpatch = patchFriendsScreen();
        if (!unpatch) showToast("Hidden Friends: FriendsScreen not found, tell anika the Discord version");
    },
    onUnload() {
        unpatch?.();
    },
    settings: Settings,
};
