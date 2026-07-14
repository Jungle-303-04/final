import { Activity, CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { LocaleToggle } from "../../shared/ui/LocaleToggle";
import { ThemeToggle } from "../../shared/ui/ThemeToggle";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "../../shared/ui/primitives/field";
import { Input } from "../../shared/ui/primitives/input";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { useProductTheme } from "../../shared/ui/useProductTheme";
import { useI18n } from "../../shared/i18n";
import type { AuthActionIssue, AuthCredentials } from "./authContract";

function AuthLoginScreen({
  issue,
  onSubmit,
  pending,
}: {
  issue: AuthActionIssue | null;
  onSubmit: (credentials: AuthCredentials) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [validation, setValidation] = useState({ email: false, password: false });
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const issueId = useId();
  const emailErrorId = useId();
  const passwordErrorId = useId();
  const { t } = useI18n();
  const issueMessage = issue
    ? issue.safeDetail ?? t(issue.messageKey, issue.messageParams)
    : null;

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement === document.body || activeElement === document.documentElement) {
      emailRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (issue?.code === "invalid-credentials") passwordRef.current?.focus();
  }, [issue]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const normalizedEmail = email.trim();
    const invalidEmail = normalizedEmail === "" || emailRef.current?.validity.valid === false;
    const invalidPassword = password === "";
    setValidation({ email: invalidEmail, password: invalidPassword });
    if (invalidEmail) {
      emailRef.current?.focus();
      return;
    }
    if (invalidPassword) {
      passwordRef.current?.focus();
      return;
    }

    setPassword("");
    onSubmit({ email: normalizedEmail, password });
  };

  return (
    <AuthPublicFrame>
      <main
        aria-labelledby={titleId}
        className="grid min-h-full place-items-center bg-background p-4 text-foreground sm:p-6"
        id="product-main"
        tabIndex={-1}
      >
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold tracking-tight" id={titleId}>
                {t("auth.login.title")}
              </h1>
            </CardTitle>
            <CardDescription>
              {t("auth.login.subtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form aria-busy={pending || undefined} aria-labelledby={titleId} noValidate onSubmit={handleSubmit}>
              <FieldGroup>
                {issue ? (
                  <Alert className="[overflow-wrap:anywhere]" id={issueId} variant="destructive">
                    <CircleAlert aria-hidden="true" />
                    <AlertTitle>{t("auth.login.error.title")}</AlertTitle>
                    <AlertDescription>{issueMessage}</AlertDescription>
                  </Alert>
                ) : null}
                <Field data-disabled={pending || undefined} data-invalid={validation.email || undefined}>
                  <FieldLabel htmlFor="product-auth-email">{t("auth.email.label")}</FieldLabel>
                  <Input
                    aria-describedby={validation.email ? emailErrorId : undefined}
                    aria-invalid={validation.email || undefined}
                    autoComplete="username"
                    disabled={pending}
                    id="product-auth-email"
                    inputMode="email"
                    name="email"
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (validation.email) setValidation((value) => ({ ...value, email: false }));
                    }}
                    ref={emailRef}
                    required
                    spellCheck={false}
                    type="email"
                    value={email}
                  />
                  <FieldError id={emailErrorId}>
                    {validation.email ? t("auth.email.error.invalid") : null}
                  </FieldError>
                </Field>
                <Field data-disabled={pending || undefined} data-invalid={validation.password || undefined}>
                  <FieldLabel htmlFor="product-auth-password">{t("auth.password.label")}</FieldLabel>
                  <Input
                    aria-describedby={validation.password ? passwordErrorId : issue ? issueId : undefined}
                    aria-invalid={validation.password || undefined}
                    autoComplete="current-password"
                    disabled={pending}
                    id="product-auth-password"
                    name="password"
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (validation.password) setValidation((value) => ({ ...value, password: false }));
                    }}
                    ref={passwordRef}
                    required
                    type="password"
                    value={password}
                  />
                  <FieldError id={passwordErrorId}>
                    {validation.password ? t("auth.password.error.required") : null}
                  </FieldError>
                </Field>
                <Button
                  aria-busy={pending || undefined}
                  className="h-auto min-h-9 w-full whitespace-normal"
                  disabled={pending}
                  size="lg"
                  type="submit"
                >
                  {pending ? <Spinner data-icon="inline-start" decorative /> : null}
                  {pending ? t("auth.login.pending") : t("auth.login.submit")}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </main>
    </AuthPublicFrame>
  );
}

function SessionFailureScreen({
  issue,
  onRetry,
}: {
  issue: AuthActionIssue;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  const safeDetail = issue.safeDetail ?? t(issue.messageKey, issue.messageParams);
  if (issue.code === "forbidden") {
    return (
      <AuthPublicStateFrame>
        <ProductStateScreen
          headingLevel={1}
          issue={{ code: "forbidden", safeDetail }}
          kind="forbidden"
          placement="content"
        />
      </AuthPublicStateFrame>
    );
  }
  const retry = { label: t("auth.session.retry"), onRetry, pending: false };
  if (issue.code === "network") {
    return (
      <AuthPublicStateFrame>
        <ProductStateScreen
          headingLevel={1}
          issue={{ code: "network", safeDetail }}
          kind="offline"
          placement="content"
          retry={retry}
        />
      </AuthPublicStateFrame>
    );
  }
  return (
    <AuthPublicStateFrame>
      <ProductStateScreen
        headingLevel={1}
        issue={{
          code: issue.code === "invalid-response" ? "invalid-response" : "server",
          safeDetail,
        }}
        kind="error"
        placement="content"
        retry={retry}
      />
    </AuthPublicStateFrame>
  );
}

function AuthPublicStateFrame({ children }: { children: ReactNode }) {
  return (
    <AuthPublicFrame>
      <main className="min-h-0 bg-background text-foreground" id="product-main" tabIndex={-1}>
        {children}
      </main>
    </AuthPublicFrame>
  );
}

function AuthPublicFrame({ children }: { children: ReactNode }) {
  const themeController = useProductTheme();
  const { t } = useI18n();
  return (
    <TooltipProvider>
      <div className="grid min-h-svh grid-rows-[3.5rem_minmax(0,1fr)] bg-background text-foreground">
        <header
          className="flex h-14 items-center justify-between gap-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/75"
          data-slot="auth-public-header"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-primary text-primary-foreground">
              <Activity aria-hidden="true" className="size-4" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight">
              {t("product.name")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <LocaleToggle />
            <ThemeToggle controller={themeController} />
          </div>
        </header>
        {children}
      </div>
    </TooltipProvider>
  );
}

export { AuthLoginScreen, SessionFailureScreen };
