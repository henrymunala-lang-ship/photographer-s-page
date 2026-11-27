const required = ["GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: "refresh_token"
  })
});
const token = await tokenResponse.json();
if (!tokenResponse.ok || !token.access_token) {
  console.error("OAuth refresh failed. Check the Vercel credentials and re-authorization status.");
  process.exit(1);
}

const id = encodeURIComponent(process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId,properties.title,sheets.properties(title)`, {
  headers: { authorization: `Bearer ${token.access_token}` }
});
if (!response.ok) {
  console.error(`Workbook verification failed (HTTP ${response.status}). Confirm the file was explicitly authorized for this OAuth app and the Sheets API is enabled.`);
  process.exit(1);
}
const workbook = await response.json();
const expected = [
  "01_REGISTRATIONS", "02_PHOTOGRAPHERS", "03_ADMINS", "04_GALLERY",
  "05_SERVICES", "06_WORKING_HOURS", "07_ENQUIRIES", "08_MESSAGES",
  "09_LIKES", "10_PROFILE_VIEWS", "11_REVIEWS", "12_REPORTS", "13_SETTINGS",
  "14_AUDIT_LOG", "15_PHOTOGRAPHER_SERVICE_AREAS", "16_VERIFICATION_EVENTS",
  "17_CONDUCT_CASES", "18_PLANS_SUBSCRIPTIONS", "19_PHOTO_PRODUCTS",
  "20_PHOTO_ORDERS", "21_ADMIN_INVITATIONS", "22_PHOTOGRAPHER_ALBUMS"
];
const actual = (workbook.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean);
const missing = expected.filter((name) => !actual.includes(name));
console.log(`Connected workbook: ${workbook.properties?.title ?? "(untitled)"}`);
console.log(`Spreadsheet ID matches configured workbook: ${workbook.spreadsheetId === process.env.GOOGLE_SHEETS_SPREADSHEET_ID}`);
console.log(`Tabs found: ${actual.length}/22`);
if (missing.length) {
  console.error("Missing approved tabs:", missing.join(", "));
  process.exit(2);
}
console.log("All 22 approved workbook tabs are present. No data was written.");
