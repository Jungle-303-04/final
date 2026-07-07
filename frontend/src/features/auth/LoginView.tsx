import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLogin } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';
import { Button, Field, Input, useToast } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const { push } = useToast();
  const returnTo = sp.get('returnTo') ?? impliedReturnTo(loc.pathname, loc.search, loc.hash);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, {
      onSuccess: () => {
        push({ tone: 'success', title: '로그인 완료', description: '콘솔 세션을 시작했습니다' });
        nav(safeReturnTo(returnTo), { replace: true });
      },
      onError: (err) => {
        const a = err as ApiError;
        if (a.status === 403 && a.detail.includes('approval')) {
          push({ tone: 'warning', title: '승인 대기', description: '관리자 승인 후 로그인할 수 있습니다' });
          nav(`/pending?email=${encodeURIComponent(email)}`);
          return;
        }
        push({ tone: 'danger', title: '로그인 실패', description: loginError(a) });
      },
    });
  };
  const err = login.error as ApiError | null;
  return (
    <AuthLayout title="로그인">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="이메일">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="비밀번호" error={err && err.status === 401 ? '이메일 또는 비밀번호가 올바르지 않습니다' : err?.status === 429 ? '잠시 후 다시 시도해주세요' : err && err.status === 403 && !err.detail.includes('approval') ? '이메일 검증이 필요합니다' : undefined}>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required />
        </Field>
        <Button type="submit" variant="primary" loading={login.isPending} className="w-full">로그인</Button>
      </form>
      <p className="mt-6 text-center text-body text-secondary">
        계정이 없나요? <Link to="/signup" className="font-semibold text-accent hover:text-accent-hover">가입</Link>
      </p>
    </AuthLayout>
  );
}

function impliedReturnTo(pathname: string, search: string, hash: string): string | null {
  if (['/login', '/signup', '/pending', '/verify-email'].includes(pathname)) return null;
  return `${pathname}${search}${hash}`;
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('://')) return '/';
  return value;
}

function loginError(error: ApiError): string {
  if (error.status === 401) return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (error.status === 403) return '이메일 검증이 필요합니다';
  if (error.status === 429) return '잠시 후 다시 시도해주세요';
  return error.detail || '네트워크 상태를 확인해주세요';
}
