import fs from 'node:fs';
import path from 'node:path';

let envLoaded = false;

function loadLocalEnvFiles() {
  if (envLoaded) return;
  envLoaded = true;
  const cwd = process.cwd();
  const files = ['.env', '.env.local'];
  for (const file of files) {
    const filePath = path.join(cwd, file);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function readEnv(key: string): string | null {
  loadLocalEnvFiles();
  const value = process.env[key];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function appBaseUrl() {
  return readEnv('APP_BASE_URL') ?? readEnv('PUBLIC_APP_URL') ?? 'http://localhost:4321';
}

export async function sendWorkspaceInviteEmail(input: {
  to: string;
  workspaceName: string;
  role: string;
  inviterName: string;
}) {
  const resendApiKey = readEnv('RESEND_API_KEY');
  const fromEmail = readEnv('INVITE_FROM_EMAIL') ?? 'Family Inc <onboarding@resend.dev>';
  if (!resendApiKey) return { sent: false, reason: 'missing_resend_api_key' as const };

  const loginUrl = `${appBaseUrl().replace(/\/+$/, '')}/sign-in`;
  const signUpUrl = `${appBaseUrl().replace(/\/+$/, '')}/sign-up`;
  const subject = `You were invited to ${input.workspaceName} on Family Inc`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#1f1f1d">
      <p><strong>${input.inviterName}</strong> invited you to join <strong>${input.workspaceName}</strong> as <strong>${input.role}</strong>.</p>
      <p>Sign in with this email to accept access automatically.</p>
      <p>
        <a href="${loginUrl}" style="display:inline-block;padding:8px 12px;border:1px solid #1f1f1d;background:#1f1f1d;color:#fff;text-decoration:none;margin-right:8px">Sign In</a>
        <a href="${signUpUrl}" style="display:inline-block;padding:8px 12px;border:1px solid #1f1f1d;color:#1f1f1d;text-decoration:none">Create Account</a>
      </p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.to],
      subject,
      html
    })
  });

  if (!response.ok) {
    const body = await response.text();
    return { sent: false, reason: `resend_error:${response.status}:${body.slice(0, 200)}` as const };
  }
  return { sent: true as const };
}
