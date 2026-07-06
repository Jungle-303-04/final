import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState } from '@/shared/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { useResendVerification } from '@/features/auth/api';

export default function VerifyEmailView() {
  const [sp] = useSearchParams();
  const ok = sp.get('verified') === '1';
  const [email, setEmail] = useState('');
  const resend = useResendVerification();

  return (
    <AuthLayout title="이메일 검증">
      {ok
        ? <EmptyState icon="✅" title="검증 완료" description="관리자 승인 후 로그인할 수 있습니다." action={<Link to="/login"><Button variant="primary">로그인으로</Button></Link>} />
        : (
          <div style={{ textAlign: 'center' }}>
            <EmptyState icon="⚠️" title="링크가 만료되었거나 잘못되었습니다" description="아래에서 검증 메일을 다시 요청할 수 있습니다." />
            <form onSubmit={e => { e.preventDefault(); if (email) resend.mutate({ email }); }} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
              <input type="email" placeholder="가입한 이메일 주소" value={email} onChange={e => setEmail(e.target.value)} required style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border, #ddd)', width: '100%', maxWidth: '320px' }} />
              <Button type="submit" disabled={resend.isPending || !email}>
                {resend.isPending ? '전송 중…' : '검증 메일 재전송'}
              </Button>
            </form>
            {resend.isSuccess && <p style={{ color: 'var(--success, green)', marginTop: '0.5rem' }}>검증 메일을 전송했습니다. 메일함을 확인해주세요.</p>}
            {resend.isError && <p style={{ color: 'var(--danger, red)', marginTop: '0.5rem' }}>전송에 실패했습니다. 이메일 주소를 확인해주세요.</p>}
            <Link to="/login" style={{ display: 'inline-block', marginTop: '1rem' }}><Button variant="ghost">로그인으로</Button></Link>
          </div>
        )}
    </AuthLayout>
  );
}
