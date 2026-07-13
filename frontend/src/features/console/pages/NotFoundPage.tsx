// 알 수 없는 경로 — 몰래 홈으로 보내지 않고 정직한 404 를 보여준다
import { Link, useLocation } from 'react-router-dom';
import { TriangleAlertIcon } from 'lucide-react';
import { Button, EmptyState } from '@/ui';

export default function NotFoundPage() {
  const loc = useLocation();
  const home = loc.pathname === '/console' || loc.pathname.startsWith('/console/') ? '/console' : '/';
  return (
    <div className="grid min-h-96 place-items-center">
      <EmptyState
        icon={<AlertIcon />}
        title="페이지 없음"
        description={`요청한 경로(${loc.pathname})는 존재하지 않습니다. 주소를 확인하거나 홈으로 이동해주세요.`}
        action={<Link to={home}><Button variant="primary">홈</Button></Link>}
      />
    </div>
  );
}

function AlertIcon() {
  return <TriangleAlertIcon className="h-5 w-5" aria-hidden="true" />;
}
