// Where the admin API lives (Cloud Function `superAdminApi`).
window.ADMIN_CONFIG = {
  apiUrl: 'https://us-central1-salah-e-waqt-mobile.cloudfunctions.net/superAdminApi',
};

// Store links for the app. Every poster QR code opens get.html, which sends
// Android phones to `android` and iPhones to `ios`. When the iPhone app is
// live, put its App Store link in `ios`: all printed posters then work on
// iPhone too, with no reprint.
window.APP_LINKS = {
  // Printed in every poster QR code. Never change this address.
  get: 'https://zeal-heal19.github.io/salah-e-waqt-superadmin/get.html',
  android: 'https://play.google.com/store/apps/details?id=com.salah_e_waqt.app',
  ios: '', // e.g. 'https://apps.apple.com/app/id0000000000'
};
