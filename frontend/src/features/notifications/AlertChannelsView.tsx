import { useMemo, useState } from 'react';
import { SettingsNav } from '@/features/org/SettingsNav';
import { timeAgo } from '@/shared/lib/format';
import {
  type AlertChannel,
  type AlertChannelPayload,
  type AlertSeverity,
  useAlertChannels,
  useDeleteAlertChannel,
  useSaveAlertChannel,
  useTestAlertChannel,
} from '@/features/notifications/api';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Field, Input, Select, Table, Textarea, type TableColumn, useToast } from '@/ui';

const DEFAULT_FORM: AlertChannelForm = {
  channel_id: '',
  name: '',
  url: '',
  min_severity: 'warning',
  enabled: true,
  test_severity: 'warning',
  test_message: '알림 채널 테스트',
};

type AlertChannelForm = {
  channel_id: string;
  name: string;
  url: string;
  min_severity: AlertSeverity;
  enabled: boolean;
  test_severity: AlertSeverity;
  test_message: string;
};

export default function AlertChannelsView() {
  const channelsQ = useAlertChannels();
  const testChannel = useTestAlertChannel();
  const saveChannel = useSaveAlertChannel();
  const deleteChannel = useDeleteAlertChannel();
  const { push } = useToast();
  const [form, setForm] = useState<AlertChannelForm>(DEFAULT_FORM);
  const [testedSignature, setTestedSignature] = useState('');
  const [testError, setTestError] = useState('');
  const [deleting, setDeleting] = useState<AlertChannel | null>(null);
  const signature = useMemo(() => formSignature(form), [form]);
  const validation = validateForm(form);
  const tested = testedSignature === signature;
  const editing = Boolean(form.channel_id);
  const columns: TableColumn<AlertChannel>[] = [
    {
      id: 'name',
      header: '채널',
      sortValue: item => item.name,
      cell: item => (
        <div className="grid gap-1">
          <span className="truncate font-semibold text-text-primary">{item.name}</span>
          <code className="truncate font-mono text-caption text-text-muted">{item.url}</code>
        </div>
      ),
      width: 'lg',
    },
    {
      id: 'severity',
      header: '최소 심각도',
      sortValue: item => severityRank(item.min_severity),
      cell: item => <Badge tone={severityTone(item.min_severity)}>{severityLabel(item.min_severity)}</Badge>,
    },
    {
      id: 'enabled',
      header: '상태',
      sortValue: item => Number(item.enabled),
      cell: item => <Badge tone={item.enabled ? 'success' : 'neutral'}>{item.enabled ? '활성' : '비활성'}</Badge>,
    },
    {
      id: 'validation',
      header: '검증',
      sortValue: item => item.last_tested_at ?? '',
      cell: item => (
        <div className="grid gap-1">
          <Badge tone={testStatusTone(item.last_test_status)}>{testStatusLabel(item.last_test_status)}</Badge>
          <span className="text-caption text-text-muted">{timeAgo(item.last_tested_at ?? '') || '기록 없음'}</span>
        </div>
      ),
    },
    {
      id: 'updated',
      header: '수정',
      sortValue: item => item.updated_at ?? item.created_at ?? '',
      cell: item => timeAgo(item.updated_at ?? item.created_at ?? '') || '시간 없음',
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: item => (
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => editChannel(item)}>편집</Button>
          <Button size="sm" variant="danger" loading={deleteChannel.isPending && deleteChannel.variables === item.channel_id} disabled={deleteChannel.isPending} onClick={() => setDeleting(item)}>삭제</Button>
        </div>
      ),
    },
  ];

  function update<K extends keyof AlertChannelForm>(key: K, value: AlertChannelForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
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
          onSuccess: result => {
            if (result.valid && result.delivered) {
              setTestedSignature(formSignature(nextForm));
              push({ tone: 'success', title: '테스트 발송 완료', description: result.detail || '알림 채널이 응답했습니다' });
              return;
            }
            setTestError(testResultMessage(result.detail, result.code, result.status_code));
            push({ tone: 'danger', title: '테스트 발송 실패', description: testResultMessage(result.detail, result.code, result.status_code) });
          },
          onError: error => {
            const message = (error as Error).message || '테스트 발송에 실패했습니다';
            setTestError(message);
            push({ tone: 'danger', title: '테스트 발송 실패', description: message });
          },
        },
      );
    } catch (error) {
      const message = (error as Error).message || '검증용 채널 초안 저장에 실패했습니다';
      setTestError(message);
      push({ tone: 'danger', title: '테스트 준비 실패', description: message });
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
    saveChannel.mutate(payload, { onSuccess: saved => editChannel(saved) });
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
        <Card title="채널 목록" description="인시던트와 운영 알림을 받을 Webhook 채널입니다" actions={<Button size="sm" onClick={resetForm}>새 채널</Button>}>
          <Table
            rows={channelsQ.data ?? []}
            columns={columns}
            rowKey={item => item.channel_id}
            loading={channelsQ.isPending}
            error={channelsQ.isError ? channelsQ.error : null}
            onRetry={() => void channelsQ.refetch()}
            empty={<EmptyState title="알림 채널 없음" description="첫 채널은 오른쪽 설정을 테스트한 뒤 저장합니다" action={<Button size="sm" onClick={resetForm}>채널 설정</Button>} />}
          />
        </Card>

        <Card title={editing ? '채널 수정' : '채널 추가'} description="테스트 발송이 성공해야 저장할 수 있습니다">
          <form
            className="grid gap-4"
            onSubmit={event => {
              event.preventDefault();
              save();
            }}
          >
            <Field label="이름" error={validation.name}>
              <Input value={form.name} onChange={event => update('name', event.target.value)} placeholder="운영 알림" />
            </Field>
            <Field label="Webhook URL" error={validation.url} help="HTTPS Webhook URL만 저장할 수 있습니다">
              <Input value={form.url} onChange={event => update('url', event.target.value)} placeholder="https://example.com/webhook" />
            </Field>
            <Field label="최소 심각도">
              <Select value={form.min_severity} onChange={event => update('min_severity', event.target.value as AlertSeverity)}>
                <option value="info">정보 이상</option>
                <option value="warning">주의 이상</option>
                <option value="critical">심각만</option>
              </Select>
            </Field>
            <Checkbox
              checked={form.enabled}
              onChange={event => update('enabled', event.target.checked)}
              label="채널 활성"
              description="비활성 채널은 저장되어도 alert-worker가 발송 대상에서 제외합니다"
            />
            <div className="grid gap-3 rounded-panel border border-border bg-bg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-text-primary">테스트 발송</p>
                  <p className="text-caption text-text-secondary">현재 입력값 그대로 실제 Webhook 요청을 보냅니다</p>
                </div>
                <Badge tone={tested ? 'success' : testError ? 'danger' : 'warning'}>{tested ? '통과' : testError ? '실패' : '필요'}</Badge>
              </div>
              <Field label="테스트 심각도">
                <Select value={form.test_severity} onChange={event => update('test_severity', event.target.value as AlertSeverity)}>
                  <option value="info">정보</option>
                  <option value="warning">주의</option>
                  <option value="critical">심각</option>
                </Select>
              </Field>
              <Field label="테스트 메시지" error={validation.message}>
                <Textarea value={form.test_message} onChange={event => update('test_message', event.target.value)} />
              </Field>
              {testError && <p className="text-caption font-medium text-danger" role="alert">{testError}</p>}
              {tested && <p className="text-caption font-medium text-success">현재 입력값의 테스트 발송이 성공했습니다. 값을 바꾸면 다시 테스트해야 합니다.</p>}
              <Button
                type="button"
                loading={saveChannel.isPending || testChannel.isPending}
                disabled={!validation.valid || saveChannel.isPending || testChannel.isPending}
                onClick={runTest}
              >
                테스트 발송
              </Button>
            </div>
            <Button type="submit" variant="primary" loading={saveChannel.isPending} disabled={!validation.valid || !tested || saveChannel.isPending}>
              저장
            </Button>
          </form>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="알림 채널 삭제"
        description={deleting ? `${deleting.name} 채널을 삭제합니다. 이후 이 채널로는 알림이 발송되지 않습니다.` : undefined}
        confirmLabel="삭제"
        pending={deleteChannel.isPending}
        onConfirm={confirmDelete}
        onOpenChange={open => {
          if (!open) setDeleting(null);
        }}
      />
    </SettingsNav>
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

function severityTone(value: string): 'info' | 'warning' | 'danger' {
  if (value === 'info') return 'info';
  if (value === 'critical') return 'danger';
  return 'warning';
}

function testStatusLabel(value?: string | null): string {
  if (value === 'passed') return '검증 통과';
  if (value === 'failed') return '검증 실패';
  return '미검증';
}

function testStatusTone(value?: string | null): 'success' | 'danger' | 'warning' {
  if (value === 'passed') return 'success';
  if (value === 'failed') return 'danger';
  return 'warning';
}

function testResultMessage(detail: string, code?: string | null, statusCode?: number | null): string {
  if (detail) return statusCode ? `${detail} (${statusCode})` : detail;
  if (code === 'timeout') return 'Webhook 응답 시간이 초과되었습니다';
  return '테스트 알림 전송에 실패했습니다';
}
