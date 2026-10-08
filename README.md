# Current | Token Payment Register

A three-view electricity token payment register using Firebase Authentication and Firebase Realtime Database. The browser app uses Firebase's modular JavaScript SDK through ES module imports; there are no downloaded SDK bundles in this project.

## Configure Firebase

1. Create a Firebase project and register a Web app.
2. Enable **Email/Password** and **Google** providers in Authentication > Sign-in method.
3. Create a Realtime Database.
4. Fill in the Web app values in `firebase-config.js`, including the exact Realtime Database URL shown in Firebase Console. The register uses Kenyan shillings (`KES`).
5. Publish the rules in `database.rules.json` in Realtime Database > Rules.
6. Serve this directory over HTTP (ES modules do not work from `file://`). For example, use VS Code Live Server or `npx serve .`.
7. In Authentication > Settings > Authorized domains, add the exact host used in the browser. Firebase commonly includes `localhost`; if the browser URL uses `127.0.0.1`, add `127.0.0.1` too. For a deployed site, add its production domain.

If account creation returns `auth/operation-not-allowed`, enable **Email/Password** under Authentication > Sign-in method in the Firebase Console, then retry.

The app has account access, payment entry/confirmation, and a monthly register. A payment contains a Firebase UID, display name, numeric amount, client timestamp, and confirmation flag. The register listens to the selected month in real time; the current month is selected automatically and navigation does not allow future months.

## Important access-code security note

`GodiaHouse` is checked in `app.js` to match the requested simple shared-code flow. A code embedded in browser JavaScript is visible to anyone who can load the site, so this is a convenience gate, not secure authorization. Realtime Database rules protect data from unauthenticated users and restrict each account to creating/deleting its own records, but every authenticated account can read the shared register. For a genuinely private community, replace the client-side code check with server-side verification (for example, a callable Cloud Function that grants a Firebase custom claim) and change the database read rules to require that claim. Never put a production secret in `app.js` or `firebase-config.js`.

The configured Firebase Web API key identifies the Firebase project; it is not a server secret. Secure the project with Authentication, Realtime Database rules, provider configuration, and appropriate Firebase App Check / quota settings.
