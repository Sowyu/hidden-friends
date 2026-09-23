import { findByProps } from "@vendetta/metro";
import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { showToast } from "@vendetta/ui/toasts";

// Discord 345.9 has no FormRow any more; these are the redesign components.
// Every one falls back to plain RN so a rename can't blank the page.
function Row({ label, subLabel, onPress }: { label: string; subLabel?: string; onPress?: () => void }) {
    const TableRow = findByProps("TableRow", "TableRowGroup")?.TableRow;
    if (TableRow) return <TableRow label={label} subLabel={subLabel} onPress={onPress} />;
    return (
        <RN.Pressable onPress={onPress} style={{ padding: 16 }}>
            <RN.Text style={{ color: "#dbdee1", fontSize: 16 }}>{label}</RN.Text>
            {subLabel ? <RN.Text style={{ color: "#949ba4", fontSize: 13 }}>{subLabel}</RN.Text> : null}
        </RN.Pressable>
    );
}

function Group({ title, children }: { title: string; children: any }) {
    const TableRowGroup = findByProps("TableRow", "TableRowGroup")?.TableRowGroup;
    if (TableRowGroup) return <TableRowGroup title={title}>{children}</TableRowGroup>;
    return (
        <RN.View style={{ marginTop: 16 }}>
            <RN.Text style={{ color: "#949ba4", fontSize: 12, paddingHorizontal: 16 }}>{title.toUpperCase()}</RN.Text>
            {children}
        </RN.View>
    );
}

function Input(props: { label: string; placeholder?: string; value: string; onChange: (v: string) => void; onBlur?: () => void }) {
    const TextInput = findByProps("TextInput")?.TextInput;
    if (TextInput) return <TextInput {...props} />;
    return (
        <RN.TextInput
            placeholder={props.placeholder}
            placeholderTextColor="#6d6f78"
            value={props.value}
            onChangeText={props.onChange}
            onBlur={props.onBlur}
            style={{ color: "#dbdee1", backgroundColor: "#1e1f22", margin: 16, padding: 12, borderRadius: 8 }}
        />
    );
}

export default function Settings() {
    useProxy(storage);
    const [ids, setIds] = React.useState(((storage.users ?? []) as string[]).join(", "));

    const save = () => {
        storage.users = ids.split(/[\s,]+/).filter((s) => /^\d{15,22}$/.test(s));
        setIds(storage.users.join(", "));
        showToast(`Saved ${storage.users.length} user${storage.users.length === 1 ? "" : "s"}`);
    };

    return (
        <RN.ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, paddingBottom: 48 }}>
            <Group title="People">
                <Input
                    label="User IDs (comma separated)"
                    placeholder="123456789012345678, 234567890123456789"
                    value={ids}
                    onChange={setIds}
                    onBlur={save}
                />
                <Row label="Save" onPress={save} />
            </Group>
            <Group title="Row">
                <Input
                    label="Row text (blank = invisible row)"
                    placeholder=""
                    value={storage.label ?? ""}
                    onChange={(v: string) => (storage.label = v)}
                />
            </Group>
            <Group title="Lock">
                <Row
                    label={storage.credentialId ? "Lock enrolled" : "Lock not enrolled yet (first tap on the row enrols it)"}
                    subLabel="Uses a local passkey so Android asks for fingerprint or screen lock. Shows up in Google Password Manager as 'hidden-friends-lock' under discord.com. Never used to log in."
                />
                <Row
                    label="Reset lock"
                    subLabel="Forgets the passkey id. Delete the old one from Google Password Manager yourself."
                    onPress={() => { delete storage.credentialId; showToast("Lock reset"); }}
                />
            </Group>
        </RN.ScrollView>
    );
}
