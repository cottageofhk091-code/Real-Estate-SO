const AUTH_APP_NAME = '物件セカンドオピニオン';
const DEFAULT_FROM = `${AUTH_APP_NAME} <noreply@cloudflowriver.com>`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fromAddress(): string {
  const raw =
    process.env.AUTH_EMAIL_FROM?.trim() ||
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    DEFAULT_FROM;
  if (raw.includes('<')) return raw;
  return `${AUTH_APP_NAME} <${raw}>`;
}

function buttonEmailHtml(input: {
  heading: string;
  body: string;
  buttonLabel: string;
  actionUrl: string;
}): string {
  const url = escapeHtml(input.actionUrl);
  return `
  <div style="margin:0;padding:24px;background:#f8fafc;font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN',Meiryo,sans-serif;color:#1e293b;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 24px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#2563eb;">${escapeHtml(AUTH_APP_NAME)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.5;">${escapeHtml(input.heading)}</h1>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.8;white-space:pre-wrap;">${escapeHtml(input.body)}</p>
      <p style="margin:0 0 20px;">
        <a href="${url}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;">${escapeHtml(input.buttonLabel)}</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;line-height:1.7;color:#64748b;">ボタンが開かない場合は、次のURLをブラウザに貼り付けてください。<br>${url}</p>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">このメールに心当たりがない場合は、破棄してください。</p>
    </div>
  </div>
  `;
}

async function sendAppEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: 'RESEND_API_KEY が設定されていません。' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });
  const body = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[auth-email] Resend failed', res.status, body);
    return { sent: false, error: '認証メールの送信に失敗しました。' };
  }
  return { sent: true };
}

export async function sendSignupConfirmationEmail(
  to: string,
  actionUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = `【${AUTH_APP_NAME}】会員登録のご確認`;
  const body = `${AUTH_APP_NAME} への会員登録ありがとうございます。\n下のボタンを押してメールアドレスを確認すると、登録が完了します。`;
  return sendAppEmail({
    to,
    subject,
    text: `${body}\n\n${actionUrl}`,
    html: buttonEmailHtml({
      heading: 'メールアドレスの確認',
      body,
      buttonLabel: 'メールアドレスを確認する',
      actionUrl,
    }),
  });
}

export async function sendPasswordResetEmail(
  to: string,
  actionUrl: string
): Promise<{ sent: boolean; error?: string }> {
  const subject = `【${AUTH_APP_NAME}】パスワード再設定のご案内`;
  const body = `${AUTH_APP_NAME} のパスワード再設定リクエストを受け付けました。\n下のボタンを押して認証を完了したあと、元の画面に戻って新しいパスワードを入力してください。`;
  return sendAppEmail({
    to,
    subject,
    text: `${body}\n\n${actionUrl}`,
    html: buttonEmailHtml({
      heading: 'パスワードの再設定',
      body,
      buttonLabel: '認証を完了する',
      actionUrl,
    }),
  });
}
