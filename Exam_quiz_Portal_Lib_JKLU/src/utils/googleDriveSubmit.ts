/**
 * Zero-DB-Storage Client-Side Google Drive Uploader & Direct Link Validator
 * --------------------------------------------------------------------------
 * 1. Computes a SHA-256 fingerprint of the file in the browser so faculty can detect
 *    if a student modifies a linked Google Drive file after the deadline.
 * 2. When `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is configured, uploads student files directly
 *    from Browser -> Student's Google Drive (`drive.file` scope) and automatically grants
 *    `reader` access to the Course Professors' and TAs' `@jklu.edu.in` emails.
 * 3. Never fabricates fake/dead Drive URLs: if Google OAuth is not configured on this
 *    environment, students submit real verified external links via Direct Link mode.
 */

export const MAX_FACULTY_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB limit for faculty notes & assignments
export const FACULTY_ALLOWED_ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const FACULTY_ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx']);
const FACULTY_ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export interface FacultyDriveUploadResult {
  url: string;
  drive_file_id: string;
  file_name: string;
  file_size: number;
  file_sha256: string;
  shared_anyone: boolean;
}

export function validateFacultyResourceFile(file: File): { valid: boolean; error?: string } {
  const ext = String(file.name.split('.').pop() || '').toLowerCase();
  const mime = String(file.type || '').toLowerCase();
  const isAllowedType =
    FACULTY_ALLOWED_EXTENSIONS.has(ext) || (mime !== '' && FACULTY_ALLOWED_MIMES.has(mime));

  if (!isAllowedType) {
    return {
      valid: false,
      error: 'Only PDF, DOC, or DOCX files are supported for direct upload (or paste any https:// link instead).',
    };
  }
  if (file.size <= 0) {
    return { valid: false, error: 'Selected file is empty.' };
  }
  if (file.size > MAX_FACULTY_UPLOAD_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is ${sizeMb} MB, which exceeds the 10 MB limit. Compress the file or paste a direct link instead.`,
    };
  }
  return { valid: true };
}

/**
 * Uploads a faculty Note or Assignment sheet (PDF / DOC / DOCX, <= 10 MB) directly from the
 * browser to the professor's Google Drive and enables unlisted link-viewer access so all
 * enrolled students (including Microsoft 365 @jklu.edu.in accounts) can view it immediately.
 */
export async function uploadFacultyResourceToGoogleDrive(params: {
  file: File;
  courseCode: string;
  category: 'NOTES' | 'ASSIGNMENT';
  onProgress?: (stage: string, pct: number) => void;
}): Promise<FacultyDriveUploadResult> {
  const { file, courseCode, category, onProgress } = params;
  const check = validateFacultyResourceFile(file);
  if (!check.valid) {
    throw new Error(check.error || 'Invalid file.');
  }

  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) {
    throw new Error(
      'Google Drive OAuth (NEXT_PUBLIC_GOOGLE_CLIENT_ID) is not configured. Please paste a direct https:// link instead.'
    );
  }

  onProgress?.('Validating & computing SHA-256 fingerprint...', 15);
  const fileSha256 = await computeFileSha256(file);

  onProgress?.('Connecting to your Google Drive...', 30);
  const accessToken = await requestGoogleDriveAccessToken(clientId);

  onProgress?.(`Uploading "${file.name}" to Google Drive...`, 55);
  const tag = category === 'NOTES' ? 'Notes' : 'Assignment';
  const metadata = {
    name: `[${courseCode}] [${tag}] ${file.name}`,
    mimeType: file.type || 'application/octet-stream',
    description: `Learn JKLU 2.0 ${tag} for ${courseCode} (SHA-256: ${fileSha256})`,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,modifiedTime',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(`Google Drive upload failed (${uploadRes.status})`);
  }
  const uploaded = await uploadRes.json();
  const fileId = String(uploaded.id);
  const webViewLink =
    uploaded.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;

  onProgress?.('Enabling student viewing link...', 82);
  let sharedAnyone = false;
  try {
    const permRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
          allowFileDiscovery: false,
        }),
      }
    );
    sharedAnyone = permRes.ok;
  } catch {
    sharedAnyone = false;
  }

  onProgress?.('Uploaded to Google Drive!', 100);
  return {
    url: webViewLink,
    drive_file_id: fileId,
    file_name: file.name,
    file_size: file.size,
    file_sha256: fileSha256,
    shared_anyone: sharedAnyone,
  };
}

export interface DriveUploadResult {
  submission_url: string;
  drive_file_id: string;
  file_name: string;
  file_size: number;
  file_sha256: string;
  drive_modified_time?: string;
  upload_mode: 'GOOGLE_DRIVE_AUTO' | 'DIRECT_LINK';
  shared_with_emails: string[];
  shared_with_prof: boolean;
}

export function isGoogleDriveOAuthConfigured(): boolean {
  return Boolean((process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim());
}

export async function computeFileSha256(file: File): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }
  const buffer = await file.arrayBuffer();
  const digest = await window.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractDriveFileId(url: string): string | null {
  const clean = String(url || '').trim();
  const matchD = clean.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (matchD) return matchD[1];
  const matchFolder = clean.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (matchFolder) return matchFolder[1];
  const matchId = clean.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (matchId) return matchId[1];
  return null;
}

export function getDriveEmbedPreviewUrl(urlOrFileId: string): string | null {
  const fileId =
    extractDriveFileId(urlOrFileId) ||
    (/^[a-zA-Z0-9_-]{12,}$/.test(urlOrFileId) ? urlOrFileId : null);
  if (!fileId) return null;
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

export function validateSubmissionLink(url: string): {
  valid: boolean;
  provider: string;
  warning?: string;
} {
  const clean = String(url || '').trim();
  if (!/^https?:\/\/.+/i.test(clean)) {
    return { valid: false, provider: 'Invalid URL', warning: 'URL must start with https://' };
  }
  if (/drive\.google\.com|docs\.google\.com/i.test(clean)) {
    const fileId = extractDriveFileId(clean);
    return {
      valid: true,
      provider: 'Google Drive / Docs',
      warning: fileId
        ? undefined
        : 'Tip: Use a specific Google Drive file share link (/file/d/<ID>/view) and set access to "Anyone with the link (Viewer)" so @jklu.edu.in faculty can preview it.',
    };
  }
  if (/onedrive\.live\.com|1drv\.ms|sharepoint\.com/i.test(clean)) {
    return { valid: true, provider: 'Microsoft OneDrive / SharePoint' };
  }
  if (/github\.com|gitlab\.com/i.test(clean)) {
    return { valid: true, provider: 'GitHub / GitLab Repository' };
  }
  if (/colab\.research\.google\.com/i.test(clean)) {
    return { valid: true, provider: 'Google Colab Notebook' };
  }
  if (/figma\.com/i.test(clean)) {
    return { valid: true, provider: 'Figma Design File' };
  }
  if (/overleaf\.com/i.test(clean)) {
    return { valid: true, provider: 'Overleaf LaTeX Project' };
  }
  return { valid: true, provider: 'External Web Link' };
}

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GSI_LOAD_TIMEOUT_MS = 10000;
let gsiLoadPromise: Promise<void> | null = null;

/**
 * Lazily injects the Google Identity Services script (`gsi/client`) once and waits
 * until `window.google.accounts.oauth2` is available. Resets on error or timeout
 * so subsequent user attempts can retry cleanly.
 */
export function ensureGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser environment.'));
  }
  const w = window as any;
  if (w.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gsiLoadPromise) {
    return gsiLoadPromise;
  }

  gsiLoadPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finishSuccess = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (w.google?.accounts?.oauth2) {
        resolve();
      } else {
        gsiLoadPromise = null;
        reject(new Error('Google Identity Services loaded without OAuth2 support.'));
      }
    };
    const finishError = (msg: string, scriptEl?: HTMLScriptElement) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      gsiLoadPromise = null;
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
      reject(new Error(msg));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SCRIPT_SRC}"]`
    );
    const script = existing || document.createElement('script');

    const timer = window.setTimeout(() => {
      finishError('Timed out loading Google Identity Services script.', existing ? undefined : script);
    }, GSI_LOAD_TIMEOUT_MS);

    script.addEventListener('load', finishSuccess, { once: true });
    script.addEventListener(
      'error',
      () => finishError('Failed to load Google Identity Services script.', script),
      { once: true }
    );

    if (!existing) {
      script.src = GSI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return gsiLoadPromise;
}

async function requestGoogleDriveAccessToken(clientId: string): Promise<string> {
  await ensureGoogleIdentityScript();
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (!w.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services script is not loaded in this browser.'));
      return;
    }
    const tokenClient = w.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp: any) => {
        if (resp?.error) {
          reject(new Error(resp.error_description || resp.error));
          return;
        }
        resolve(resp.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Uploads a File directly from the student's browser to their Google Drive and shares it
 * with the course Professors and TAs (`shareEmails`).
 * Throws an explicit error if Google OAuth (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`) is not configured.
 */
export async function uploadFileToStudentGoogleDrive(params: {
  file: File;
  courseCode: string;
  studentRollOrName: string;
  shareEmails: string[];
  onProgress?: (stage: string, pct: number) => void;
}): Promise<DriveUploadResult> {
  const { file, courseCode, studentRollOrName, shareEmails, onProgress } = params;
  const clientId = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();

  if (!clientId) {
    throw new Error(
      'Google Drive OAuth (NEXT_PUBLIC_GOOGLE_CLIENT_ID) is not configured in this local environment. Please upload your file to Google Drive/GitHub and submit the real URL via the "Paste Direct Link" tab.'
    );
  }

  onProgress?.('Computing SHA-256 submission integrity fingerprint...', 10);
  const fileSha256 = await computeFileSha256(file);

  onProgress?.('Requesting Google Drive permission (drive.file)...', 25);
  const accessToken = await requestGoogleDriveAccessToken(clientId);

  onProgress?.(`Uploading "${file.name}" directly to your Google Drive...`, 50);
  const metadata = {
    name: `[${courseCode}] ${studentRollOrName} - ${file.name}`,
    mimeType: file.type || 'application/octet-stream',
    description: `Learn JKLU 2.0 Classroom Submission for ${courseCode} (SHA-256: ${fileSha256})`,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,md5Checksum,modifiedTime',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(`Google Drive upload failed (${uploadRes.status})`);
  }
  const uploaded = await uploadRes.json();
  const fileId = String(uploaded.id);
  const webViewLink =
    uploaded.webViewLink || `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;

  const cleanEmails = shareEmails.map((e) => String(e || '').trim()).filter(Boolean);
  const grantedEmails: string[] = [];
  let needsAnyoneFallback = cleanEmails.length === 0;

  onProgress?.(`Granting reader access to ${cleanEmails.length} Course Professor(s) & TA(s)...`, 80);
  for (const email of cleanEmails) {
    try {
      const permRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'user',
            emailAddress: email,
          }),
        }
      );
      if (permRes.ok) {
        grantedEmails.push(email);
      } else {
        // Non-Google emails (such as Microsoft 365 @jklu.edu.in accounts) fail direct sharing with sendNotificationEmail=false
        needsAnyoneFallback = true;
      }
    } catch {
      needsAnyoneFallback = true;
    }
  }

  let linkAnyoneGranted = false;
  if (needsAnyoneFallback) {
    try {
      const anyoneRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            role: 'reader',
            type: 'anyone',
            allowFileDiscovery: false,
          }),
        }
      );
      linkAnyoneGranted = anyoneRes.ok;
    } catch {
      linkAnyoneGranted = false;
    }
  }

  const sharedWithProf =
    (cleanEmails.length > 0 && grantedEmails.length === cleanEmails.length) || linkAnyoneGranted;

  onProgress?.(
    sharedWithProf
      ? 'Saved in your Google Drive & readable by Faculty!'
      : 'Saved in Google Drive (check link access settings if preview is restricted).',
    100
  );
  return {
    submission_url: webViewLink,
    drive_file_id: fileId,
    file_name: file.name,
    file_size: file.size,
    file_sha256: fileSha256,
    drive_modified_time: uploaded.modifiedTime || new Date().toISOString(),
    upload_mode: 'GOOGLE_DRIVE_AUTO',
    shared_with_emails: grantedEmails,
    shared_with_prof: sharedWithProf,
  };
}
