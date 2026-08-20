import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/env';

/**
 * Where the email confirmation link lands. Supabase sends the user here with a one-time
 * code, which is exchanged for a session cookie. Redirects are built from SITE_URL rather
 * than the request origin, so a reverse proxy cannot send the user somewhere unintended.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL('/', SITE_URL));
  }

  return NextResponse.redirect(new URL('/sign-in?confirmation=failed', SITE_URL));
}
