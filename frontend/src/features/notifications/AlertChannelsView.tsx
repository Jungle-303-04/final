import { useMemo, useState } from 'react';
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  InboxIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  type AlertChannel,
  type AlertChannelPayload,
  type AlertSeverity,
  useAlertChannels,
  useDeleteAlertChannel,
  useSaveAlertChannel,
  useTestAlertChannel,
} from '@/features/notifications/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/shared/lib/format';

const DEFAULT_FORM: AlertChannelForm = {
  channel_id: '',
  name: '',
  url: '',
  min_severity: 'warning',
  enabled: true,
  test_severity: 'warning',
  test_message: '알림 채널 테스트',
};

const EMPTY_CHANNELS: AlertChannel[] = [];

const CHANNEL_COLUMNS: Array<{
  key?: SortKey;
  label: string;
  className?: string;
  align?: 'right';
}> = [
  { key: 'name', label: '채널', className: 'w-80' },
  { key: 'severity', label: '최소 심각도', className: 'w-32' },
  { key: 'enabled', label: '상태', className: 'w-24' },
  { key: 'validation', label: '검증', className: 'w-36' },
  { key: 'updated', label: '수정', className: 'w-32' },
  { label: '', align: 'right', className: 'w-32' },
];

type AlertChannelForm = {
  channel_id: string;
  name: string;
  url: string;
  min_severity: AlertSeverity;
  enabled: boolean;
  test_severity: AlertSeverity;
  test_message: string;
};

type SortDirection = 'asc' | 'desc';
type SortKey = 'name' | 'severity' | 'enabled' | 'validation' | 'updated';

export default function AlertChannelsView() {
  const channelsQ = useAlertChannels();
  const testChannel = useTestAlertChannel();
  const saveChannel = useSaveAlertChannel();
  const deleteChannel = useDeleteAlertChannel();
  const [form, setForm] = useState<AlertChannelForm>(DEFAULT_FORM);
  const [testedSignature, setTestedSignature] = useState('');
  const [testError, setTestError] = useState('');
  const [deleting, setDeleting] = useState<AlertChannel | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection } | null>(null);
  const channels = channelsQ.data ?? EMPTY_CHANNELS;
  const signature = useMemo(() => formSignature(form), [form]);
  const validation = validateForm(form);
  const tested = testedSignature === signature;
  const editing = Boolean(form.channel_id);

  const visibleChannels = useMemo(() => {
    if (!sort) return channels;
    return [...channels].sort((left, right) => {
      const leftValue = channelSortValue(left, sort.key);
      const rightValue = channelSortValue(right, sort.key);
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'ko');
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [channels, sort]);

  function update<K extends keyof AlertChannelForm>(key: K, value: AlertChannelForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setTestedSignature('');
    setTestError('');
  }

  function editChannel(channel: AlertChannel) {
    const next = {
      channel_id: channel.channel_id,
      name: channel.name,
      url: channel.url,
      min_severity: normalizeSeverity(channel.min_severity),
      enabled: channel.enabled,
      test_severity: normalizeSeverity(channel.min_severity),
      test_message: '알림 채널 테스트',
    };
    setForm(next);
    setTestedSignature(channel.last_test_status === 'passed' ? formSignature(next) : '');
    setTestError('');
  }

  function resetForm() {
    setForm(DEFAULT_FORM);
    setTestedSignature('');
    setTestError('');
  }

  function updateSort(key: SortKey) {
    setSort((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }

  async function runTest() {
    if (!validation.valid) return;
    setTestedSignature('');
    setTestError('');
    try {
      const draft = await saveChannel.mutateAsync({
        ...(form.channel_id ? { channel_id: form.channel_id } : {}),
        name: form.name.trim(),
        kind: 'webhook',
        url: form.url.trim(),
        min_severity: form.min_severity,
        enabled: false,
      });
      const nextForm = { ...form, channel_id: draft.channel_id };
      setForm(nextForm);
      testChannel.mutate(
        {
          channel_id: draft.channel_id,
          name: nextForm.name.trim(),
          kind: 'webhook',
          url: nextForm.url.trim(),
          min_severity: nextForm.min_severity,
          enabled: false,
          severity: nextForm.test_severity,
          message: nextForm.test_message.trim() || '알림 채널 테스트',
        },
        {
          onSuccess: (result) => {
            if (result.valid && result.delivered) {
              setTestedSignature(formSignature(nextForm));
              toast.success('테스트 발송 완료', {
                description: result.detail || '알림 채널이 응답했습니다',
              });
              return;
            }
            const message = testResultMessage(result.detail, result.code, result.status_code);
            setTestError(message);
            toast.error('테스트 발송 실패', { description: message });
          },
          onError: (error) => {
            const message = (error as Error).message || '테스트 발송에 실패했습니다';
            setTestError(message);
            toast.error('테스트 발송 실패', { description: message });
          },
        },
      );
    } catch (error) {
      const message = (error as Error).message || '검증용 채널 초안 저장에 실패했습니다';
      setTestError(message);
      toast.error('테스트 준비 실패', { description: message });
    }
  }

  function save() {
    if (!validation.valid || !tested) return;
    const payload: AlertChannelPayload = {
      name: form.name.trim(),
      kind: 'webhook',
      url: form.url.trim(),
      min_severity: form.min_severity,
      enabled: form.enabled,
    };
    if (form.channel_id) payload.channel_id = form.channel_id;
    saveChannel.mutate(payload, {
      onSuccess: (saved) => {
        editChannel(saved);
      },
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteChannel.mutate(deleting.channel_id, {
      onSuccess: () => {
        if (form.channel_id === deleting.channel_id) resetForm();
        setDeleting(null);
      },
    });
  }

  return (
    <SettingsNav title="알림 채널">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
        <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-title font-semibold text-text-primary">채널 목록</CardTitle>
            <CardDescription className="text-body text-text-muted">
              인시던트와 운영 알림을 받을 Webhook 채널입니다
            </CardDescription>
            <CardAction>
              <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                새 채널
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {channelsQ.isPending && <LoadingChannelsTable />}
            {channelsQ.isError && (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertCircleIcon aria-hidden="true" />
                  <AlertTitle>목록 조회 실패</AlertTitle>
                  <AlertDescription>{queryErrorMessage(channelsQ.error)}</AlertDescription>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void channelsQ.refetch()}
                  >
                    다시 시도
                  </Button>
                </Alert>
              </div>
            )}
            {!channelsQ.isPending && !channelsQ.isError && visibleChannels.length === 0 && (
              <div className="grid min-h-64 place-items-center gap-3 p-6 text-center" role="status">
                <span className="grid size-10 place-items-center rounded-full bg-raised text-text-muted">
                  <InboxIcon className="size-5" aria-hidden="true" />
                </span>
                <div className="grid gap-1">
                  <h2 className="text-title font-semibold text-text-primary">알림 채널 없음</h2>
                  <p className="text-body text-text-muted">
                    첫 채널은 오른쪽 설정을 테스트한 뒤 저장합니다
                  </p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={resetForm}>
                  채널 설정
                </Button>
              </div>
            )}
            {!channelsQ.isPending && !channelsQ.isError && visibleChannels.length > 0 && (
              <Table className="table-fixed bg-surface">
                <TableHeader className="bg-raised text-label text-text-muted">
                  <TableRow className="hover:bg-raised">
                    {CHANNEL_COLUMNS.map((column, index) => {
                      const active = column.key != null && sort?.key === column.key;
                      const ariaSort = active
                        ? sort.direction === 'asc' ? 'ascending' : 'descending'
                        : column.key ? 'none' : undefined;
                      const SortIcon = active
                        ? sort.direction === 'asc' ? ArrowUpIcon : ArrowDownIcon
                        : ArrowUpDownIcon;
                      return (
                        <TableHead
                          key={column.key ?? `static-${index}`}
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
                            <span className="sr-only">작업</span>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleChannels.map((channel) => {
                    const rowDeletePending = deleteChannel.isPending
                      && deleteChannel.variables === channel.channel_id;
                    const updatedAt = channel.updated_at ?? channel.created_at ?? '';
                    return (
                      <TableRow key={channel.channel_id}>
                        <TableCell className="min-w-0">
                          <div className="grid min-w-0 gap-1">
                            <span className="truncate font-semibold text-text-primary">{channel.name}</span>
                            <code className="block truncate font-mono text-caption text-text-muted" title={channel.url}>
                              {channel.url}
                            </code>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={severityBadgeClass(channel.min_severity)}>
                            {severityLabel(channel.min_severity)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={enabledBadgeClass(channel.enabled)}>
                            {channel.enabled ? '활성' : '비활성'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="grid gap-1">
                            <Badge variant="outline" className={testStatusBadgeClass(channel.last_test_status)}>
                              {testStatusLabel(channel.last_test_status)}
                            </Badge>
                            {channel.last_tested_at ? (
                              <time dateTime={channel.last_tested_at} className="text-caption text-text-muted">
                                {timeAgo(channel.last_tested_at) || '기록 없음'}
                              </time>
                            ) : (
                              <span className="text-caption text-text-muted">기록 없음</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-text-secondary">
                          {updatedAt ? (
                            <time dateTime={updatedAt}>{timeAgo(updatedAt) || '시간 없음'}</time>
                          ) : (
                            '시간 없음'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => editChannel(channel)}>
                              편집
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={deleteChannel.isPending}
                              aria-busy={rowDeletePending}
                              onClick={() => setDeleting(channel)}
                            >
                              {rowDeletePending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                              삭제
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-panel border border-border bg-surface shadow-soft ring-0">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-title font-semibold text-text-primary">
              {editing ? '채널 수정' : '채널 추가'}
            </CardTitle>
            <CardDescription className="text-body text-text-muted">
              테스트 발송이 성공해야 저장할 수 있습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="alert-channel-name">이름</Label>
                <Input
                  id="alert-channel-name"
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder="운영 알림"
                  aria-describedby={validation.name ? 'alert-channel-name-error' : undefined}
                  aria-invalid={Boolean(validation.name)}
                />
                {validation.name && (
                  <p id="alert-channel-name-error" className="text-caption font-medium text-danger" role="alert">
                    {validation.name}
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="alert-channel-url">Webhook URL</Label>
                <Input
                  id="alert-channel-url"
                  value={form.url}
                  onChange={(event) => update('url', event.target.value)}
                  placeholder="https://example.com/webhook"
                  aria-describedby="alert-channel-url-message"
                  aria-invalid={Boolean(validation.url)}
                />
                <p
                  id="alert-channel-url-message"
                  className={cn('text-caption', validation.url ? 'font-medium text-danger' : 'text-text-muted')}
                  role={validation.url ? 'alert' : undefined}
                >
                  {validation.url ?? 'HTTPS Webhook URL만 저장할 수 있습니다'}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="alert-channel-min-severity">최소 심각도</Label>
                <Select
                  value={form.min_severity}
                  onValueChange={(value) => {
                    if (value !== null) update('min_severity', value as AlertSeverity);
                  }}
                >
                  <SelectTrigger id="alert-channel-min-severity" className="w-full" aria-invalid={false}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">정보 이상</SelectItem>
                    <SelectItem value="warning">주의 이상</SelectItem>
                    <SelectItem value="critical">심각만</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="alert-channel-enabled"
                  checked={form.enabled}
                  onCheckedChange={(checked) => update('enabled', checked === true)}
                  aria-describedby="alert-channel-enabled-description"
                  aria-invalid={false}
                />
                <div className="grid gap-1">
                  <Label htmlFor="alert-channel-enabled">채널 활성</Label>
                  <p id="alert-channel-enabled-description" className="text-caption text-text-muted">
                    비활성 채널은 저장되어도 alert-worker가 발송 대상에서 제외합니다
                  </p>
                </div>
              </div>

              <div className="grid gap-3 rounded-panel border border-border bg-bg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-text-primary">테스트 발송</p>
                    <p className="text-caption text-text-secondary">
                      현재 입력값 그대로 실제 Webhook 요청을 보냅니다
                    </p>
                  </div>
                  <Badge variant="outline" className={testGateBadgeClass(tested, Boolean(testError))}>
                    {tested ? '통과' : testError ? '실패' : '필요'}
                  </Badge>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="alert-channel-test-severity">테스트 심각도</Label>
                  <Select
                    value={form.test_severity}
                    onValueChange={(value) => {
                      if (value !== null) update('test_severity', value as AlertSeverity);
                    }}
                  >
                    <SelectTrigger id="alert-channel-test-severity" className="w-full" aria-invalid={false}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">정보</SelectItem>
                      <SelectItem value="warning">주의</SelectItem>
                      <SelectItem value="critical">심각</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="alert-channel-test-message">테스트 메시지</Label>
                  <Textarea
                    id="alert-channel-test-message"
                    value={form.test_message}
                    onChange={(event) => update('test_message', event.target.value)}
                    aria-describedby={validation.message ? 'alert-channel-test-message-error' : undefined}
                    aria-invalid={Boolean(validation.message)}
                  />
                  {validation.message && (
                    <p
                      id="alert-channel-test-message-error"
                      className="text-caption font-medium text-danger"
                      role="alert"
                    >
                      {validation.message}
                    </p>
                  )}
                </div>

                {testError && (
                  <Alert variant="destructive">
                    <AlertCircleIcon aria-hidden="true" />
                    <AlertTitle>테스트 발송 실패</AlertTitle>
                    <AlertDescription>{testError}</AlertDescription>
                  </Alert>
                )}
                {tested && (
                  <Alert className="border-success/40 bg-success/10 text-success" role="status">
                    <AlertTitle>테스트 발송 통과</AlertTitle>
                    <AlertDescription className="text-success">
                      현재 입력값의 테스트 발송이 성공했습니다. 값을 바꾸면 다시 테스트해야 합니다.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  type="button"
                  disabled={!validation.valid || saveChannel.isPending || testChannel.isPending}
                  aria-busy={saveChannel.isPending || testChannel.isPending}
                  onClick={() => {
                    void runTest();
                  }}
                >
                  {(saveChannel.isPending || testChannel.isPending) && (
                    <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                  )}
                  테스트 발송
                </Button>
              </div>
              <Button
                type="submit"
                disabled={!validation.valid || !tested || saveChannel.isPending}
                aria-busy={saveChannel.isPending}
              >
                {saveChannel.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
                저장
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !deleteChannel.isPending) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>알림 채널 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${deleting.name} 채널을 삭제합니다. 이후 이 채널로는 알림이 발송되지 않습니다.`
                : undefined}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteChannel.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={!deleting || deleteChannel.isPending}
              aria-busy={deleteChannel.isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
            >
              {deleteChannel.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden="true" />}
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsNav>
  );
}

function LoadingChannelsTable() {
  return (
    <Table className="table-fixed" aria-label="알림 채널 불러오는 중">
      <TableHeader className="bg-raised">
        <TableRow className="hover:bg-raised" aria-hidden="true">
          {CHANNEL_COLUMNS.map((column, index) => (
            <TableHead key={column.key ?? `static-${index}`} className={column.className}>
              <Skeleton className="h-5 w-full" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 6 }, (_, rowIndex) => (
          <TableRow key={rowIndex} aria-hidden="true">
            {CHANNEL_COLUMNS.map((column, columnIndex) => (
              <TableCell key={column.key ?? `static-${columnIndex}`}>
                <Skeleton className="h-5 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function validateForm(form: AlertChannelForm) {
  const name = form.name.trim().length === 0 ? '채널 이름을 입력해주세요' : undefined;
  const url = validateUrl(form.url);
  const message = form.test_message.trim().length === 0 ? '테스트 메시지를 입력해주세요' : undefined;
  return { name, url, message, valid: !name && !url && !message };
}

function validateUrl(value: string): string | undefined {
  if (!value.trim()) return 'Webhook URL을 입력해주세요';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return 'HTTPS Webhook URL만 사용할 수 있습니다';
    return undefined;
  } catch {
    return '올바른 URL 형식이 아닙니다';
  }
}

function formSignature(form: AlertChannelForm): string {
  return JSON.stringify({
    name: form.name.trim(),
    kind: 'webhook',
    url: form.url.trim(),
    min_severity: form.min_severity,
    enabled: form.enabled,
    severity: form.test_severity,
    message: form.test_message.trim(),
  });
}

function normalizeSeverity(value: string): AlertSeverity {
  if (value === 'info' || value === 'critical') return value;
  return 'warning';
}

function severityRank(value: string): number {
  if (value === 'info') return 0;
  if (value === 'critical') return 2;
  return 1;
}

function severityLabel(value: string): string {
  if (value === 'info') return '정보 이상';
  if (value === 'critical') return '심각만';
  return '주의 이상';
}

function severityBadgeClass(value: string): string {
  if (value === 'info') return 'border-info/40 bg-info/10 text-info';
  if (value === 'critical') return 'border-danger/40 bg-danger/10 text-danger';
  return 'border-warning/40 bg-warning/10 text-warning';
}

function enabledBadgeClass(enabled: boolean): string {
  return enabled
    ? 'border-success/40 bg-success/10 text-success'
    : 'border-border bg-raised text-text-secondary';
}

function testStatusLabel(value?: string | null): string {
  if (value === 'passed') return '검증 통과';
  if (value === 'failed') return '검증 실패';
  return '미검증';
}

function testStatusBadgeClass(value?: string | null): string {
  if (value === 'passed') return 'border-success/40 bg-success/10 text-success';
  if (value === 'failed') return 'border-danger/40 bg-danger/10 text-danger';
  return 'border-warning/40 bg-warning/10 text-warning';
}

function testGateBadgeClass(tested: boolean, failed: boolean): string {
  if (tested) return 'border-success/40 bg-success/10 text-success';
  if (failed) return 'border-danger/40 bg-danger/10 text-danger';
  return 'border-warning/40 bg-warning/10 text-warning';
}

function channelSortValue(channel: AlertChannel, key: SortKey): string | number {
  if (key === 'name') return channel.name;
  if (key === 'severity') return severityRank(channel.min_severity);
  if (key === 'enabled') return Number(channel.enabled);
  if (key === 'validation') return channel.last_tested_at ?? '';
  return channel.updated_at ?? channel.created_at ?? '';
}

function queryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '');
}

function testResultMessage(detail: string, code?: string | null, statusCode?: number | null): string {
  if (detail) return statusCode ? `${detail} (${statusCode})` : detail;
  if (code === 'timeout') return 'Webhook 응답 시간이 초과되었습니다';
  return '테스트 알림 전송에 실패했습니다';
}
