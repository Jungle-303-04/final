import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState } from '@/shared/ui';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { IconClock } from '@/shared/ui/icons';

export default function PendingView() {
  const [sp] = useSearchParams();
  return (
    <AuthLayout title="승인 대기 중">
      <EmptyState icon={<IconClock size={26} />} title="관리자 승인 대기 중"
        description={`${sp.get('email') ?? '계정'} 은(는) 승인 후 로그인할 수 있습니다.`}
        action={<Link to="/login"><Button variant="primary">로그인 다시 시도</Button></Link>} />
    </AuthLayout>
  );
}
