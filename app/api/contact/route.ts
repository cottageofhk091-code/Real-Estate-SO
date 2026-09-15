import { NextResponse } from 'next/server';

const APP_NAME = '不動産セカンドオピニオンAI';
/** Verified domain sender (Resend) — From は常に noreply を使用（From=To ループ防止） */
const DEFAULT_FROM_EMAIL = `${APP_NAME} <noreply@cloudflowriver.com>`;
const DEFAULT_CONTACT_EMAIL = 'support@cloudflowriver.com';
const EXPECTED_FROM_ADDRESS = 'noreply@cloudflowriver.com';

function getContactEmail(): string {
  return (process.env.CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL).trim();
}

function getContactFromEmail(): string {
  // CONTACT_FROM_EMAIL が support@ 等になっていても、送信元は noreply に固定する。
  const from = process.env.CONTACT_FROM_EMAIL?.trim();
  if (from) {
    const addr = extractEmailAddress(from);
    if (addr === EXPECTED_FROM_ADDRESS) return from;
    console.warn('[contact] Ignoring CONTACT_FROM_EMAIL (not noreply):', from);
  }
  return DEFAULT_FROM_EMAIL;
}

function extractEmailAddress(fromHeader: string): string {
  const match = fromHeader.match(/<([^>]+)>/);
  return (match?.[1] || fromHeader).trim().toLowerCase();
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
}): Promise<{ id: string | null }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set');
    throw new Error('メール送信の設定エラーです（RESEND_API_KEY）。');
  }

  const from = getContactFromEmail();
  const fromAddress = extractEmailAddress(from);
  if (fromAddress !== EXPECTED_FROM_ADDRESS) {
    console.warn('[contact] Unexpected From address:', {
      from,
      fromAddress,
      expected: EXPECTED_FROM_ADDRESS,
    });
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

  const payload = {
    from,
    to: [params.to],
    reply_to: params.replyTo,
    subject,
    text: textBody,
    html: htmlBody,
  };

  console.log('[contact] Resend send request:', {
    from: payload.from,
    to: payload.to,
    reply_to: payload.reply_to,
    subject: payload.subject,
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'bukken-second-opinion-contact/1.0',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text().catch(() => '');
  type ResendEmailResponse = {
    id?: string;
    error?: unknown;
    message?: string;
    name?: string;
  };
  let responseJson: ResendEmailResponse | null = null;
  try {
    responseJson = responseText ? (JSON.parse(responseText) as ResendEmailResponse) : null;
  } catch {
    responseJson = null;
  }

  console.log('[contact] Resend send response:', {
    ok: res.ok,
    status: res.status,
    id: responseJson?.id ?? null,
    error: responseJson?.error ?? null,
    message: responseJson?.message ?? null,
    name: responseJson?.name ?? null,
    raw: responseText.slice(0, 2000),
  });

  if (!res.ok) {
    console.error('[contact] Resend email failed:', {
      status: res.status,
      error: responseJson?.error ?? responseText,
    });
    throw new Error('お問い合わせメールの送信に失敗しました。');
  }

  return { id: responseJson?.id ?? null };
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

    console.log('[contact] Resolved addresses:', {
      from: getContactFromEmail(),
      to: contactEmail,
      replyTo: trimmedEmail,
      envContactEmail: process.env.CONTACT_EMAIL ? '(set)' : '(unset → default)',
      envContactFromEmail: process.env.CONTACT_FROM_EMAIL ? '(set)' : '(unset → default)',
    });

    const { id: resendId } = await sendContactEmail({
      to: contactEmail,
      replyTo: trimmedEmail,
      name: displayName,
      type: inquiryType,
      message: inquiryMessage,
    });

    return NextResponse.json({
      success: true,
      notified: contactEmail,
      from: getContactFromEmail(),
      resendId,
    });
  } catch (error) {
    console.error('Contact Error:', error);
    const message =
      error instanceof Error && /RESEND_API_KEY|メール送信の設定/.test(error.message)
        ? 'サーバー側のメール設定エラーです。管理者にお問い合わせください。'
        : '送信中にエラーが発生しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
