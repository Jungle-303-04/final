// 알 수 없는 경로 — 몰래 홈으로 보내지 않고 정직한 404 를 보여준다
import { Link, useLocation } from 'react-router-dom';
import { Button, EmptyState } from '@/shared/ui';
import { IconAlertTriangle } from '@/shared/ui/icons';
import { FadeSlideIn } from '@/shared/motion';

export default function NotFoundPage() {
  const loc = useLocation();
  const home = loc.pathname === '/console' || loc.pathname.startsWith('/console/') ? '/console' : '/';
  return (
    <FadeSlideIn>
      <EmptyState
        icon={<IconAlertTriangle size={26} />}
        title="페이지를 찾을 수 없습니다"
        description={`요청한 경로(${loc.pathname})는 존재하지 않습니다. 주소를 확인하거나 홈으로 이동해주세요.`}
        action={<Link to={home}><Button variant="primary">홈으로 이동</Button></Link>}
      />
    </FadeSlideIn>
  );
}
