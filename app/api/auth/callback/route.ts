import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as any;
  const next = searchParams.get('next') ?? '/auth/reset-password';

  const cookieStore = await cookies();
  const response = NextResponse.redirect(`${origin}${next}?setup=1`);

  if (tokenHash && type) {
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
              response.cookies.set({ name, value, ...options });
            } catch {}
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options, maxAge: 0 });
              response.cookies.set({ name, value: '', ...options, maxAge: 0 });
            } catch {}
          },
        },
      }
    );

    // 💡 token_hash を用いてセッションを安全に検証・確立
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type,
    });

    if (!error) {
      return response;
    }
    console.error('[auth/callback] verifyOtp error:', error.message);
  }

  return NextResponse.redirect(`${origin}/auth/reset-password?error=invalid_link`);
}