import { getSession, login, logout } from "../api";
import { createAuthAdapter } from "../features/auth/createAuthAdapter";
import { createProductComposition } from "./productComposition";

export function createApiComposition() {
  return createProductComposition([], createAuthAdapter({
    getSession,
    login,
    logout,
  }));
}
