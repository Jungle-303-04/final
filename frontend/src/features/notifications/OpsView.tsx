import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  InboxIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDeadLetters, useReplayDeadLetter } from '@/features/notifications/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/shared/lib/format';
import type { DeadLetter } from '@/shared/lib/types';

type SortDirection = 'asc' | 'desc';
type SortKey = 'id' | 'subject' | 'consumer' | 'status' | 'created';

const EMPTY_DEAD_LETTERS: DeadLetter[] = [];

const COLUMNS: Array<{
  key?: SortKey;
  label: string;
  className?: string;
  align?: 'right';
}> = [
  { key: 'id', label: 'ID', className: 'w-20' },
  { key: 'subject', label: 'Subject', className: 'w-80' },
  { key: 'consumer', label: 'Consumer', className: 'w-48' },
  { label: '오류', className: 'w-80' },
  { key: 'status', label: '상태', className: 'w-28' },
  { key: 'created', label: '발생', className: 'w-36' },
  { label: '', align: 'right', className: 'w-28' },
];

export default function OpsView() {
  const deadLettersQ = useDeadLetters(true);
  const replay = useReplayDeadLetter();
  const [confirming, setConfirming] = useState<DeadLetter | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const deadLetters = deadLettersQ.data ?? EMPTY_DEAD_LETTERS;

  const visibleRows = useMemo(() => {
    if (!sort) return deadLetters;
    return [...deadLetters].sort((left, right) => {
      const leftValue = sortValue(left, sort.key);
      const rightValue = sortValue(right, sort.key);
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ko');
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [deadLetters, sort]);

  const updateSort = (key: SortKey) => {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <SettingsNav title="운영 DLQ">
      <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-title font-semibold text-text-primary">Dead Letter</CardTitle>
          <CardDescription className="text-body text-text-muted">
            처리에 실패한 이벤트를 확인하고 원인 조치 후 재처리합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {deadLettersQ.isPending && <LoadingTable />}
          {deadLettersQ.isError && (
            <div className="p-4">
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden="true" />
                <AlertTitle>목록 조회 실패</AlertTitle>
                <AlertDescription>{errorMessage(deadLettersQ.error)}</AlertDescription>
                <Button type="button" size="sm" variant="outline" onClick={() => void deadLettersQ.refetch()}>
                  다시 시도
                </Button>
              </Alert>
            </div>
          )}
          {!deadLettersQ.isPending && !deadLettersQ.isError && visibleRows.length === 0 && (
            <div className="grid min-h-64 place-items-center gap-3 p-6 text-center" role="status">
              <span className="grid size-10 place-items-center rounded-full bg-raised text-text-muted">
                <InboxIcon className="size-5" aria-hidden="true" />
              </span>
              <div className="grid gap-1">
                <h2 className="text-title font-semibold text-text-primary">Dead Letter 없음</h2>
                <p className="text-body text-text-muted">재처리가 필요한 실패 이벤트가 없습니다</p>
              </div>
            </div>
          )}
          {!deadLettersQ.isPending && !deadLettersQ.isError && visibleRows.length > 0 && (
            <Table className="table-fixed bg-surface">
              <TableHeader className="bg-raised text-label text-text-muted">
                <TableRow className="hover:bg-raised">
                  {COLUMNS.map((column, index) => {
                    const active = column.key != null && sort?.key === column.key;
                    const ariaSort = active
                      ? sort.direction === 'asc' ? 'ascending' : 'descending'
                      : column.key ? 'none' : undefined;
                    const SortIcon = active
                      ? sort.direction === 'asc' ? ArrowUpIcon : ArrowDownIcon
                      : ArrowUpDownIcon;
                    return (
                      <TableHead
                        key={column.key ?? 'static-' + index}
                        aria-sort={ariaSort}
                        className={cn(column.className, column.align === 'right' && 'text-right')}
                      >
                        {column.key ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={cn('-mx-2 text-text-muted', column.align === 'right' && 'ml-auto')}
                            onClick={() => updateSort(column.key!)}
                          >
                            {column.label}
                            <SortIcon data-icon="inline-end" aria-hidden="true" />
                          </Button>
                        ) : (
                          column.align === 'right'
                            ? <span className="sr-only">작업</span>
                            : column.label
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((item) => {
                  const rowPending = replay.isPending && replay.variables === item.id;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="tabular-nums text-text-secondary">{item.id}</TableCell>
                      <TableCell>
                        <code className="block truncate font-mono text-caption text-text-secondary">
                          {item.original_subject}
                        </code>
                      </TableCell>
                      <TableCell className="truncate text-text-secondary">{item.consumer}</TableCell>
                      <TableCell>
                        <span className="block truncate text-danger" title={item.error}>{item.error}</span>
                      </TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell>
                        <time dateTime={item.created_at} className="text-text-muted">
                          {timeAgo(item.created_at) || '시간 없음'}
                        </time>
                      </TableCell>
                      <TableCell className="text-right">
                        {item.status === 'open' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={replay.isPending}
                            aria-busy={rowPending}
                            onClick={() => setConfirming(item)}
                          >
                            {rowPending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                            재처리
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open && !replay.isPending) setConfirming(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Dead Letter 재처리</DialogTitle>
            <DialogDescription>
              원인이 해결된 뒤에만 같은 이벤트를 event bus로 다시 넣으세요
            </DialogDescription>
          </DialogHeader>
          {confirming && <DeadLetterDetails item={confirming} />}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={replay.isPending}
              onClick={() => setConfirming(null)}
            >
              취소
            </Button>
            <Button
              type="button"
              disabled={!confirming || replay.isPending}
              aria-busy={replay.isPending}
              onClick={() => {
                if (!confirming) return;
                replay.mutate(confirming.id, { onSuccess: () => setConfirming(null) });
              }}
            >
              {replay.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
              재처리 실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsNav>
  );
}

function LoadingTable() {
  return (
    <Table className="table-fixed" aria-label="Dead Letter 불러오는 중">
      <TableHeader className="bg-raised">
        <TableRow className="hover:bg-raised" aria-hidden="true">
          {COLUMNS.map((column, columnIndex) => (
            <TableHead key={column.key ?? 'static-' + columnIndex} className={column.className}>
              <Skeleton className="h-5 w-full" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }, (_, rowIndex) => (
          <TableRow key={rowIndex} aria-hidden="true">
            {COLUMNS.map((column, columnIndex) => (
              <TableCell key={column.key ?? 'static-' + columnIndex}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeadLetterDetails({ item }: { item: DeadLetter }) {
  return (
    <dl className="grid gap-3 rounded-panel border border-border bg-bg p-4">
      <DetailRow label="ID" value={item.id} />
      <DetailRow
        label="Subject"
        value={<code className="break-words font-mono text-caption">{item.original_subject}</code>}
      />
      <DetailRow label="Consumer" value={item.consumer} />
      <DetailRow label="오류" value={<span className="break-words text-danger">{item.error}</span>} />
    </dl>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
      <dt className="text-label font-medium text-text-muted">{label}</dt>
      <dd className="min-w-0 text-body text-text-primary">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const open = status === 'open';
  return (
    <Badge
      variant="outline"
      className={open
        ? 'border-danger/40 bg-danger/10 text-danger'
        : 'border-success/40 bg-success/10 text-success'}
    >
      {open ? '열림' : '처리됨'}
    </Badge>
  );
}

function sortValue(item: DeadLetter, key: SortKey): string | number {
  if (key === 'id') return item.id;
  if (key === 'subject') return item.original_subject;
  if (key === 'consumer') return item.consumer;
  if (key === 'status') return item.status;
  return item.created_at;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '잠시 후 다시 시도해주세요';
}
