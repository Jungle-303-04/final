import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLogin } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';
import { Button, Field } from '@/shared/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function LoginView() {
  const [email, setEmail] = useState('admin.local@example.com');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const nav = useNavigate();
  const [sp] = useSearchParams();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, {
      onSuccess: () => nav(sp.get('returnTo') ?? '/overview', { replace: true }),
      onError: (err) => {
        const a = err as ApiError;
        if (a.status === 403 && a.detail.includes('approval')) nav(`/pending?email=${encodeURIComponent(email)}`);
      },
    });
  };
  const err = login.error as ApiError | null;
  return (
    <AuthLayout title="로그인" subtitle="운영 콘솔에 접속합니다">
      <form onSubmit={submit}>
        <Field label="이메일"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></Field>
        <Field label="비밀번호" error={err && err.status === 401 ? '이메일 또는 비밀번호가 올바르지 않습니다' : err?.status === 429 ? '잠시 후 다시 시도해주세요' : err && err.status === 403 && !err.detail.includes('approval') ? '이메일 검증이 필요합니다' : undefined}>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
        </Field>
        <Button type="submit" variant="primary" loading={login.isPending} style={{ width: '100%', justifyContent: 'center' }}>로그인</Button>
      </form>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', textAlign: 'center' }}>
        계정이 없나요? <Link to="/signup" style={{ color: 'var(--brand)' }}>가입하기</Link>
      </p>
    </AuthLayout>
  );
}
