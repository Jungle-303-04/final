import type { ReactNode } from 'react';

export type SourceId =
  | 'raycast'
  | 'shadcn-command'
  | 'kbar'
  | 'assistant-ui'
  | 'copilotkit'
  | 'ai-elements'
  | 'sonner'
  | 'vercel-logs'
  | 'github-actions'
  | 'github-desktop'
  | 'react-flow';

export type ReferenceSource = {
  id: SourceId;
  name: string;
  url: string;
  pattern: string;
  reusableIdea: string;
};

export type DemoModule = {
  id: string;
  title: string;
  summary: string;
  sources: SourceId[];
  componentPath: string;
};

export type CommandItem = {
  id: string;
  group: string;
  label: string;
  hint: string;
  shortcut?: string;
  outcome: string;
};

export type JobStatus = 'queued' | 'running' | 'success' | 'failed' | 'warning';

export type JobTemplate = {
  kind: string;
  title: string;
  detail: string;
  steps: string[];
};

export type RunningJob = JobTemplate & {
  id: string;
  status: JobStatus;
  progress: number;
  startedAt: number;
  logs: string[];
};

export type DrillStep = {
  id: string;
  title: string;
  status: JobStatus;
  duration: string;
  logs: string[];
};

export type DrillJob = {
  id: string;
  title: string;
  status: JobStatus;
  duration: string;
  steps: DrillStep[];
};

export type DrillWorkflow = {
  id: string;
  title: string;
  status: JobStatus;
  trigger: string;
  jobs: DrillJob[];
};

export type StatusMeta = {
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  icon: ReactNode;
};
