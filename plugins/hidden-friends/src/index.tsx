import { find, findByName, findByProps } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { after, before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";

import { patchStores, refreshLists } from "./hide";
import Settings from "./Settings";
import Vault from "./Vault";

// Nothing at module top level may throw: Revenge swallows load errors and the
// toggle just flips back. Every Discord lookup happens at use time.
const MUTED = "#80848e";

function icon(...names: string[]) {
    for (const n of names) {
        try {
            const id = getAssetIDByName(n);
            if (typeof id === "number") return id;
        } catch {}
    }
}

/** The faint pill. Tapping opens the full-screen vault. */
function Pill() {
    useProxy(storage);
    const [open, setOpen] = React.useState(false);
    const lockIcon = icon("LockIcon", "ic_lock");
    return (
        <RN.View>
            <RN.Pressable
                onPress={() => setOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Open private list"
                style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 10, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(128,128,128,0.08)", opacity: 0.35 }}
            >
                {lockIcon !== undefined && <RN.Image source={lockIcon} style={{ width: 14, height: 14, tintColor: MUTED }} />}
                <RN.Text style={{ color: MUTED, fontSize: 12, fontWeight: "500" }}>{storage.label || "Private"}</RN.Text>
            </RN.Pressable>
            <Vault visible={open} onClose={() => setOpen(false)} />
        </RN.View>
    );
}

// Friends tab: fixed footer under the screen.
// ponytail: fixed footer, not a real list item. Becomes a list item if Discord
// exposes the friends section data in a patchable form.
function withFooter(res: any) {
    return (
        <RN.View style={{ flex: 1 }}>
            <RN.View style={{ flex: 1 }}>{res}</RN.View>
            <Pill />
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

// Messages tab: the DM list components take a renderFooter prop, so the pill
// becomes the last row of the list and scrolls with it.
// Discord 345.9: MessagesFlashList / MessagesLegendList / MessagesFastestList,
// each exported as memo(forwardRef(fn)), one of them picked by experiment.
function patchMessagesLists(): (() => void)[] {
    const un: (() => void)[] = [];
    for (const name of ["MessagesFlashList", "MessagesLegendList", "MessagesFastestList"]) {
        const mod = findByName(name, false);
        const exp = mod?.default;
        const target = exp && typeof exp.render === "function" ? exp : exp?.type && typeof exp.type.render === "function" ? exp.type : undefined;
        if (!target) continue;
        un.push(before("render", target, (args) => {
            const props = args[0] ?? {};
            const orig = props.renderFooter;
            args[0] = {
                ...props,
                renderFooter: (...a: any[]) => (
                    <RN.View>
                        {typeof orig === "function" ? orig(...a) : null}
                        <Pill />
                    </RN.View>
                ),
            };
            return args;
        }));
    }
    return un;
}

let unpatchers: (() => void)[] = [];

export default {
    onLoad() {
        try {
            storage.users ??= [];
            storage.label ??= "";
            const friends = patchFriendsScreen();
            if (friends) unpatchers.push(friends);
            else showToast("Hidden Friends: FriendsScreen not found, tell anika the Discord version");
            const lists = patchMessagesLists();
            unpatchers.push(...lists);
            if (lists.length === 0) showToast("Hidden Friends: Messages list not found, pill only on Friends tab");
            const stores = patchStores();
            unpatchers.push(stores.unpatch);
            refreshLists();
            if (stores.hooks < 3) showToast(`Hidden Friends: only ${stores.hooks}/3 list hooks found, people may stay visible`);
        } catch (e: any) {
            showToast(`Hidden Friends failed to load: ${e?.message ?? e}`);
            throw e;
        }
    },
    onUnload() {
        unpatchers.forEach((u) => { try { u(); } catch {} });
        unpatchers = [];
        refreshLists();
    },
    settings: Settings,
};
