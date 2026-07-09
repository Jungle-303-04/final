import { CheckIcon, ClockIcon, CommandIcon, DotIcon, FlowIcon, JobsIcon, PanelIcon, SparkIcon, TerminalBoxIcon, WarnIcon } from './icons';
import type { CommandItem, DemoModule, DrillWorkflow, JobStatus, JobTemplate, ReferenceSource, SourceId, StatusMeta } from './types';

export const referenceSources: ReferenceSource[] = [
  {
    id: 'raycast',
    name: 'Raycast',
    url: 'https://www.raycast.com/',
    pattern: '전역 핫키로 현재 화면 위에 뜨는 런처',
    reusableIdea: 'AI 입력을 별도 페이지가 아니라 현재 작업 위에 얹는 quick layer로 취급',
  },
  {
    id: 'shadcn-command',
    name: 'shadcn Command',
    url: 'https://ui.shadcn.com/docs/components/radix/command',
    pattern: 'dialog 안에서 검색, 그룹, 단축키를 제공하는 command palette',
    reusableIdea: '명령, 페이지 이동, 최근 항목을 같은 입력면에서 다루는 구조',
  },
  {
    id: 'kbar',
    name: 'kbar',
    url: 'https://github.com/timc1/kbar',
    pattern: '액션을 데이터로 등록하고 검색 가능한 command + k 레이어로 실행',
    reusableIdea: '명령 정의를 UI에서 분리해 권한, 문맥, 단축키를 함께 관리',
  },
  {
    id: 'assistant-ui',
    name: 'assistant-ui',
    url: 'https://www.assistant-ui.com/',
    pattern: 'AI 채팅, thread, streaming, retry 중심의 대화 UI',
    reusableIdea: '채팅을 오른쪽 작업 패널로 두고 현재 화면의 맥락을 계속 유지',
  },
  {
    id: 'copilotkit',
    name: 'CopilotKit',
    url: 'https://www.copilotkit.ai/examples',
    pattern: '앱 내부 copilot, generative UI, form/data assistant 예제',
    reusableIdea: '대화 결과를 단순 텍스트가 아니라 앱 내부 카드와 액션으로 표시',
  },
  {
    id: 'ai-elements',
    name: 'AI Elements',
    url: 'https://elements.ai-sdk.dev/',
    pattern: 'Prompt, Conversation, Plan, Task, Tool, Terminal을 조합하는 AI UI kit',
    reusableIdea: 'AI가 생각하고 실행하는 과정을 plan, task, tool, terminal로 분리',
  },
  {
    id: 'sonner',
    name: 'Sonner',
    url: 'https://ui.shadcn.com/docs/components/radix/sonner',
    pattern: 'promise lifecycle을 loading, success, error toast로 표현',
    reusableIdea: '짧은 git 액션은 작업 센터까지 가지 않고 toast로 끝내는 기준선',
  },
  {
    id: 'vercel-logs',
    name: 'Vercel Build Logs',
    url: 'https://vercel.com/docs/deployments/logs',
    pattern: '빌드 진행, 색상 구분 로그, 실패 원인으로 바로 이동하는 로그 뷰',
    reusableIdea: '긴 실행은 상태 요약과 원문 로그를 한 화면에서 연결',
  },
  {
    id: 'github-actions',
    name: 'GitHub Actions logs',
    url: 'https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs',
    pattern: 'workflow, job, step, log 순서의 드릴다운 실행 기록',
    reusableIdea: '우리 앱에서는 git 갱신, 배포, 진단 작업을 job과 step으로 쪼개 보여주기',
  },
  {
    id: 'github-desktop',
    name: 'GitHub Desktop',
    url: 'https://github.blog/news-insights/product-news/github-desktop-3-0-brings-better-integration-for-your-pull-requests/',
    pattern: 'pull request check 상태와 중요한 알림만 드러내는 데스크톱 피드백',
    reusableIdea: '모든 이벤트를 알리지 않고 실패, 승인 필요, 완료 같은 고신호 상태만 강조',
  },
  {
    id: 'react-flow',
    name: 'React Flow',
    url: 'https://reactflow.dev/',
    pattern: '노드, 엣지, minimap, controls, custom node, sub flow로 만드는 인터랙티브 그래프',
    reusableIdea: 'workflow, agent plan, git dependency, cluster topology를 같은 캔버스 문법으로 재사용',
  },
];

export const modules: DemoModule[] = [
  {
    id: 'command',
    title: 'AI Quick Layer',
    summary: '단축키로 여는 입력창, 명령 검색, 현재 화면 문맥 기반 액션',
    sources: ['raycast', 'shadcn-command', 'kbar'],
    componentPath: 'frontend/src/dev/ui-layer-lab/components/AiCommandPaletteDemo.tsx',
  },
  {
    id: 'assistant',
    title: 'AI Workspace Panel',
    summary: '오른쪽 패널 안의 대화, 계획, 도구 호출, 결과 카드',
    sources: ['assistant-ui', 'copilotkit', 'ai-elements'],
    componentPath: 'frontend/src/dev/ui-layer-lab/components/AiWorkspacePanelDemo.tsx',
  },
  {
    id: 'jobs',
    title: 'Global Job Center',
    summary: 'git pull, push, deploy 같은 백그라운드 작업의 전역 진행 상태',
    sources: ['sonner', 'vercel-logs', 'github-desktop', 'ai-elements'],
    componentPath: 'frontend/src/dev/ui-layer-lab/components/GlobalJobCenterDemo.tsx',
  },
  {
    id: 'drilldown',
    title: 'Execution Drilldown',
    summary: 'workflow, job, step, log 구조를 우리 git/배포 액션에 맞춘 드릴뷰',
    sources: ['github-actions', 'vercel-logs', 'ai-elements'],
    componentPath: 'frontend/src/dev/ui-layer-lab/components/ExecutionDrilldownDemo.tsx',
  },
  {
    id: 'reactflow',
    title: 'React Flow Canvas',
    summary: '공식 React Flow 패턴을 workflow, agent plan, sub flow 레퍼런스로 정리',
    sources: ['react-flow'],
    componentPath: 'frontend/src/dev/ui-layer-lab/components/ReactFlowReferenceDemo.tsx',
  },
];

export const commandItems: CommandItem[] = [
  {
    id: 'repo-sync',
    group: 'Git',
    label: '현재 저장소 갱신',
    hint: 'fetch, pull, 충돌 검사까지 하나의 작업으로 실행',
    shortcut: 'G S',
    outcome: 'Job Center에 "Git 갱신 중" 작업이 생성되고 단계별 로그를 볼 수 있습니다.',
  },
  {
    id: 'push-branch',
    group: 'Git',
    label: '현재 브랜치 push',
    hint: '변경분 전송, 원격 상태 확인, PR check 연결',
    shortcut: 'G P',
    outcome: '짧게 끝나면 toast, 오래 걸리면 Job Center 카드로 승격됩니다.',
  },
  {
    id: 'summarize-screen',
    group: 'AI',
    label: '현재 화면 요약',
    hint: '선택한 배포, 클러스터, 인시던트 맥락을 AI 패널로 전달',
    shortcut: 'A S',
    outcome: 'AI Workspace Panel이 열리고 요약, 다음 액션, 참고 로그가 카드로 표시됩니다.',
  },
  {
    id: 'open-drilldown',
    group: 'Navigation',
    label: '최근 실행 드릴뷰 열기',
    hint: '실패한 step, 원문 로그, 재시도 버튼으로 이동',
    shortcut: 'D',
    outcome: 'Execution Drilldown에서 workflow, job, step, log 순서로 확인합니다.',
  },
  {
    id: 'rca-draft',
    group: 'AI',
    label: 'RCA 초안 작성',
    hint: '최근 알림과 workflow 로그를 묶어 원인 분석 초안을 생성',
    outcome: '대화창에는 초안, 오른쪽에는 근거 로그와 관련 리소스가 표시됩니다.',
  },
  {
    id: 'deploy-diff',
    group: 'Deploy',
    label: '배포 diff 검토',
    hint: '현재 commit과 target cluster 상태 차이를 시각화',
    shortcut: 'D F',
    outcome: '왼쪽에는 diff, 오른쪽에는 AI 설명과 승인 액션이 붙습니다.',
  },
];

export const jobTemplates: JobTemplate[] = [
  {
    kind: 'pull',
    title: 'Git 갱신',
    detail: 'origin/main 최신화와 충돌 가능성 확인',
    steps: ['remote refs 조회', '변경 파일 계산', 'fast-forward 적용', '워크플로우 재조회'],
  },
  {
    kind: 'push',
    title: '브랜치 push',
    detail: '현재 브랜치를 원격에 전송하고 check run 연결',
    steps: ['object 압축', '원격 전송', 'PR check 감지', '알림 연결'],
  },
  {
    kind: 'deploy',
    title: 'Preview 배포',
    detail: '변경분 빌드, 매니페스트 생성, preview URL 확인',
    steps: ['의존성 설치', '타입 검사', 'bundle 생성', 'preview 등록'],
  },
];

export const drillWorkflows: DrillWorkflow[] = [
  {
    id: 'wf-sync',
    title: 'Git 갱신 및 상태 반영',
    status: 'running',
    trigger: '사용자 명령: 현재 저장소 갱신',
    jobs: [
      {
        id: 'job-fetch',
        title: '원격 상태 수집',
        status: 'success',
        duration: '8.2s',
        steps: [
          {
            id: 'step-fetch-origin',
            title: 'origin fetch',
            status: 'success',
            duration: '2.1s',
            logs: ['$ git fetch origin main --prune', 'remote: Enumerating objects: 42', 'From github.com:team/kubeheal', ' * branch main -> FETCH_HEAD'],
          },
          {
            id: 'step-read-head',
            title: 'HEAD 비교',
            status: 'success',
            duration: '1.4s',
            logs: ['$ git rev-parse HEAD', 'local  a15b2aa', '$ git rev-parse FETCH_HEAD', 'remote b914d8c', 'ahead 0, behind 3'],
          },
        ],
      },
      {
        id: 'job-merge',
        title: '로컬 반영',
        status: 'running',
        duration: '14.7s',
        steps: [
          {
            id: 'step-ff',
            title: 'fast-forward 적용',
            status: 'running',
            duration: '진행 중',
            logs: ['$ git merge --ff-only FETCH_HEAD', 'Updating a15b2aa..b914d8c', 'frontend/src/app/router.tsx | 2 +', 'src/services/gitops/scm-worker/app.py | 18 +++++++---'],
          },
          {
            id: 'step-reconcile',
            title: '워크플로우 상태 재계산',
            status: 'queued',
            duration: '대기',
            logs: ['waiting for repository state projection'],
          },
        ],
      },
    ],
  },
  {
    id: 'wf-deploy',
    title: 'Preview 배포',
    status: 'failed',
    trigger: '브랜치 push 후 자동 실행',
    jobs: [
      {
        id: 'job-build',
        title: '프론트엔드 빌드',
        status: 'failed',
        duration: '41.3s',
        steps: [
          {
            id: 'step-install',
            title: '의존성 설치',
            status: 'success',
            duration: '18.4s',
            logs: ['$ npm ci', 'added 382 packages', 'found 0 vulnerabilities'],
          },
          {
            id: 'step-typecheck',
            title: '타입 검사',
            status: 'failed',
            duration: '6.8s',
            logs: ['$ npm run typecheck', 'src/features/repo/RepoDetailView.tsx:118:11 - error TS2322', 'Type "undefined" is not assignable to type "string".', 'build failed before artifact upload'],
          },
        ],
      },
      {
        id: 'job-notify',
        title: '실패 알림',
        status: 'success',
        duration: '1.1s',
        steps: [
          {
            id: 'step-notify',
            title: '작업 센터 업데이트',
            status: 'success',
            duration: '1.1s',
            logs: ['Job Center: Preview 배포 실패', 'linked drilldown: wf-deploy/job-build/step-typecheck'],
          },
        ],
      },
    ],
  },
];

export const sourceIcon: Record<SourceId, JSX.Element> = {
  raycast: <CommandIcon className="h-4 w-4" />,
  'shadcn-command': <CommandIcon className="h-4 w-4" />,
  kbar: <CommandIcon className="h-4 w-4" />,
  'assistant-ui': <PanelIcon className="h-4 w-4" />,
  copilotkit: <SparkIcon className="h-4 w-4" />,
  'ai-elements': <TerminalBoxIcon className="h-4 w-4" />,
  sonner: <JobsIcon className="h-4 w-4" />,
  'vercel-logs': <TerminalBoxIcon className="h-4 w-4" />,
  'github-actions': <FlowIcon className="h-4 w-4" />,
  'github-desktop': <JobsIcon className="h-4 w-4" />,
  'react-flow': <FlowIcon className="h-4 w-4" />,
};

export const statusMeta: Record<JobStatus, StatusMeta> = {
  queued: { label: '대기', tone: 'neutral', icon: <DotIcon className="h-4 w-4" /> },
  running: { label: '진행 중', tone: 'info', icon: <ClockIcon className="h-4 w-4 motion-safe:animate-pulse" /> },
  success: { label: '완료', tone: 'success', icon: <CheckIcon className="h-4 w-4" /> },
  failed: { label: '실패', tone: 'danger', icon: <WarnIcon className="h-4 w-4" /> },
  warning: { label: '주의', tone: 'warning', icon: <WarnIcon className="h-4 w-4" /> },
};
