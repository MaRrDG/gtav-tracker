import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { SignInForm } from './sign-in-form';

export default async function SignInPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/');

  return (
    <main className="auth-screen">
      <SignInForm />
    </main>
  );
}
