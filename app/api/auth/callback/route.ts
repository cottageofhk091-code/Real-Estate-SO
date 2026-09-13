import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  
  // 受け取ったクエリパラメータをそのままリセット画面へ転送
  const search = searchParams.toString();
  const destination = search ? `${origin}/auth/reset-password?${search}&setup=1` : `${origin}/auth/reset-password?setup=1`;

  return NextResponse.redirect(destination);
}