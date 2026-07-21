import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import {
  type AuthActionIssue,
  type AuthCredentials,
  type AuthPort,
  type AuthenticatedAuthState,
  type ProductSession,
} from "./authContract";
import {
  isAbortError,
  logoutIssue,
  requiresSessionReconciliation,
  toAuthActionIssue,
} from "./authIssues";
import { AuthLoginScreen, SessionFailureScreen } from "./AuthBarrierScreens";
import { acquireSessionRequest } from "./authSessionRequest";
import { AuthenticatedSessionRender } from "./AuthSessionGate";

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

export function AuthBarrier({ children, port }: AuthBarrierProps) {
  const [state, setState] = useState<AuthBarrierState>({ kind: "checking" });
  const [sessionRevision, setSessionRevision] = useState(0);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const mutationPendingRef = useRef(false);
  const sessionCheckPendingRef = useRef(true);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      mutationControllerRef.current?.abort();
      mutationControllerRef.current = null;
      mutationPendingRef.current = false;
      sessionCheckPendingRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    sessionCheckPendingRef.current = true;
    const request = acquireSessionRequest(port);

    void request.promise.then(
      (result) => {
        if (!active) return;
        sessionCheckPendingRef.current = false;
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
        sessionCheckPendingRef.current = false;
        setState({ kind: "error", issue: toAuthActionIssue(error) });
      },
    );

    return () => {
      active = false;
      request.release();
    };
  }, [port, sessionRevision]);

  const requestSessionCheck = useCallback(() => {
    if (sessionCheckPendingRef.current || mutationPendingRef.current) return;
    sessionCheckPendingRef.current = true;
    setState({ kind: "checking" });
    setSessionRevision((revision) => revision + 1);
  }, []);

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
      const issue = toAuthActionIssue(error);
      if (!requiresSessionReconciliation(issue.code)) {
        setState({ kind: "unauthenticated", issue, signInPending: false });
      } else {
        try {
          const result = await port.loadSession(controller.signal);
          if (!mountedRef.current) return;
          if (result.status === "authenticated") {
            setState({
              kind: "authenticated",
              session: result.session,
              signOutIssue: null,
              signOutPending: false,
            });
          } else {
            setState({ kind: "unauthenticated", issue, signInPending: false });
          }
        } catch (sessionError) {
          if (!mountedRef.current || isAbortError(sessionError)) return;
          setState({ kind: "error", issue: toAuthActionIssue(sessionError) });
        }
      }
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
      const issue = logoutIssue(error);
      if (!requiresSessionReconciliation(issue.code)) {
        setState({
          kind: "authenticated",
          session,
          signOutIssue: issue,
          signOutPending: false,
        });
      } else {
        try {
          const result = await port.loadSession(controller.signal);
          if (!mountedRef.current) return;
          if (result.status === "unauthenticated") {
            setState({ kind: "unauthenticated", issue: null, signInPending: false });
          } else {
            setState({
              kind: "authenticated",
              session: result.session,
              signOutIssue: issue,
              signOutPending: false,
            });
          }
        } catch (sessionError) {
          if (!mountedRef.current || isAbortError(sessionError)) return;
          setState({ kind: "error", issue: toAuthActionIssue(sessionError) });
        }
      }
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
    return <SessionFailureScreen issue={state.issue} onRetry={requestSessionCheck} />;
  }

  return (
    <AuthenticatedSessionRender
      onSignOut={signOutHandler}
      reportUnauthorized={requestSessionCheck}
      render={children}
      session={state.session}
      signOutIssue={state.signOutIssue}
      signOutPending={state.signOutPending}
    />
  );
}
