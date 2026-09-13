import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/auth/reset-password';

  if (code) {
    const cookieStore = await cookies();
    
    // 💡 修正点: サーバー側でレスポンスオブジェクトを作成し、
    // Supabaseのクッキー（Code Verifier等）のセットを確実に行えるようにする
    const response = NextResponse.redirect(`${origin}${next}?setup=1`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value, ...options });
              // リダイレクトレスポンス側にもクッキーを反映させる
              response.cookies.set({ name, value, ...options });
            } catch {
              // 制限エラー回避
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options, maxAge: 0 });
              response.cookies.set({ name, value: '', ...options, maxAge: 0 });
            } catch {
              // 制限エラー回避
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // クッキーが正しく付与されたレスポンスを返す
      return response;
    }
    
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
  }

  return NextResponse.redirect(`${origin}/auth/reset-password?error=invalid_link`);
}