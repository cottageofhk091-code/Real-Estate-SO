import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const type = (searchParams.get('type') || '').toLowerCase();
  const next = searchParams.get('next') || '';
  const search = searchParams.toString();
  const qs = search ? `?${search}` : '';

  if (type === 'recovery' || next.includes('reset-password')) {
    return NextResponse.redirect(`${origin}/auth/password-reset-notice${qs}`);
  }
  if (type === 'signup' || type === 'email' || type === 'magiclink') {
    return NextResponse.redirect(`${origin}/auth/confirmed${qs}`);
  }
  return NextResponse.redirect(`${origin}/auth/confirmed${qs}`);
}
