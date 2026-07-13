import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3Icon } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useLogin } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';
import { Badge, Button, EmptyState, InlineSpinner, useToast } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

type PendingLocationState = {
  email?: string;
  password?: string;
  returnTo?: string;
};

export default function PendingView() {
  const [sp] = useSearchParams();
  const loc = useLocation();
  const nav = useNavigate();
  const login = useLogin();
  const { push } = useToast();
  const state = (loc.state ?? {}) as PendingLocationState;
  const email = sp.get('email') ?? state.email ?? '계정';
  const returnTo = safeReturnTo(sp.get('returnTo') ?? state.returnTo ?? '/');
  const credentials = useMemo(() => (
    state.email && state.password ? { email: state.email, password: state.password } : null
  ), [state.email, state.password]);
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState('');

  const attemptLogin = useCallback(() => {
    if (!credentials || login.isPending) return;
    setLastAttemptAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    login.mutate(credentials, {
      onSuccess: () => {
        push({ tone: 'success', title: '승인 완료', description: '콘솔로 이동합니다' });
        nav(returnTo, { replace: true });
      },
      onError: (error) => {
        const apiError = error as ApiError;
        if (authErrorCode(apiError) === 'approval_pending' || apiError.detail.includes('승인')) {
          setLastError('');
          return;
        }
        setLastError(pendingError(apiError));
      },
    });
  }, [credentials, login, nav, push, returnTo]);

  useEffect(() => {
    if (!credentials) return undefined;
    attemptLogin();
    const timer = window.setInterval(attemptLogin, 5000);
    return () => window.clearInterval(timer);
  }, [attemptLogin, credentials]);

  return (
    <AuthLayout title="승인 대기 중">
      <div className="grid gap-4">
        <EmptyState
          icon={<ClockGlyph />}
          title="관리자 승인 대기"
          description={`${email} 은(는) 승인 후 로그인할 수 있습니다.`}
          action={(
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={`/login?returnTo=${encodeURIComponent(returnTo)}`}><Button variant="primary">로그인 재시도</Button></Link>
              {credentials && <Button type="button" variant="secondary" loading={login.isPending} onClick={attemptLogin}>지금 확인</Button>}
            </div>
          )}
        />
        <div className="grid gap-2 rounded-panel border border-border bg-raised p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={credentials ? 'info' : 'warning'}>{credentials ? '자동 확인' : '수동 확인'}</Badge>
            {credentials && login.isPending ? <InlineSpinner label="승인 상태 확인 중" /> : <p className="text-caption text-text-secondary">승인되면 자동으로 콘솔에 입장합니다.</p>}
          </div>
          {lastAttemptAt && <p className="text-caption text-text-muted">마지막 확인: {lastAttemptAt}</p>}
          {!credentials && <p className="text-caption text-text-secondary">새로고침 후에는 보안을 위해 비밀번호를 보관하지 않습니다. 승인 후 다시 로그인해주세요.</p>}
          {lastError && <p className="text-caption font-medium text-danger" role="alert">{lastError}</p>}
        </div>
      </div>
    </AuthLayout>
  );
}

function pendingError(error: ApiError): string {
  if (error.status === 401) return '이메일 또는 비밀번호가 올바르지 않습니다';
  if (authErrorCode(error) === 'email_unverified') return '이메일 인증이 필요합니다';
  if (error.status === 429) return '잠시 후 다시 시도해주세요';
  return error.detail || '승인 상태를 확인하지 못했습니다';
}

function authErrorCode(error: ApiError): string {
  if (!error.rawDetail || typeof error.rawDetail !== 'object') return '';
  const raw = error.rawDetail as Record<string, unknown>;
  return typeof raw.code === 'string' ? raw.code : '';
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('://')) return '/';
  return value;
}

function ClockGlyph() {
  return <Clock3Icon className="h-5 w-5" aria-hidden="true" />;
}
