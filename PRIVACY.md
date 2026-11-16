# Privacy Policy — Coding Keyboard Simulator

**Effective date:** November 16, 2026
**Applies to:** Coding Keyboard Simulator, version 1.0.0 and later (Chrome extension)

## Summary

Coding Keyboard Simulator does not collect, store, transmit, sell, or share any personal data. Everything the extension does happens locally in your browser. It has no server, no account system, no analytics, and no tracking.

## What the extension does

When you press a keyboard shortcut (default `Alt+V` for human-style typing, `Alt+Shift+V` for direct paste), the extension reads the text on your clipboard and types or pastes it into the code editor or text field you have focused on the current page, with smart indentation and bracket handling.

## Data the extension accesses

| Data | Why it is accessed | Where it goes |
| --- | --- | --- |
| **Clipboard text** | To get the code you want typed or pasted. It is read only when you press one of the extension's shortcuts. | Held in memory only long enough to type or paste it into the focused editor. Never saved, logged, or sent anywhere. |
| **Text near the cursor in the focused editor** (for example, the current line's indentation) | To match indentation and handle brackets correctly. | Used locally in the page and discarded. Never saved, logged, or sent anywhere. |
| **Your keyboard shortcut settings** | To display the current shortcuts in the popup. | Read from Chrome's own shortcut settings. The extension does not store them. |

## Data the extension does NOT collect

- No personal information, browsing history, or page content is collected.
- No cookies, local storage, or other persistent identifiers are created.
- No usage statistics, analytics, crash reports, or telemetry.
- No network requests are made by the extension. It contains no code that contacts any server, and it loads no remote scripts, fonts, or images.

## Permissions and why they are needed

- **`activeTab`**: Lets the extension work on the tab you are using, only after you press a shortcut. Nothing is injected into any site until then.
- **`scripting`**: Used to run the typing and paste logic in the active tab after you press a shortcut.
- **`clipboardRead`**: Used to read the clipboard text you want to type or paste.
- **`offscreen`**: Used to create a hidden helper page that reads the clipboard reliably, because Chrome's background service worker cannot access the clipboard directly.

The extension does not request access to all websites, your browsing history, cookies, or tabs' contents outside of the tab where you invoke it.

## Third parties

The extension does not share data with anyone, because it does not collect any. It uses no third-party services, SDKs, or advertising networks.

The popup includes a **Report a bug** button. Clicking it opens a pre-filled issue page on GitHub in a new tab, containing the extension version and your browser's user-agent string. Nothing is sent until you review it and choose to submit it on GitHub, and what you submit there is governed by [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Children's privacy

The extension collects no data from anyone, including children.

## Changes to this policy

If a future version changes how the extension handles data, this policy will be updated and the effective date above will change. Any change that involves collecting data would be clearly described here before it ships.

## Contact

Questions or concerns? Open an issue at
<https://github.com/aman-nitb-cse/Coding-keyboard-simulator/issues>
