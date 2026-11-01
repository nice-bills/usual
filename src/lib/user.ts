// Who this request belongs to. Set from the session cookie, so every chain and memory call follows
// the signed-in wallet and the agent key on that wallet's device.
import { AsyncLocalStorage } from "node:async_hooks";

export type User = { address: string; agent: string };
const who = new AsyncLocalStorage<User>();
export const asUser = <T>(user: User, fn: () => T) => who.run(user, fn);
export const currentUser = () => who.getStore()?.address;
/** Set only when the agent key lives on the user's device. The server then builds; the device signs. */
export const deviceAgent = () => who.getStore()?.agent;
