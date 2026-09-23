// Hides vault people from the normal Messages and Friends lists.
// Discord 345.9: the Messages tab reads PrivateChannelSortStore.getSortedChannels(),
// which returns [favorites, defaults] of { channelId, lastMessageId, isFavorite, isRequest }, the Friends tab reads
// RelationshipStore.getFriendIDs. Filtering those three getters is enough
// for the lists; badges, search and the quick switcher still see them.
import { findByStoreName } from "@vendetta/metro";
import { after } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";

const hidden = () => new Set<string>(storage.users ?? []);

function isHiddenChannel(chOrId: any) {
    const ChannelStore = findByStoreName("ChannelStore");
    const ch = typeof chOrId === "string" ? ChannelStore?.getChannel?.(chOrId) : (chOrId?.channel ?? chOrId);
    if (!ch || ch.type !== 1) return false; // 1 = DM
    const r = ch.recipients ?? ch.rawRecipients?.map((u: any) => u.id) ?? [];
    return r.length === 1 && hidden().has(r[0]);
}

export function patchStores(): { unpatch: () => void; hooks: number } {
    const ps = findByStoreName("PrivateChannelSortStore");
    const rs = findByStoreName("RelationshipStore");
    const un: (() => void)[] = [];
    if (typeof ps?.getPrivateChannelIds === "function")
        un.push(after("getPrivateChannelIds", ps, (_, ids) => Array.isArray(ids) ? ids.filter((id: string) => !isHiddenChannel(id)) : ids));
    if (typeof ps?.getSortedChannels === "function")
        un.push(after("getSortedChannels", ps, (_, sections) =>
            Array.isArray(sections) ? sections.map((s: any) => Array.isArray(s) ? s.filter((c: any) => !isHiddenChannel(c?.channelId ?? c?.channel ?? c?.id ?? c)) : s) : sections));
    if (typeof rs?.getFriendIDs === "function")
        un.push(after("getFriendIDs", rs, (_, ids) => Array.isArray(ids) ? ids.filter((id: string) => !hidden().has(id)) : ids));
    return { unpatch: () => un.forEach((u) => u()), hooks: un.length };
}

/** Call after storage.users changes so open lists redraw. */
export function refreshLists() {
    for (const name of ["PrivateChannelSortStore", "RelationshipStore"]) {
        try { findByStoreName(name)?.emitChange?.(); } catch {}
    }
}
