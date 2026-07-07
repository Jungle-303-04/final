import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSignup } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';
import { Button, EmptyState, Field, Input, useToast } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function SignupView() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const signup = useSignup();
  const { push } = useToast();
  const mismatch = pw2 !== '' && pw !== pw2;

  if (signup.isSuccess) {
    return (
      <AuthLayout title="검증 메일 발송됨">
        <EmptyState icon={<MailGlyph />} title="메일함 확인" description={`${email} 로 검증 링크를 보냈습니다. 검증 후 관리자 승인이 필요합니다.`}
          action={<Link to="/login"><Button>로그인</Button></Link>} />
      </AuthLayout>
    );
  }
  const err = signup.error as ApiError | null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mismatch) return;
    signup.mutate(
      { email, password: pw, password_confirm: pw2 },
      {
        onSuccess: () => push({ tone: 'success', title: '검증 메일 발송', description: '메일함에서 검증 링크를 확인해주세요' }),
        onError: (error) => push({ tone: 'danger', title: '가입 실패', description: signupError(error as ApiError) }),
      },
    );
  };

  return (
    <AuthLayout title="가입" subtitle="이메일 검증과 관리자 승인 후 사용할 수 있습니다">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="이메일" error={err?.status === 409 ? '이미 가입된 이메일입니다' : undefined}>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="비밀번호" help="8자 이상">
          <Input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="비밀번호 확인" error={mismatch ? '비밀번호가 일치하지 않습니다' : undefined}>
          <Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        {err && err.status !== 409 && (
          <p className="text-caption font-medium text-danger" role="alert">가입 실패 — {err.detail || '잠시 후 다시 시도해주세요'}</p>
        )}
        <Button type="submit" variant="primary" loading={signup.isPending} disabled={mismatch} className="w-full">가입</Button>
      </form>
      <p className="mt-6 text-center text-body text-secondary">
        이미 계정이 있나요? <Link to="/login" className="font-semibold text-accent hover:text-accent-hover">로그인</Link>
      </p>
    </AuthLayout>
  );
}

function signupError(error: ApiError): string {
  if (error.status === 409) return '이미 가입된 이메일입니다';
  if (error.status === 429) return '잠시 후 다시 시도해주세요';
  return error.detail || '네트워크 상태를 확인해주세요';
}

function MailGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M4 6.5h16v11H4z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="m4.5 7 7.5 6 7.5-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
