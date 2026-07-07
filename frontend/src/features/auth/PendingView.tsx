import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState } from '@/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';

export default function PendingView() {
  const [sp] = useSearchParams();
  return (
    <AuthLayout title="승인 대기 중">
      <EmptyState icon={<ClockGlyph />} title="관리자 승인 대기"
        description={`${sp.get('email') ?? '계정'} 은(는) 승인 후 로그인할 수 있습니다.`}
        action={<Link to="/login"><Button variant="primary">로그인 재시도</Button></Link>} />
    </AuthLayout>
  );
}

function ClockGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 1.8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
