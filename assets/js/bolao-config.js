/* ===========================================================================
 * Bolão Copa do Mundo — Firebase configuration
 * ---------------------------------------------------------------------------
 * These values are PUBLIC by design. Anyone visiting the page can read them.
 * Security is enforced by the Realtime Database rules, NOT by hiding this.
 *
 * One-time setup (~5 minutes):
 *   1. https://console.firebase.google.com  →  "Add project"
 *      (you can disable Google Analytics — not needed).
 *   2. In the project: Build → "Realtime Database" → "Create Database".
 *      Pick a location, then start in **test mode** (or locked mode and paste
 *      the rules below).
 *   3. Project settings (gear icon) → "Your apps" → click the </> (Web) icon →
 *      register an app → copy the `firebaseConfig` object it shows you and
 *      paste its values below, replacing the "PASTE_..." placeholders.
 *   4. (Recommended) In Realtime Database → "Rules", paste:
 *        {
 *          "rules": {
 *            "bolao": { ".read": true, ".write": true }
 *          }
 *        }
 *      This is open read/write (fine for a low-stakes pool). Anyone with the
 *      link could in theory clear the draft, so don't share it publicly until
 *      after the draft, or tighten the rules later if you care.
 *
 * After filling this in, commit & push — GitHub Pages will rebuild the site.
 * =========================================================================== */

window.BOLAO_FIREBASE_CONFIG = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_AUTH_DOMAIN",
  databaseURL: "PASTE_DATABASE_URL", // e.g. https://your-project-default-rtdb.firebaseio.com
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_STORAGE_BUCKET",
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};
