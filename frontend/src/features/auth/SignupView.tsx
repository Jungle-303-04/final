import { useEffect, useMemo, useState } from 'react';
import { MailIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEmailAvailability, useResendVerification, useSignup } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';
import { Badge, Button, EmptyState, Field, InlineSpinner, Input, useToast } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

const RESEND_COOLDOWN_SECONDS = 60;

export default function SignupView() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [sent, setSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const signup = useSignup();
  const resend = useResendVerification();
  const { push } = useToast();
  const debouncedEmail = useDebouncedValue(email.trim().toLowerCase(), 450);
  const emailLooksValid = isEmail(email);
  const emailCheck = useEmailAvailability(debouncedEmail, emailLooksValid);
  const emailAvailable = emailLooksValid && emailCheck.data?.available === true;
  const emailDuplicate = emailCheck.data?.available === false && emailCheck.data.reason_code === 'already_registered';
  const emailError = emailFieldError(email, emailCheck.error as ApiError | null, emailDuplicate);
  const password = useMemo(() => passwordState(pw, pw2), [pw, pw2]);
  const canSubmit = emailAvailable && password.canSubmit && !signup.isPending;
  const canResend = isEmail(email) && pw.length >= 8 && resendCooldown === 0;

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  if (sent || signup.isSuccess) {
    return (
      <AuthLayout title="인증 메일 발송됨">
        <div className="grid gap-4">
          <EmptyState
            icon={<MailGlyph />}
            title="메일함 확인"
            description={`${email} 로 인증 링크를 보냈습니다. 인증 후 관리자 승인이 필요합니다.`}
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" size="sm" loading={resend.isPending} disabled={!canResend} onClick={resendVerification}>
                  {resendCooldown > 0 ? `${resendCooldown}초 후 재발송` : '인증 메일 재발송'}
                </Button>
                <Link to="/login"><Button size="sm" variant="ghost">로그인</Button></Link>
              </div>
            )}
          />
          <p className="text-center text-caption text-text-secondary">메일이 보이지 않으면 스팸함과 회사 메일 보안 격리함을 함께 확인해주세요.</p>
        </div>
      </AuthLayout>
    );
  }

  const err = signup.error as ApiError | null;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    signup.mutate(
      { email: debouncedEmail, password: pw, password_confirm: pw2 },
      {
        onSuccess: () => {
          setSent(true);
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
          push({ tone: 'success', title: '인증 메일 발송', description: '메일함에서 인증 링크를 확인해주세요' });
        },
        onError: (error) => push({ tone: 'danger', title: '가입 실패', description: signupError(error as ApiError) }),
      },
    );
  };

  function resendVerification() {
    if (!canResend) return;
    resend.mutate(
      { email: email.trim().toLowerCase(), password: pw },
      {
        onSuccess: () => {
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
          push({ tone: 'success', title: '인증 메일 재발송', description: '메일함과 스팸함을 함께 확인해주세요' });
        },
        onError: (error) => push({ tone: 'danger', title: '재발송 실패', description: resendError(error as ApiError) }),
      },
    );
  }

  return (
    <AuthLayout title="가입" subtitle="이메일 인증과 관리자 승인 후 사용할 수 있습니다">
      <form onSubmit={submit} className="grid gap-4">
        <Field
          label="이메일"
          error={emailError ?? (err?.status === 409 ? '이미 가입된 이메일입니다' : undefined)}
          help={emailHelp(email, emailCheck.isFetching, emailAvailable)}
        >
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" required />
        </Field>
        {emailDuplicate && (
          <p className="text-caption text-text-secondary">
            이미 계정이 있다면 <Link to="/login" className="font-semibold text-brand hover:text-brand-hover">로그인하기</Link>로 이동해주세요.
          </p>
        )}
        {emailAvailable && (
          <>
            <Field label="비밀번호" help={<PasswordMeter score={password.score} label={password.label} />}>
              <Input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
            <div className="grid gap-2 rounded-panel border border-border bg-raised p-3">
              {password.rules.map((rule) => (
                <div key={rule.label} className="flex items-center justify-between gap-3 text-caption">
                  <span className="text-text-secondary">{rule.label}</span>
                  <Badge tone={rule.ok ? 'success' : 'neutral'}>{rule.ok ? '충족' : '대기'}</Badge>
                </div>
              ))}
            </div>
            <Field label="비밀번호 확인" error={password.mismatch ? '비밀번호가 일치하지 않습니다' : undefined}>
              <Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
          </>
        )}
        {err && err.status !== 409 && (
          <p className="text-caption font-medium text-danger" role="alert">가입 실패: {signupError(err)}</p>
        )}
        <Button type="submit" variant="primary" loading={signup.isPending} disabled={!canSubmit} className="w-full">가입</Button>
      </form>
      <p className="mt-6 text-center text-body text-text-secondary">
        이미 계정이 있나요? <Link to="/login" className="font-semibold text-brand hover:text-brand-hover">로그인</Link>
      </p>
    </AuthLayout>
  );
}

function emailHelp(email: string, pending: boolean, available: boolean) {
  if (!email.trim()) return '회사 이메일을 입력하면 먼저 사용 가능 여부를 확인합니다';
  if (!isEmail(email)) return '이메일 형식으로 입력해주세요';
  if (pending) return <InlineSpinner label="이메일 확인 중" />;
  if (available) return '사용 가능한 이메일입니다';
  return undefined;
}

function emailFieldError(email: string, error: ApiError | null, duplicate: boolean): string | undefined {
  if (!email.trim() || !isEmail(email)) return undefined;
  if (duplicate) return '이미 가입된 이메일입니다';
  if (error?.status === 429) return cooldownMessage(error);
  if (error) return error.detail || '이메일 확인에 실패했습니다';
  return undefined;
}

function passwordState(password: string, confirmation: string) {
  const rules = [
    { label: '8자 이상', ok: password.length >= 8 },
    { label: '문자 포함', ok: /[A-Za-z]/.test(password) },
    { label: '숫자 또는 기호 포함', ok: /[\d\W_]/.test(password) },
  ];
  const score = rules.filter((rule) => rule.ok).length;
  const label = score <= 1 ? '약함' : score === 2 ? '보통' : '강함';
  const mismatch = confirmation !== '' && password !== confirmation;
  return {
    rules,
    score,
    label,
    mismatch,
    canSubmit: password.length >= 8 && confirmation.length >= 8 && !mismatch,
  };
}

function PasswordMeter({ score, label }: { score: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>강도 {label}</span>
      <span className="inline-grid grid-cols-3 gap-1" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <span key={item} className={item < score ? 'h-1.5 w-6 rounded-control bg-brand' : 'h-1.5 w-6 rounded-control bg-raised'} />
        ))}
      </span>
    </span>
  );
}

function signupError(error: ApiError): string {
  if (error.status === 409) return '이미 가입된 이메일입니다';
  if (error.status === 429) return cooldownMessage(error);
  return error.detail || '네트워크 상태를 확인해주세요';
}

function resendError(error: ApiError): string {
  if (error.status === 401 || error.status === 403) return '이메일 또는 비밀번호를 확인해주세요';
  if (error.status === 429) return cooldownMessage(error);
  return error.detail || '네트워크 상태를 확인해주세요';
}

function cooldownMessage(error: ApiError): string {
  const retryAfter = retryAfterSeconds(error);
  return retryAfter ? `${retryAfter}초 후 다시 시도해주세요` : '잠시 후 다시 시도해주세요';
}

function retryAfterSeconds(error: ApiError): number | null {
  if (!error.rawDetail || typeof error.rawDetail !== 'object') return null;
  const raw = error.rawDetail as Record<string, unknown>;
  const value = raw.retry_after;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.ceil(value)) : null;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function MailGlyph() {
  return <MailIcon className="h-5 w-5" aria-hidden="true" />;
}
