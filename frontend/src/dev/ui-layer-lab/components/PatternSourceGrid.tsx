import { ModuleFrame, SourcePills } from './ReferenceScaffold';
import { modules, referenceSources } from '../data';

export function PatternSourceGrid() {
  return (
    <ModuleFrame
      title="Reference Inventory"
      summary="외부 제품과 공식 문서에서 가져온 패턴을 우리 앱에서 재사용할 수 있는 모듈 단위로 정리했습니다."
      sources={referenceSources.map((item) => item.id)}
    >
      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {modules.map((module) => (
          <article key={module.id} className="grid min-w-0 gap-3 rounded-panel border border-border bg-bg p-4">
            <div>
              <h3 className="text-body font-semibold text-primary">{module.title}</h3>
              <p className="mt-1 text-label text-secondary">{module.summary}</p>
            </div>
            <SourcePills ids={module.sources} />
            <p className="truncate rounded-control border border-border bg-surface px-3 py-2 font-mono text-caption text-muted">
              {module.componentPath}
            </p>
          </article>
        ))}
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        {referenceSources.map((source) => (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="grid gap-2 rounded-panel border border-border bg-bg p-4 transition-colors hover:border-border-strong hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-body font-semibold text-primary">{source.name}</h3>
              <span className="text-caption text-muted">source</span>
            </div>
            <p className="text-label font-medium text-secondary">{source.pattern}</p>
            <p className="text-caption text-muted">{source.reusableIdea}</p>
          </a>
        ))}
      </div>
    </ModuleFrame>
  );
}
