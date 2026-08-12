import { NextResponse } from 'next/server';

const DISCORD_FIELD_MAX = 1024;
const APP_NAME = '不動産セカンドオピニオンAI';
const WEBHOOK_USERNAME = '不動産セカンドオピニオンAI サポート';

function truncate(value: string, max = DISCORD_FIELD_MAX): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function buildGmailComposeUrl(to: string): string {
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to,
    su: `【お問い合わせへの返信】${APP_NAME}`,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
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

    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.error('DISCORD_WEBHOOK_URL is not set');
      return NextResponse.json(
        { error: 'サーバー側の設定エラーです。' },
        { status: 500 }
      );
    }

    const trimmedEmail = String(email).trim();
    const displayName = name?.trim() ? `${name.trim()} 様` : '（未入力）';
    const gmailUrl = buildGmailComposeUrl(trimmedEmail);

    const fields = [
      { name: 'お名前', value: truncate(displayName), inline: true },
      {
        name: 'メールアドレス',
        value: truncate(`\`${trimmedEmail}\``),
        inline: true,
      },
    ];

    if (type) {
      fields.push({
        name: 'お問い合わせ種別',
        value: truncate(String(type).trim()),
        inline: false,
      });
    }

    fields.push({
      name: 'お問い合わせ内容',
      value: truncate(String(message).trim()),
      inline: false,
    });

    const payload = {
      username: WEBHOOK_USERNAME,
      embeds: [
        {
          title: `📩 ${APP_NAME}｜新しいお問い合わせが届きました`,
          color: 3447003,
          description: [
            '👤 送信者メールアドレス:',
            `\`${trimmedEmail}\` (クリックでコピー)`,
            '',
            `🚀 [✉️ Web版Gmailで返信画面を開く](${gmailUrl})`,
          ].join('\n'),
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const discordRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!discordRes.ok) {
      const body = await discordRes.text().catch(() => '');
      console.error('Discord webhook failed:', discordRes.status, body);
      throw new Error('Discordへの通知送信に失敗しました。');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact Error:', error);
    return NextResponse.json(
      { error: '送信中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}
