import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Field, Input, useToast } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useResendVerification } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';

export default function VerifyEmailView() {
  const [sp] = useSearchParams();
  const ok = sp.get('verified') === '1';
  const token = sp.get('token');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const resend = useResendVerification();
  const { push } = useToast();

  useEffect(() => {
    if (!token) return;
    const query = new URLSearchParams({ token });
    window.location.replace(`/api/auth/verify-email?${query.toString()}`);
  }, [token]);

  if (token) {
    return (
      <AuthLayout title="이메일 검증">
        <EmptyState icon={<CheckGlyph />} title="검증 중" description="잠시만 기다려주세요." />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="이메일 검증">
      {ok
        ? <EmptyState icon={<CheckGlyph />} title="검증 완료" description="관리자 승인 후 로그인할 수 있습니다." action={<Link to="/login"><Button variant="primary">로그인</Button></Link>} />
        : (
          <div className="grid gap-4">
            <EmptyState icon={<AlertGlyph />} title="검증 링크 만료" description="검증 메일을 다시 요청할 수 있습니다." />
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!email || password.length < 8) return;
                resend.mutate(
                  { email, password },
                  {
                    onSuccess: () => push({ tone: 'success', title: '검증 메일 재전송', description: '메일함에서 검증 링크를 확인해주세요' }),
                    onError: (error) => push({ tone: 'danger', title: '재전송 실패', description: resendError(error as ApiError) }),
                  },
                );
              }}
              className="grid gap-4"
            >
              <Field label="이메일">
                <Input type="email" placeholder="가입한 이메일 주소" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
              </Field>
              <Field label="비밀번호">
                <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required />
              </Field>
              <Button type="submit" variant="primary" loading={resend.isPending} disabled={!email || password.length < 8} className="w-full">
                검증 메일 재전송
              </Button>
            </form>
            {resend.isSuccess && <p className="text-center text-caption font-medium text-success">검증 메일을 전송했습니다. 메일함을 확인해주세요.</p>}
            {resend.isError && <p className="text-center text-caption font-medium text-danger">전송에 실패했습니다. 이메일 주소를 확인해주세요.</p>}
            <Link to="/login" className="justify-self-center"><Button variant="ghost">로그인</Button></Link>
          </div>
        )}
    </AuthLayout>
  );
}

function resendError(error: ApiError): string {
  if (error.status === 401 || error.status === 403) return '이메일 또는 비밀번호를 확인해주세요';
  if (error.status === 429) return '잠시 후 다시 시도해주세요';
  return error.detail || '네트워크 상태를 확인해주세요';
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.5 12.2 2.4 2.4 4.8-5.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function AlertGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M12 4 3.5 19h17z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 9v4.5M12 16.5h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}
