# WhisperRoom — Ephemeral Zero-Trace Private Web Chat

WhisperRoom is a browser-native private chat app designed to eliminate app installations, account creation, and digital footprints.

## Key Features

1. **Zero Install & Web-Native**:
   - Open Chrome (or any browser) and click **"Launch Disposable Room"**.
   - No accounts, no phone numbers, no downloads.

2. **Knock-to-Join (Waiting Room)**:
   - Copy the room invite link and send it to your contact.
   - When the contact clicks the link, they cannot enter immediately — they knock.
   - Host sees a live banner with **Accept** or **Decline**.
   - Once accepted, the guest is admitted into the secure session.

3. **In-Memory & Ephemeral**:
   - Zero database, zero disk logs, zero file saving.
   - Chat history exists strictly inside active browser memory/RAM.
   - Anti-cache headers (`Cache-Control: no-store, no-cache, must-revalidate, private`) prevent Chrome from caching pages.

4. **Self-Destruct & Wipe Controls**:
   - **"Clear"**: Instantly purges all messages across both screens.
   - **"Close Session"**: Immediately severs the connection, wipes in-memory tables, clears session tokens, and leaves no trace behind.
   - **Auto-wipe**: Closing the tab or leaving unloads all states automatically.

---

## Getting Started

### 1. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in Chrome.

### 2. Production Build & Start
```bash
npm run build
npm start
```
