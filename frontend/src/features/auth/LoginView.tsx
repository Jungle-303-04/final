import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLogin, useResendVerification } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';
import { Badge, Button, Field, Input, InlineSpinner, useToast } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

const RESEND_COOLDOWN_SECONDS = 60;

export default function LoginView() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const login = useLogin();
  const resend = useResendVerification();
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const { push } = useToast();
  const returnTo = sp.get('returnTo') ?? impliedReturnTo(loc.pathname, loc.search, loc.hash);
  const verified = sp.get('verified') === '1';
  const approvalPending = sp.get('approval') === 'pending';
  const err = login.error as ApiError | null;
  const code = authErrorCode(err);
  const emailReady = isEmail(email);
  const canResend = emailReady && password.length >= 8 && resendCooldown === 0;

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, {
      onSuccess: () => {
        push({ tone: 'success', title: '로그인 완료', description: '콘솔 세션을 시작했습니다' });
        nav(safeReturnTo(returnTo), { replace: true });
      },
      onError: (error) => {
        const apiError = error as ApiError;
        const errorCode = authErrorCode(apiError);
        if (errorCode === 'approval_pending' || (apiError.status === 403 && apiError.detail.includes('승인'))) {
          push({ tone: 'warning', title: '승인 대기', description: '승인되면 자동으로 입장을 다시 시도합니다' });
          nav(`/pending?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`, {
            state: { email, password, returnTo: safeReturnTo(returnTo) },
          });
          return;
        }
        if (errorCode === 'email_unverified' || apiError.status === 403) {
          push({ tone: 'warning', title: '이메일 인증 필요', description: '메일함에서 인증 링크를 확인해주세요' });
          return;
        }
        push({ tone: 'danger', title: '로그인 실패', description: loginError(apiError) });
      },
    });
  };

  const resendVerification = () => {
    if (!canResend) return;
    resend.mutate(
      { email, password },
      {
        onSuccess: () => {
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
          push({ tone: 'success', title: '검증 메일 재전송', description: '메일함과 스팸함을 함께 확인해주세요' });
        },
        onError: (error) => push({ tone: 'danger', title: '재전송 실패', description: resendError(error as ApiError) }),
      },
    );
  };

  return (
    <AuthLayout title="로그인">
      <form onSubmit={submit} className="grid gap-4">
        {(verified || approvalPending) && (
          <div className="grid gap-2 rounded-panel border border-border bg-raised p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={approvalPending ? 'warning' : 'success'}>{approvalPending ? '승인 대기' : '인증 완료'}</Badge>
              <p className="text-body font-semibold text-primary">{approvalPending ? '관리자 승인 후 입장할 수 있습니다' : '이메일 인증이 완료되었습니다'}</p>
            </div>
            <p className="text-caption text-secondary">승인 대기 상태라면 이 화면에서 한 번 로그인하면 자동 대기 화면으로 이동합니다.</p>
          </div>
        )}
        <Field label="이메일">
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="비밀번호" error={loginFieldError(err, code)}>
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" minLength={8} required />
        </Field>
        {code === 'email_unverified' && (
          <div className="grid gap-3 rounded-panel border border-warning/40 bg-raised p-4">
            <div className="grid gap-1">
              <p className="text-body font-semibold text-primary">이메일 인증 필요</p>
              <p className="text-caption text-secondary">가입할 때 사용한 이메일과 비밀번호로 검증 메일을 다시 받을 수 있습니다.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="secondary" loading={resend.isPending} disabled={!canResend} onClick={resendVerification}>
                {resendCooldown > 0 ? `${resendCooldown}초 후 재전송` : '검증 메일 재전송'}
              </Button>
              {resend.isPending && <InlineSpinner label="재전송 중" />}
            </div>
          </div>
        )}
        <Button type="submit" variant="primary" loading={login.isPending} disabled={!emailReady || password.length < 8} className="w-full">로그인</Button>
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

function loginFieldError(error: ApiError | null, code: string): string | undefined {
  if (!error) return undefined;
  if (error.status === 401 || code === 'invalid_credentials') return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (error.status === 429) return '잠시 후 다시 시도해주세요';
  if (code === 'email_unverified' || error.status === 403) return '이메일 인증이 필요합니다';
  return undefined;
}

function loginError(error: ApiError): string {
  const code = authErrorCode(error);
  if (error.status === 401 || code === 'invalid_credentials') return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (code === 'email_unverified') return '이메일 인증이 필요합니다';
  if (code === 'approval_pending') return '관리자 승인을 기다리는 계정입니다';
  if (error.status === 429) return '잠시 후 다시 시도해주세요';
  return error.detail || '네트워크 상태를 확인해주세요';
}

function resendError(error: ApiError): string {
  if (error.status === 401 || error.status === 403) return '이메일 또는 비밀번호를 확인해주세요';
  if (error.status === 429) return '잠시 후 다시 시도해주세요';
  return error.detail || '네트워크 상태를 확인해주세요';
}

function authErrorCode(error: ApiError | null): string {
  if (!error?.rawDetail || typeof error.rawDetail !== 'object') return '';
  const raw = error.rawDetail as Record<string, unknown>;
  return typeof raw.code === 'string' ? raw.code : '';
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}
