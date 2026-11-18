# Salah-e-Waqt Admin

Web version of the app's super admin section, hosted on GitHub Pages.

- **Azan approvals:** listen to custom Azans uploaded by Moazzams; approve or reject with a reason.
- **Registrations:** approve a masjid (creates its masjid record and login) or reject it, then send the WhatsApp message.
- **Subscribers:** followers and weekly active users per masjid, on a map and in a table.

## How it works

The site is plain HTML, CSS and JavaScript with no build step. It holds no secrets and never writes to Firebase itself.
Every read and every change goes through the `superAdminApi` Cloud Function (in the app repo, `functions/index.js`):

1. Sign in with the same super admin username and password as the app. The function checks
   `users/{username}.password` and `super_admins/{username}`, then returns a signed session that lasts 12 hours.
2. Every later call sends that session. The function checks the signature and that the login is still in
   `super_admins`, so deleting the `super_admins` document signs that person out straight away.
3. Five wrong passwords lock that username for 15 minutes.

## Deploying

- **Site:** push to `main`. GitHub Pages serves the repo root (Settings → Pages → Deploy from branch → `main` / root).
- **API:** from the app repo:
  `firebase deploy --only functions:superAdminApi --project salah-e-waqt-mobile`
  The session signing key is the `ADMIN_SESSION_SECRET` secret
  (`firebase functions:secrets:set ADMIN_SESSION_SECRET`). Changing it signs everyone out.

The API address is in `config.js`.
