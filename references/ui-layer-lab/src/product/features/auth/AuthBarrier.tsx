import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import {
  AuthPortFailure,
  type AuthActionIssue,
  type AuthCredentials,
  type AuthFailureCode,
  type AuthPort,
  type AuthSessionResult,
  type AuthenticatedAuthState,
  type ProductSession,
} from "./authContract";
import { AuthLoginScreen, SessionFailureScreen } from "./AuthBarrierScreens";

interface AuthBarrierProps {
  children: (auth: AuthenticatedAuthState) => ReactNode;
  port: AuthPort;
}

type AuthBarrierState =
  | { kind: "checking" }
  | { kind: "unauthenticated"; issue: AuthActionIssue | null; signInPending: boolean }
  | {
      kind: "authenticated";
      session: ProductSession;
      signOutIssue: AuthActionIssue | null;
      signOutPending: boolean;
    }
  | { kind: "error"; issue: AuthActionIssue };

interface SessionRequest {
  controller: AbortController;
  promise: Promise<AuthSessionResult>;
  refCount: number;
}

const sessionRequests = new WeakMap<AuthPort, SessionRequest>();

export function AuthBarrier({ children, port }: AuthBarrierProps) {
  const [state, setState] = useState<AuthBarrierState>({ kind: "checking" });
  const [sessionRevision, setSessionRevision] = useState(0);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const mutationPendingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mutationControllerRef.current?.abort();
      mutationControllerRef.current = null;
      mutationPendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const request = acquireSessionRequest(port);

    void request.promise.then(
      (result) => {
        if (!active) return;
        if (result.status === "authenticated") {
          setState({
            kind: "authenticated",
            session: result.session,
            signOutIssue: null,
            signOutPending: false,
          });
        } else {
          setState({ kind: "unauthenticated", issue: null, signInPending: false });
        }
      },
      (error: unknown) => {
        if (!active || isAbortError(error)) return;
        setState({ kind: "error", issue: toAuthActionIssue(error) });
      },
    );

    return () => {
      active = false;
      request.release();
    };
  }, [port, sessionRevision]);

  const retrySession = useCallback(() => {
    if (state.kind === "checking") return;
    setState({ kind: "checking" });
    setSessionRevision((revision) => revision + 1);
  }, [state.kind]);

  const signIn = useCallback(async (credentials: AuthCredentials) => {
    if (mutationPendingRef.current) return;
    mutationPendingRef.current = true;
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setState((current) => current.kind === "unauthenticated"
      ? { ...current, issue: null, signInPending: true }
      : current);

    try {
      const session = await port.signIn(credentials, controller.signal);
      if (!mountedRef.current) return;
      setState({
        kind: "authenticated",
        session,
        signOutIssue: null,
        signOutPending: false,
      });
    } catch (error) {
      if (!mountedRef.current || isAbortError(error)) return;
      setState({
        kind: "unauthenticated",
        issue: toAuthActionIssue(error),
        signInPending: false,
      });
    } finally {
      if (mutationControllerRef.current === controller) {
        mutationControllerRef.current = null;
        mutationPendingRef.current = false;
      }
    }
  }, [port]);

  const signOut = useCallback(async () => {
    if (mutationPendingRef.current || state.kind !== "authenticated") return;
    const session = state.session;
    mutationPendingRef.current = true;
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    setState({
      kind: "authenticated",
      session,
      signOutIssue: null,
      signOutPending: true,
    });

    try {
      await port.signOut(controller.signal);
      if (!mountedRef.current) return;
      setState({ kind: "unauthenticated", issue: null, signInPending: false });
    } catch (error) {
      if (!mountedRef.current || isAbortError(error)) return;
      setState({
        kind: "authenticated",
        session,
        signOutIssue: logoutIssue(error),
        signOutPending: false,
      });
    } finally {
      if (mutationControllerRef.current === controller) {
        mutationControllerRef.current = null;
        mutationPendingRef.current = false;
      }
    }
  }, [port, state]);

  const signOutHandler = useCallback(() => {
    void signOut();
  }, [signOut]);

  if (state.kind === "checking") return <ProductStateScreen kind="loading" />;
  if (state.kind === "unauthenticated") {
    return (
      <AuthLoginScreen
        issue={state.issue}
        onSubmit={(credentials) => void signIn(credentials)}
        pending={state.signInPending}
      />
    );
  }
  if (state.kind === "error") {
    return <SessionFailureScreen issue={state.issue} onRetry={retrySession} />;
  }

  return (
    <AuthenticatedRender
      onSignOut={signOutHandler}
      render={children}
      session={state.session}
      signOutIssue={state.signOutIssue}
      signOutPending={state.signOutPending}
    />
  );
}

function acquireSessionRequest(port: AuthPort) {
  let request = sessionRequests.get(port);
  if (!request) {
    const controller = new AbortController();
    request = {
      controller,
      promise: port.loadSession(controller.signal).finally(() => {
        if (sessionRequests.get(port) === request) sessionRequests.delete(port);
      }),
      refCount: 0,
    };
    sessionRequests.set(port, request);
  }

  request.refCount += 1;

  return {
    promise: request.promise,
    release() {
      request.refCount -= 1;
      queueMicrotask(() => {
        if (request.refCount === 0 && sessionRequests.get(port) === request) {
          request.controller.abort();
          sessionRequests.delete(port);
        }
      });
    },
  };
}

function AuthenticatedRender({
  onSignOut,
  render,
  session,
  signOutIssue,
  signOutPending,
}: {
  onSignOut: () => void;
  render: (auth: AuthenticatedAuthState) => ReactNode;
  session: ProductSession;
  signOutIssue: AuthActionIssue | null;
  signOutPending: boolean;
}) {
  return render({
    session,
    signOutIssue,
    signOutPending,
    onSignOut,
  });
}

function toAuthActionIssue(error: unknown): AuthActionIssue {
  const failure = error instanceof AuthPortFailure
    ? error
    : new AuthPortFailure("server");
  return {
    code: failure.code,
    message: messageForFailure(failure.code, failure.retryAfterSeconds),
    retryAfterSeconds: failure.retryAfterSeconds,
  };
}

function logoutIssue(error: unknown): AuthActionIssue {
  const issue = toAuthActionIssue(error);
  return {
    ...issue,
    message: "로그아웃 요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.",
  };
}

function messageForFailure(code: AuthFailureCode, retryAfterSeconds: number | null): string {
  if (code === "invalid-credentials") return "이메일 또는 비밀번호를 확인하세요.";
  if (code === "forbidden") return "이 계정에는 제품 접근 권한이 없습니다.";
  if (code === "rate-limited") {
    return retryAfterSeconds === null
      ? "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
      : `요청이 너무 많습니다. ${retryAfterSeconds}초 후 다시 시도하세요.`;
  }
  if (code === "network") return "인증 서버에 연결할 수 없습니다.";
  if (code === "invalid-response") return "인증 응답이 제품 계약과 일치하지 않습니다.";
  return "인증 요청을 완료하지 못했습니다.";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}
