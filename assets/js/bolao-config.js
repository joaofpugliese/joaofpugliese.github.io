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
  apiKey: "AIzaSyAz9w3At0VnXo7kEzPZZ68aSHVoTUiRH7k",
  authDomain: "bolao-a6f50.firebaseapp.com",
  databaseURL: "https://bolao-a6f50-default-rtdb.firebaseio.com",
  projectId: "bolao-a6f50",
  storageBucket: "bolao-a6f50.firebasestorage.app",
  messagingSenderId: "533383056762",
  appId: "1:533383056762:web:1b85753a87005006addac3"
};
