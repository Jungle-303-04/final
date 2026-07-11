import { FormEvent, useState } from "react";
import { ApiError } from "../../api";

export function LoginScreen({ error, onSubmit }: {
  error: ApiError | null;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try { await onSubmit(email, password); } finally { setSubmitting(false); }
  }

  return (
    <main className="auth-screen">
      <section className="auth-screen__panel">
        <span className="eyebrow">CONTROL PLANE / SESSION</span>
        <div className="brand-lockup"><span className="brand-lockup__mark">K</span><span>Operations Control Room</span></div>
        <h1>운영 상태를<br /><em>확인할 준비</em>가 되셨나요?</h1>
        <p className="auth-screen__intro">실제 관측 데이터와 권한 범위 안에서만 Fleet 상태를 표시합니다.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>이메일<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label>비밀번호<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
          {error ? <p className="form-error" role="alert">{error.message}</p> : null}
          <button className="button button--primary button--wide" type="submit" disabled={submitting}>{submitting ? "확인 중…" : "세션 시작"}</button>
        </form>
      </section>
    </main>
  );
}
