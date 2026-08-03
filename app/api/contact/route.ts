import { NextResponse } from 'next/server';

const DISCORD_FIELD_MAX = 1024;

function truncate(value: string, max = DISCORD_FIELD_MAX): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
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

    const submittedAt = new Date().toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const fields = [
      { name: 'お名前', value: truncate(name?.trim() || '（未入力）'), inline: true },
      { name: 'メールアドレス', value: truncate(String(email).trim()), inline: true },
    ];

    if (type) {
      fields.push({
        name: 'お問い合わせ種別',
        value: truncate(String(type).trim()),
        inline: false,
      });
    }

    fields.push(
      {
        name: 'お問い合わせ内容',
        value: truncate(String(message).trim()),
        inline: false,
      },
      {
        name: '送信日時',
        value: submittedAt,
        inline: false,
      }
    );

    const payload = {
      embeds: [
        {
          title: '📩 新しいお問い合わせが届きました',
          color: 0x38bdf8,
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
