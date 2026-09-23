import { React, ReactNative as RN } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";
import { showToast } from "@vendetta/ui/toasts";

const { FormSection, FormRow, FormInput, FormDivider } = Forms;

export default function Settings() {
    useProxy(storage);
    const [ids, setIds] = React.useState((storage.users as string[]).join(", "));

    const save = () => {
        storage.users = ids.split(/[\s,]+/).filter((s) => /^\d{15,22}$/.test(s));
        setIds(storage.users.join(", "));
        showToast(`Saved ${storage.users.length} user${storage.users.length === 1 ? "" : "s"}`);
    };

    return (
        <RN.ScrollView>
            <FormSection title="People">
                <FormInput
                    title="User IDs (comma separated)"
                    placeholder="123456789012345678, 234567890123456789"
                    value={ids}
                    onChange={setIds}
                    onBlur={save}
                />
                <FormRow label="Save" onPress={save} />
            </FormSection>
            <FormSection title="Row">
                <FormInput
                    title="Row text (blank = invisible row)"
                    placeholder=""
                    value={storage.label}
                    onChange={(v: string) => (storage.label = v)}
                />
            </FormSection>
            <FormSection title="Lock">
                <FormRow
                    label={storage.credentialId ? "Lock enrolled" : "Lock not enrolled yet (first tap on the row enrols it)"}
                    subLabel="Uses a local passkey so Android asks for fingerprint or screen lock. Shows up in Google Password Manager as 'hidden-friends-lock' under discord.com. Never used to log in."
                />
                <FormDivider />
                <FormRow
                    label="Reset lock"
                    subLabel="Forgets the passkey id. Delete the old one from Google Password Manager yourself."
                    onPress={() => { storage.credentialId = null; showToast("Lock reset"); }}
                />
            </FormSection>
        </RN.ScrollView>
    );
}
