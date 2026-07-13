import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, Button, EmptyState, Field, InlineSpinner, Input, useToast } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useResendVerification } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailView() {
  const [sp] = useSearchParams();
  const token = sp.get('token');
  const state = verificationState(sp);
  const [email, setEmail] = useState(sp.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const resend = useResendVerification();
  const { push } = useToast();
  const canResend = isEmail(email) && password.length >= 8 && cooldown === 0;

  useEffect(() => {
    if (!token) return;
    const query = new URLSearchParams({ token, redirect: '/verify-email?status=success' });
    window.location.replace(`/api/auth/verify-email?${query.toString()}`);
  }, [token]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (token) {
    return (
      <AuthLayout title="이메일 인증">
        <EmptyState icon={<CheckGlyph />} title="인증 중" description="인증 링크를 확인하고 있습니다." action={<InlineSpinner label="인증 처리 중" />} />
      </AuthLayout>
    );
  }

  if (state === 'success') {
    return (
      <AuthLayout title="이메일 인증">
        <EmptyState
          icon={<CheckGlyph />}
          title="인증 완료"
          description="관리자 승인 후 로그인할 수 있습니다."
          action={<Link to="/login?verified=1"><Button variant="primary">로그인</Button></Link>}
        />
      </AuthLayout>
    );
  }

  if (state === 'already_verified') {
    return (
      <AuthLayout title="이메일 인증">
        <EmptyState
          icon={<CheckGlyph />}
          title="이미 인증됨"
          description="이 이메일은 이미 인증되었습니다. 승인 상태에 따라 로그인할 수 있습니다."
          action={<Link to="/login"><Button variant="primary">로그인</Button></Link>}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="이메일 인증">
      <div className="grid gap-4">
        <EmptyState
          icon={<AlertGlyph />}
          title="인증 링크 만료"
          description="가입한 이메일과 비밀번호로 인증 메일을 다시 요청할 수 있습니다."
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canResend) return;
            resend.mutate(
              { email: email.trim().toLowerCase(), password },
              {
                onSuccess: () => {
                  setCooldown(RESEND_COOLDOWN_SECONDS);
                  push({ tone: 'success', title: '인증 메일 재전송', description: '메일함과 스팸함을 함께 확인해주세요' });
                },
                onError: (error) => push({ tone: 'danger', title: '재전송 실패', description: resendError(error as ApiError) }),
              },
            );
          }}
          className="grid gap-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning">만료</Badge>
            <p className="text-caption text-secondary">새 링크를 받으면 이전 링크는 사용하지 않습니다.</p>
          </div>
          <Field label="이메일">
            <Input type="email" placeholder="가입한 이메일 주소" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="비밀번호">
            <Input type="password" placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required />
          </Field>
          <Button type="submit" variant="primary" loading={resend.isPending} disabled={!canResend} className="w-full">
            {cooldown > 0 ? `${cooldown}초 후 재전송` : '인증 메일 재전송'}
          </Button>
        </form>
        {resend.isSuccess && <p className="text-center text-caption font-medium text-success">인증 메일을 전송했습니다. 스팸함도 확인해주세요.</p>}
        {resend.isError && <p className="text-center text-caption font-medium text-danger">{resendError(resend.error as ApiError)}</p>}
        <Link to="/login" className="justify-self-center"><Button variant="ghost">로그인</Button></Link>
      </div>
    </AuthLayout>
  );
}

type VerificationState = 'success' | 'expired' | 'already_verified';

function verificationState(params: URLSearchParams): VerificationState {
  const status = (params.get('status') ?? '').toLowerCase();
  if (params.get('verified') === '1' || status === 'success') return 'success';
  if (params.get('already_verified') === '1' || status === 'already_verified' || status === 'already') return 'already_verified';
  return 'expired';
}

function resendError(error: ApiError): string {
  if (error.status === 401 || error.status === 403) return '이메일 또는 비밀번호를 확인해주세요';
  if (error.status === 429) return cooldownMessage(error);
  return error.detail || '네트워크 상태를 확인해주세요';
}

function cooldownMessage(error: ApiError): string {
  if (!error.rawDetail || typeof error.rawDetail !== 'object') return '잠시 후 다시 시도해주세요';
  const raw = error.rawDetail as Record<string, unknown>;
  const retryAfter = raw.retry_after;
  return typeof retryAfter === 'number' ? `${Math.max(1, Math.ceil(retryAfter))}초 후 다시 시도해주세요` : '잠시 후 다시 시도해주세요';
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
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
