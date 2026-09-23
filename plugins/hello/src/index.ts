import { showToast } from "@vendetta/ui/toasts";
export default {
    onLoad() { showToast("Hello Test loaded"); },
    onUnload() { showToast("Hello Test unloaded"); },
};
