import "server-only";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Google Drive authorization is not configured.");
  return value;
}

async function driveAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: required("GOOGLE_OAUTH_REFRESH_TOKEN"),
      grant_type: "refresh_token"
    }),
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as { access_token?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error("Google Drive permission is not active yet. Re-authorize Google from Owner Setup and replace the Preview refresh token.");
  }
  return payload.access_token;
}

export async function uploadPhotographerImage(file: File, photographerId: string, kind: "profile" | "hero") {
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Choose a JPG, PNG or WebP image up to 8 MB.");
  }

  const token = await driveAccessToken();
  const boundary = "lenslight_" + crypto.randomUUID().replaceAll("-", "");
  const metadata = {
    name: `${photographerId}-${kind}-${Date.now()}.${extension}`,
    mimeType: file.type,
    description: `Lens & Light photographer ${kind} image for ${photographerId}`
  };
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    "utf8"
  );
  const suffix = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([prefix, fileBytes, suffix]);

  const uploadResponse = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`
      },
      body,
      cache: "no-store"
    }
  );
  const uploaded = await uploadResponse.json().catch(() => ({})) as { id?: string };
  if (!uploadResponse.ok || !uploaded.id) {
    throw new Error(uploadResponse.status === 403
      ? "Google Drive access is not granted yet. Re-authorize Google with the new Drive file permission."
      : "Google Drive could not store this image. Please try again.");
  }

  const permissionResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(uploaded.id)}/permissions`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader" }),
      cache: "no-store"
    }
  );
  if (!permissionResponse.ok) {
    // Do not return a URL that visitors cannot read.
    throw new Error("The image was uploaded, but Google Drive could not enable public viewing. Check Drive sharing settings and try again.");
  }

  return {
    fileId: uploaded.id,
    url: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(uploaded.id)}`
  };
}
