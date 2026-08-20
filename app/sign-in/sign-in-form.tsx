'use client';

import { useState, type SyntheticEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/env';

type Mode = 'sign-in' | 'sign-up';

export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = createBrowserSupabase();
    const { data, error } =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${SITE_URL}/auth/callback` },
          });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    // Signing up returns no session until the emailed link is followed.
    if (!data.session) {
      setMessage(`Account created. Open the confirmation link sent to ${email}.`);
      setMode('sign-in');
      return;
    }

    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth">
      <h1>{mode === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>

      <label>
        Email
        <input
          type="email"
          value={email}
          required
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          required
          minLength={8}
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      <button type="submit" disabled={busy}>
        {mode === 'sign-in' ? 'Sign in' : 'Create account'}
      </button>

      {message && <p role="status">{message}</p>}

      <button
        type="button"
        className="link"
        onClick={() => {
          setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
          setMessage(null);
        }}
      >
        {mode === 'sign-in' ? 'Create an account instead' : 'Sign in instead'}
      </button>
    </form>
  );
}
