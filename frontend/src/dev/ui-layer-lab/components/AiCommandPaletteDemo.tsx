import { useEffect, useMemo, useState } from 'react';
import { Button, cx } from '@/ui';
import { ArrowRightIcon, CommandIcon, SearchIcon, SparkIcon } from '../icons';
import { commandItems, modules } from '../data';
import { KeyCap, ModuleFrame, ReferenceCode } from './ReferenceScaffold';

const moduleMeta = modules.find((item) => item.id === 'command')!;

export function AiCommandPaletteDemo() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState(commandItems[0].id);
  const active = commandItems.find((item) => item.id === activeId) ?? commandItems[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commandItems;
    return commandItems.filter((item) =>
      [item.label, item.hint, item.group, item.outcome].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [query]);
  const groups = useMemo(() => {
    return filtered.reduce<Record<string, typeof commandItems>>((acc, item) => {
      acc[item.group] = [...(acc[item.group] ?? []), item];
      return acc;
    }, {});
  }, [filtered]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <ModuleFrame
      title={moduleMeta.title}
      summary={moduleMeta.summary}
      sources={moduleMeta.sources}
      actions={<Button leadingIcon={<CommandIcon className="h-4 w-4" />} onClick={() => setOpen(true)}>Command 열기</Button>}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="relative min-h-[28rem] overflow-hidden rounded-panel border border-border bg-bg p-4">
          <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
            <div className="min-w-0">
              <p className="text-label font-semibold text-secondary">현재 화면</p>
              <h3 className="mt-1 text-title font-semibold text-primary">repo/kubeheal · 배포 상세</h3>
            </div>
            <div className="flex items-center gap-1">
              <KeyCap>⌘</KeyCap>
              <KeyCap>K</KeyCap>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {['main behind 3', '2 checks running', '1 approval waiting'].map((item) => (
              <div key={item} className="rounded-panel border border-border bg-surface p-3">
                <p className="text-caption font-semibold uppercase text-muted">{item.split(' ')[0]}</p>
                <p className="mt-2 text-body font-semibold text-primary">{item}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 rounded-panel border border-border bg-surface p-3">
            <p className="text-label font-semibold text-secondary">선택된 명령 결과</p>
            <div className="rounded-panel border border-border bg-bg p-3">
              <div className="flex items-center gap-2">
                <SparkIcon className="h-4 w-4 text-accent" />
                <p className="text-body font-semibold text-primary">{active.label}</p>
              </div>
              <p className="mt-2 text-label text-secondary">{active.outcome}</p>
            </div>
          </div>

          {open && (
            <div className="absolute inset-0 z-10 grid place-items-start bg-bg/70 p-4 backdrop-blur-sm">
              <div className="mx-auto mt-8 w-full max-w-2xl overflow-hidden rounded-panel border border-border bg-surface shadow-elevated">
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="명령, 페이지, AI 작업 검색"
                    className="h-9 min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-muted"
                  />
                  <KeyCap>Esc</KeyCap>
                </div>
                <div className="max-h-80 overflow-auto p-2">
                  {Object.entries(groups).map(([group, items]) => (
                    <div key={group} className="py-2">
                      <p className="px-2 pb-1 text-caption font-semibold uppercase text-muted">{group}</p>
                      <div className="grid gap-1">
                        {items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={cx(
                              'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-control px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                              activeId === item.id ? 'bg-raised text-primary' : 'text-secondary hover:bg-raised hover:text-primary',
                            )}
                            onClick={() => {
                              setActiveId(item.id);
                              setOpen(false);
                            }}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-body font-semibold">{item.label}</span>
                              <span className="block truncate text-caption text-muted">{item.hint}</span>
                            </span>
                            <span className="inline-flex items-center gap-2 text-caption text-muted">
                              {item.shortcut && <span>{item.shortcut}</span>}
                              <ArrowRightIcon className="h-4 w-4" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <p className="px-3 py-8 text-center text-body text-muted">검색 결과 없음</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <ReferenceCode
          path={moduleMeta.componentPath}
          notes={[
            '전역 단축키는 열기만 담당하고 실행 결과는 Job Center나 AI Panel로 넘깁니다.',
            '명령은 데이터 배열로 관리해 권한, 현재 페이지 문맥, 단축키를 함께 필터링할 수 있습니다.',
            '검색 결과가 비어도 같은 컨테이너 안에서 empty 상태를 보여줘 레이어 높이가 튀지 않게 합니다.',
          ]}
        />
      </div>
    </ModuleFrame>
  );
}
