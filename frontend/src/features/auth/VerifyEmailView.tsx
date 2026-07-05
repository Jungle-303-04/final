import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState } from '@/shared/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function VerifyEmailView() {
  const [sp] = useSearchParams();
  const ok = sp.get('verified') === '1';
  return (
    <AuthLayout title="이메일 검증">
      {ok
        ? <EmptyState icon="✅" title="검증 완료" description="관리자 승인 후 로그인할 수 있습니다." action={<Link to="/login"><Button variant="primary">로그인으로</Button></Link>} />
        : <EmptyState icon="⚠️" title="링크가 만료되었거나 잘못되었습니다" description="로그인 화면에서 검증 메일을 다시 요청하세요." action={<Link to="/login"><Button>로그인으로</Button></Link>} />}
    </AuthLayout>
  );
}
