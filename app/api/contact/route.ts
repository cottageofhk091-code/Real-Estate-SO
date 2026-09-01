import { NextResponse } from 'next/server';

const APP_NAME = '不動産セカンドオピニオンAI';
const DEFAULT_CONTACT_EMAIL = 'support@cloudflowriver.com';

function getContactEmail(): string {
  return (process.env.CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL).trim();
}

function getContactFromEmail(): string {
  const from = process.env.CONTACT_FROM_EMAIL?.trim();
  if (from) return from;
  return `${APP_NAME} <noreply@cloudflowriver.com>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendContactEmail(params: {
  to: string;
  replyTo: string;
  name: string;
  type: string;
  message: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set');
    throw new Error('メール送信の設定エラーです（RESEND_API_KEY）。');
  }

  const subject = `【${APP_NAME}】お問い合わせ: ${params.type || '一般'}`;
  const textBody = [
    `${APP_NAME} にお問い合わせが届きました。`,
    '',
    `お名前: ${params.name}`,
    `メールアドレス: ${params.replyTo}`,
    `種別: ${params.type || '（未選択）'}`,
    '',
    '--- お問い合わせ内容 ---',
    params.message,
    '',
    `通知先: ${params.to}`,
  ].join('\n');

  const htmlBody = `
    <div style="font-family:sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px">${escapeHtml(APP_NAME)}｜新しいお問い合わせ</h2>
      <p style="margin:0 0 8px"><strong>お名前:</strong> ${escapeHtml(params.name)}</p>
      <p style="margin:0 0 8px"><strong>メールアドレス:</strong> ${escapeHtml(params.replyTo)}</p>
      <p style="margin:0 0 16px"><strong>種別:</strong> ${escapeHtml(params.type || '（未選択）')}</p>
      <div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;white-space:pre-wrap">${escapeHtml(params.message)}</div>
      <p style="margin:16px 0 0;font-size:12px;color:#64748b">このメールに返信すると、お客様（${escapeHtml(params.replyTo)}）へ返信できます。</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'bukken-second-opinion-contact/1.0',
    },
    body: JSON.stringify({
      from: getContactFromEmail(),
      to: [params.to],
      reply_to: params.replyTo,
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[contact] Resend email failed:', res.status, body);
    throw new Error('お問い合わせメールの送信に失敗しました。');
  }
}

export async function POST(request: Request) {
  try {
    const { name, email, type, message } = await request.json();

    if (!email || !message) {
      return NextResponse.json(
        { error: 'メールアドレスとお問い合わせ内容は必須です。' },
        { status: 400 }
      );
    }

    const contactEmail = getContactEmail();
    if (!contactEmail.includes('@')) {
      console.error('[contact] CONTACT_EMAIL is invalid:', contactEmail);
      return NextResponse.json({ error: 'サーバー側の設定エラーです。' }, { status: 500 });
    }

    const trimmedEmail = String(email).trim();
    const displayName = name?.trim() ? String(name).trim() : '（未入力）';
    const inquiryType = type ? String(type).trim() : '';
    const inquiryMessage = String(message).trim();

    await sendContactEmail({
      to: contactEmail,
      replyTo: trimmedEmail,
      name: displayName,
      type: inquiryType,
      message: inquiryMessage,
    });

    return NextResponse.json({ success: true, notified: contactEmail });
  } catch (error) {
    console.error('Contact Error:', error);
    const message =
      error instanceof Error && /RESEND_API_KEY|メール送信の設定/.test(error.message)
        ? 'サーバー側のメール設定エラーです。管理者にお問い合わせください。'
        : '送信中にエラーが発生しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}