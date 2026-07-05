import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSignup } from '@/features/auth/api';
import { ApiError } from '@/shared/lib/api';
import { Button, EmptyState, Field } from '@/shared/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function SignupView() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const signup = useSignup();
  const mismatch = pw2 !== '' && pw !== pw2;

  if (signup.isSuccess) {
    return (
      <AuthLayout title="검증 메일 발송됨">
        <EmptyState icon="✉️" title="메일함을 확인해주세요" description={`${email} 로 검증 링크를 보냈습니다. 검증 후 관리자 승인이 필요합니다.`}
          action={<Link to="/login"><Button>로그인으로</Button></Link>} />
      </AuthLayout>
    );
  }
  const err = signup.error as ApiError | null;
  return (
    <AuthLayout title="가입" subtitle="이메일 검증과 관리자 승인 후 사용할 수 있습니다">
      <form onSubmit={e => { e.preventDefault(); if (!mismatch) signup.mutate({ email, password: pw, password_confirm: pw2 }); }}>
        <Field label="이메일" error={err?.status === 409 ? '이미 가입된 이메일입니다' : undefined}>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </Field>
        <Field label="비밀번호 (8자 이상)"><input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required /></Field>
        <Field label="비밀번호 확인" error={mismatch ? '비밀번호가 일치하지 않습니다' : undefined}>
          <input className="input" type="password" value={pw2} onChange={e => setPw2(e.target.value)} minLength={8} required />
        </Field>
        <Button type="submit" variant="primary" loading={signup.isPending} disabled={mismatch} style={{ width: '100%', justifyContent: 'center' }}>가입하기</Button>
      </form>
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', textAlign: 'center' }}>
        이미 계정이 있나요? <Link to="/login" style={{ color: 'var(--brand)' }}>로그인</Link>
      </p>
    </AuthLayout>
  );
}
