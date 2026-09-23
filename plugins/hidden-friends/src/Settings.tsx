import { findByProps, findByStoreName } from "@vendetta/metro";
import { React, ReactNative as RN, stylesheet } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { semanticColors } from "@vendetta/ui";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";

import { refreshLists } from "./hide";
import { hasPin, mode, setPin, validPin } from "./lock";

// Discord 345.9 has no FormRow any more; these are the redesign components.
// Every lookup happens at render time and falls back to plain RN, so a rename
// can't blank the page.
const tableKit = () => findByProps("TableRow", "TableRowGroup");

function asset(name: string) {
    try {
        const id = getAssetIDByName(name);
        return typeof id === "number" ? id : undefined;
    } catch {
        return undefined;
    }
}

function makeStyles() {
    const hex = {
        text: { color: "#dbdee1", fontSize: 16 },
        muted: { color: "#949ba4", fontSize: 13 },
        helper: { color: "#949ba4", fontSize: 12, paddingHorizontal: 16, paddingTop: 6 },
        input: { color: "#dbdee1", backgroundColor: "#1e1f22", margin: 16, marginBottom: 0, padding: 12, borderRadius: 8 },
        placeholder: { backgroundColor: "#5865f2" },
    };
    // Semantic colour keys are only valid inside createThemedStyleSheet; never hand them to RN raw.
    const sc: any = semanticColors;
    if (!sc || typeof stylesheet?.createThemedStyleSheet !== "function") return hex;
    try {
        return stylesheet.createThemedStyleSheet({
            text: { ...hex.text, color: sc.TEXT_NORMAL ?? hex.text.color },
            muted: { ...hex.muted, color: sc.TEXT_MUTED ?? hex.muted.color },
            helper: { ...hex.helper, color: sc.TEXT_MUTED ?? hex.helper.color },
            input: { ...hex.input, color: sc.TEXT_NORMAL ?? hex.input.color, backgroundColor: sc.BACKGROUND_TERTIARY ?? hex.input.backgroundColor },
            placeholder: { backgroundColor: sc.BACKGROUND_ACCENT ?? hex.placeholder.backgroundColor },
        }) ?? hex;
    } catch {
        return hex;
    }
}

function user(id: string) {
    try {
        return findByStoreName("UserStore")?.getUser?.(id);
    } catch {
        return undefined;
    }
}

function avatarSource(u: any) {
    try {
        const src = u?.getAvatarURL?.(undefined, 64) ?? findByProps("getUserAvatarURL")?.getUserAvatarURL?.(u, false, 64);
        if (typeof src === "string") return { uri: src };
        if (typeof src === "number") return src; // bundled default avatar
    } catch {}
    return undefined;
}

function Avatar({ u, s }: { u: any; s: any }) {
    const src = u ? avatarSource(u) : undefined;
    const size = { width: 32, height: 32, borderRadius: 16 };
    if (src) return <RN.Image source={src} style={size} />;
    const letter = (u?.globalName ?? u?.username ?? "?").charAt(0).toUpperCase();
    return (
        <RN.View style={[size, s.placeholder, { alignItems: "center", justifyContent: "center" }]}>
            <RN.Text style={{ color: "#fff", fontWeight: "bold" }}>{letter}</RN.Text>
        </RN.View>
    );
}

function Row({ label, subLabel, icon, trailing, onPress, s }: { label: string; subLabel?: string; icon?: any; trailing?: any; onPress?: () => void; s: any }) {
    const TableRow = tableKit()?.TableRow;
    if (TableRow) return <TableRow label={label} subLabel={subLabel} icon={icon} trailing={trailing} onPress={onPress} />;
    return (
        <RN.Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
            {icon}
            <RN.View style={{ flex: 1 }}>
                <RN.Text style={s.text}>{label}</RN.Text>
                {subLabel ? <RN.Text style={s.muted}>{subLabel}</RN.Text> : null}
            </RN.View>
            {trailing}
        </RN.Pressable>
    );
}

function RowIcon({ name }: { name: string }) {
    const id = asset(name);
    const TableRowIcon = tableKit()?.TableRowIcon;
    if (id === undefined) return null;
    if (TableRowIcon) return <TableRowIcon source={id} />;
    return <RN.Image source={id} style={{ width: 24, height: 24, tintColor: "#b5bac1" }} />;
}

function Group({ title, children }: { title: string; children: any }) {
    const TableRowGroup = tableKit()?.TableRowGroup;
    if (TableRowGroup) return <RN.View style={{ marginTop: 16 }}><TableRowGroup title={title}>{children}</TableRowGroup></RN.View>;
    return (
        <RN.View style={{ marginTop: 16 }}>
            <RN.Text style={{ color: "#949ba4", fontSize: 12, paddingHorizontal: 16, paddingBottom: 4 }}>{title.toUpperCase()}</RN.Text>
            {children}
        </RN.View>
    );
}

// Helper text is rendered by us, not via a prop, because the prop name varies.
function Input({ label, placeholder, value, onChange, s }: { label: string; placeholder?: string; value: string; onChange: (v: string) => void; s: any }) {
    const TextInput = findByProps("TextInput")?.TextInput;
    if (TextInput) return <TextInput label={label} placeholder={placeholder} value={value} onChange={onChange} isClearable />;
    return (
        <RN.View>
            <RN.Text style={[s.muted, { paddingHorizontal: 16, paddingTop: 8 }]}>{label}</RN.Text>
            <RN.TextInput placeholder={placeholder} placeholderTextColor="#6d6f78" value={value} onChangeText={onChange} style={s.input} />
        </RN.View>
    );
}

function names(id: string) {
    const u = user(id);
    const display = u?.globalName ?? u?.username ?? "Unknown user";
    const handle = u?.username ? `@${u.username}` : id;
    return { u, display, handle };
}

function searchFriends(query: string, exclude: string[]) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    let ids: string[] = [];
    try {
        ids = findByStoreName("RelationshipStore")?.getFriendIDs?.() ?? [];
    } catch {}
    const out: string[] = [];
    // ponytail: linear scan over all friends per keystroke, fine up to a few thousand
    for (const id of ids) {
        if (exclude.includes(id)) continue;
        const u = user(id);
        const hay = `${u?.globalName ?? ""} ${u?.username ?? ""}`.toLowerCase();
        if (hay.includes(q)) out.push(id);
        if (out.length >= 30) break;
    }
    return out;
}

export default function Settings() {
    useProxy(storage);
    const s = makeStyles();
    const [query, setQuery] = React.useState("");
    const [newPin, setNewPin] = React.useState("");

    const users: string[] = Array.isArray(storage.users) ? [...storage.users] : [];
    const results = searchFriends(query, users);
    const rawId = query.trim();
    const isRawId = /^\d{15,22}$/.test(rawId) && !users.includes(rawId);

    const add = (id: string) => {
        if (users.includes(id)) return;
        storage.users = [...users, id]; // replace wholesale, safe with the storage proxy
        refreshLists();
        setQuery("");
        showToast(`Added ${names(id).display}`);
    };
    const remove = (id: string) => {
        storage.users = users.filter((x) => x !== id);
        refreshLists();
        showToast(`Removed ${names(id).display}`);
    };

    const trashId = asset("TrashIcon");
    const removeButton = (id: string) => (
        <RN.Pressable onPress={() => remove(id)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Remove">
            {trashId !== undefined
                ? <RN.Image source={trashId} style={{ width: 20, height: 20, tintColor: "#f23f43" }} />
                : <RN.Text style={{ color: "#f23f43" }}>Remove</RN.Text>}
        </RN.Pressable>
    );

    return (
        <RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
            <Group title="People">
                {users.length === 0
                    ? <Row s={s} label="No one yet" subLabel="Search below to add someone. They disappear from Messages and Friends and only show in the vault." />
                    : users.map((id) => {
                        const n = names(id);
                        return <Row key={id} s={s} label={n.display} subLabel={n.handle} icon={<Avatar u={n.u} s={s} />} trailing={removeButton(id)} />;
                    })}
            </Group>

            <Group title="Add person">
                <Input s={s} label="Search your friends" placeholder="Name or username, or paste a user ID" value={query} onChange={setQuery} />
                {isRawId && <Row s={s} label={`Add ID ${rawId}`} subLabel={user(rawId) ? names(rawId).display : "Not in your cache, it may show as the ID"} icon={<RowIcon name="UserPlusIcon" />} onPress={() => add(rawId)} />}
                {results.map((id) => {
                    const n = names(id);
                    return <Row key={id} s={s} label={n.display} subLabel={n.handle} icon={<Avatar u={n.u} s={s} />} trailing={<RowIcon name="PlusSmallIcon" />} onPress={() => add(id)} />;
                })}
                {query.trim() !== "" && !isRawId && results.length === 0 && <Row s={s} label="No friends match" subLabel="Try another name, or paste their user ID." />}
            </Group>

            <Group title="Row">
                <Input s={s} label="Row text" placeholder="Leave blank for the default" value={storage.label ?? ""} onChange={(v: string) => (storage.label = v)} />
                <RN.Text style={s.helper}>Shown faintly at the bottom of the Friends tab. Tap it to unlock your list.</RN.Text>
            </Group>

            <Group title="Lock">
                <Row
                    s={s}
                    icon={<RowIcon name={mode() === "pin" ? "CheckmarkLargeIcon" : "CircleIcon"} />}
                    label="PIN"
                    subLabel={hasPin() ? "Set. Works on any build." : "Not set yet. The first tap on the pill asks for one."}
                    onPress={() => { storage.lockMode = "pin"; }}
                />
                <Row
                    s={s}
                    icon={<RowIcon name={mode() === "passkey" ? "CheckmarkLargeIcon" : "CircleIcon"} />}
                    label="Fingerprint (passkey)"
                    subLabel="Needs a domain of yours with assetlinks.json for this Revenge install. See README. Bitwarden or Google Password Manager will refuse otherwise."
                    onPress={() => { storage.lockMode = "passkey"; }}
                />
                {mode() === "pin" && (
                    <Input s={s} label="Change PIN (4 to 8 digits)" placeholder="New PIN" value={newPin} onChange={setNewPin} />
                )}
                {mode() === "pin" && validPin(newPin) && (
                    <Row s={s} label="Save new PIN" onPress={() => { setPin(newPin); setNewPin(""); showToast("PIN changed"); }} />
                )}
                {mode() === "passkey" && (
                    <Input s={s} label="Passkey domain (rpId)" placeholder="discord.com" value={storage.rpId ?? ""} onChange={(v: string) => (storage.rpId = v.trim())} />
                )}
                {mode() === "passkey" && (
                    <Row
                        s={s}
                        icon={<RowIcon name="RetryIcon" />}
                        label={storage.credentialId ? "Reset passkey (enrolled)" : "Reset passkey (not enrolled)"}
                        subLabel="Forgets the passkey. Delete the old entry in your password manager yourself."
                        onPress={() => { delete storage.credentialId; showToast("Passkey reset. Next tap on the pill enrols a new one."); }}
                    />
                )}
            </Group>
        </RN.ScrollView>
    );
}
