import { Plus } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type SelectHTMLAttributes,
} from "react";

import {
  type HelmChartSourceCredential,
  type HelmChartSourceProvider,
  type HelmChartSourceRegisterRequest,
  type HelmPort,
  HelmPortFailure,
} from "../../features/helm/helmContract";
import { useHelmCopy, type HelmCopy } from "../../features/helm/helmCopy";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../shared/ui/primitives/dialog";
import { Field, FieldGroup, FieldLabel } from "../../shared/ui/primitives/field";
import { Input } from "../../shared/ui/primitives/input";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { isAbortError, toHelmFailure } from "./helmChartSourceUi";

type AuthenticationKind = "none" | HelmChartSourceCredential["kind"];

interface RegistrationForm {
  provider: HelmChartSourceProvider;
  name: string;
  reference: string;
  authentication: AuthenticationKind;
  token: string;
  username: string;
  password: string;
}

const EMPTY_REGISTRATION: RegistrationForm = {
  provider: "repository",
  name: "",
  reference: "",
  authentication: "none",
  token: "",
  username: "",
  password: "",
};

export function HelmChartSourceRegistrationDialog({
  onRegistered,
  port,
}: {
  onRegistered: () => void;
  port: HelmPort;
}) {
  const copy = useHelmCopy();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RegistrationForm>(EMPTY_REGISTRATION);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<HelmPortFailure | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const changeOpen = (nextOpen: boolean) => {
    if (pending) return;
    if (!nextOpen) {
      requestRef.current?.abort();
      setForm(EMPTY_REGISTRATION);
      setFailure(null);
    }
    setOpen(nextOpen);
  };

  const update = <TKey extends keyof RegistrationForm>(key: TKey, value: RegistrationForm[TKey]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFailure(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !registrationComplete(form)) return;
    const request = registrationRequest(form);
    setForm((current) => ({ ...current, token: "", password: "" }));
    setPending(true);
    setFailure(null);
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    try {
      await port.registerChartSource(request, controller.signal);
      onRegistered();
      setForm(EMPTY_REGISTRATION);
      setOpen(false);
    } catch (error) {
      if (!isAbortError(error)) setFailure(toHelmFailure(error));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setPending(false);
    }
  };

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus aria-hidden="true" />
        {copy.chartSourcesRegister}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl" showCloseButton={!pending}>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{copy.chartSourcesRegister}</DialogTitle>
            <DialogDescription>{copy.chartSourcesRegisterDescription}</DialogDescription>
          </DialogHeader>
          {failure ? (
            <Alert variant="destructive">
              <AlertDescription>{registrationFailureCopy(failure, copy)}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="helm-chart-source-provider">{copy.chartSourceType}</FieldLabel>
              <NativeSelect
                autoFocus
                id="helm-chart-source-provider"
                onChange={(event) => update("provider", event.target.value as HelmChartSourceProvider)}
                value={form.provider}
              >
                <option value="repository">{copy.chartSourceRepository}</option>
                <option value="oci">{copy.chartSourceOci}</option>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="helm-chart-source-name">{copy.chartSourceName}</FieldLabel>
              <Input id="helm-chart-source-name" maxLength={120} onChange={(event) => update("name", event.target.value)} required value={form.name} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="helm-chart-source-reference">{copy.chartSourceReference}</FieldLabel>
              <Input
                autoCapitalize="none"
                id="helm-chart-source-reference"
                maxLength={2048}
                onChange={(event) => update("reference", event.target.value)}
                placeholder={form.provider === "oci" ? copy.chartSourceReferenceOciHint : copy.chartSourceReferenceRepositoryHint}
                required
                spellCheck={false}
                value={form.reference}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="helm-chart-source-authentication">{copy.chartSourceAuthentication}</FieldLabel>
              <NativeSelect id="helm-chart-source-authentication" onChange={(event) => update("authentication", event.target.value as AuthenticationKind)} value={form.authentication}>
                <option value="none">{copy.chartSourceAuthenticationNone}</option>
                <option value="bearer">{copy.chartSourceAuthenticationBearer}</option>
                <option value="basic">{copy.chartSourceAuthenticationBasic}</option>
              </NativeSelect>
            </Field>
            {form.authentication === "bearer" ? <SecretField id="helm-chart-source-token" label={copy.chartSourceBearerToken} onChange={(value) => update("token", value)} value={form.token} /> : null}
            {form.authentication === "basic" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="helm-chart-source-username">{copy.chartSourceUsername}</FieldLabel>
                  <Input autoCapitalize="none" autoComplete="username" id="helm-chart-source-username" maxLength={512} onChange={(event) => update("username", event.target.value)} required spellCheck={false} value={form.username} />
                </Field>
                <SecretField id="helm-chart-source-password" label={copy.chartSourcePassword} onChange={(value) => update("password", value)} value={form.password} />
              </>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button aria-busy={pending} disabled={pending || !registrationComplete(form)} type="submit">
              {pending ? <Spinner decorative /> : <Plus aria-hidden="true" />}
              {pending ? copy.chartSourcesRegisterPending : copy.chartSourcesRegisterSave}
            </Button>
            <Button disabled={pending} onClick={() => changeOpen(false)} type="button" variant="outline">{copy.chartSourceCancel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecretField({ id, label, onChange, value }: { id: string; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input autoComplete="new-password" id={id} maxLength={16_384} onChange={(event) => onChange(event.target.value)} required spellCheck={false} type="password" value={value} />
    </Field>
  );
}

function NativeSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50" />;
}

function registrationComplete(form: RegistrationForm): boolean {
  if (form.name.trim() === "" || form.reference.trim() === "") return false;
  if (form.authentication === "bearer") return form.token.length > 0;
  if (form.authentication === "basic") return form.username.trim() !== "" && form.password.length > 0;
  return true;
}

function registrationRequest(form: RegistrationForm): HelmChartSourceRegisterRequest {
  const credential: HelmChartSourceCredential | undefined = form.authentication === "bearer"
    ? { kind: "bearer", token: form.token }
    : form.authentication === "basic"
      ? { kind: "basic", username: form.username.trim(), password: form.password }
      : undefined;
  return {
    provider: form.provider,
    name: form.name.trim(),
    reference: form.reference.trim(),
    ...(credential ? { credential } : {}),
  };
}

function registrationFailureCopy(failure: HelmPortFailure, copy: HelmCopy): string {
  if (failure.code === "forbidden" || failure.code === "unauthorized") return copy.chartSourcesRegisterForbidden;
  return copy.chartSourcesRegisterFailed;
}
