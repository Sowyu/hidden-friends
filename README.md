# Hidden Friends

Bunny / Revenge (Vendetta API) plugin. Adds a near-invisible row under the Friends tab.
Tap it, pass fingerprint or screen lock, and a short list of people appears. Tap one to open the DM.
The list hides again after 60 seconds or after you open a DM.

## Install

1. `pnpm install && pnpm build`
2. Host `dist/hidden-friends/` somewhere that serves `manifest.json` and `index.js` over HTTPS
   (a GitHub repo with the `dist` folder committed works: `https://raw.githubusercontent.com/<you>/<repo>/main/dist/hidden-friends/`).
3. In Bunny/Revenge: Plugins, plus button, paste that URL.
4. Open the plugin settings, paste the user IDs you want, tap Save.

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
