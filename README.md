# Hidden Friends

Bunny / Revenge (Vendetta API) plugin. Adds a faint "Private" pill under the Friends tab (rename it in settings).
People in the vault are hidden from the Messages and Friends lists. Tap the pill, pass fingerprint or screen lock, and the list appears. Tap one to open the DM.
The list hides again after 60 seconds or after you open a DM.

## Install

1. `pnpm install && pnpm build`
2. Host `dist/hidden-friends/` somewhere that serves `manifest.json` and `index.js` over HTTPS
   (a GitHub repo with the `dist` folder committed works: `https://raw.githubusercontent.com/<you>/<repo>/main/dist/hidden-friends/`).
3. In Bunny/Revenge: Plugins, plus button, paste that URL.
4. Open the plugin settings (wrench icon), search a friend by name, tap to add.

## How the lock works

Discord's Android app has no fingerprint prompt module. It does ship a passkey bridge
(`DCDSecurityKeyManager`, backed by Android Credential Manager). The plugin registers one local
passkey on first tap, then asks Android to assert it on every tap. That assertion is what
triggers the fingerprint / PIN prompt. Nothing is sent to Discord.

Side effect: Google Password Manager shows a passkey named `hidden-friends-lock` under
`discord.com`. Do not pick it on the Discord login screen; it is not a login key.
"Reset lock" in settings forgets the id; delete the entry from Password Manager yourself.

Verified against Discord Android 345.9: `FriendsScreen` is a plain default-exported function,
`DCDSecurityKeyManager.authenticatePasskey(requestJson)` takes WebAuthn JSON,
`openPrivateChannel(userId)` navigates to the DM.

## Lock modes

**PIN (default).** First tap on the pill asks you to choose a 4 to 8 digit PIN. Change it in settings.

**Fingerprint (passkey).** Discord's Android app has no fingerprint prompt of its own. The only
route is its passkey bridge, and passkey providers (Bitwarden, Google Password Manager) check the
calling app against the domain's `/.well-known/assetlinks.json`. Revenge Manager signs the patched
app with a key it generates on your phone, so `discord.com` refuses it. To make it work you need a
domain you control:

1. Get the signing cert fingerprint of the installed app (from a PC with adb):
   ```
   adb shell pm list packages | grep -i -e discord -e revenge     # note the package name
   adb pull "$(adb shell pm path <package> | head -1 | cut -d: -f2)" revenge.apk
   apksigner verify --print-certs revenge.apk | grep SHA-256
   ```
2. Host this at `https://<your-domain>/.well-known/assetlinks.json` (content-type application/json), with the package name and the SHA-256 in `AA:BB:...` form:
   ```json
   [{"relation":["delegate_permission/common.handle_all_urls","delegate_permission/common.get_login_creds"],
     "target":{"namespace":"android_app","package_name":"<package>","sha256_cert_fingerprints":["<SHA-256>"]}}]
   ```
3. Plugin settings, Lock: pick "Fingerprint (passkey)", set the passkey domain to `<your-domain>`.
4. Tap the pill. The first tap enrols a passkey named `hidden-friends-lock` under your domain, later taps prompt for fingerprint.

If you reinstall Revenge from a wiped manager, the key changes and step 1 has to be redone.
