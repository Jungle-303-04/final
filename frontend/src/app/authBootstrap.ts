import { getSession, login, logout } from "../api";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";

/** The only composition imported before the authentication barrier resolves. */
export function createAuthBootstrap() {
  return createAuthAdapter({ getSession, login, logout });
}
