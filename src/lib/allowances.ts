// Learned limits become native Sui allowances (0x2::allowance). The agent key is the spender:
// the chain itself refuses anything above the limit. There is no update call, so a new limit
// is revoke + reissue in one owner-signed transaction.
import { Transaction } from "@mysten/sui/transactions";
import type { TransactionEffects } from "./chainTypes";
import { env } from "./env";

const DAY_MS = 86_400_000n;

export function addAllowance(tx: Transaction, opts: { name: string; spender: string; amount: bigint; periodDays?: number; lifetime?: { expiresAt: number } }) {
  const balanceType = `0x2::balance::Balance<${env.usdc}>`;
  const rateLimit = opts.periodDays
    ? tx.moveCall({
        target: "0x1::option::some",
        typeArguments: ["0x2::allowance::RateLimit"],
        arguments: [tx.moveCall({ target: "0x2::allowance::periodic_rate_limit", arguments: [tx.pure.u64(BigInt(opts.periodDays) * DAY_MS), tx.pure.u256(opts.amount)] })],
      })
    : tx.moveCall({ target: "0x1::option::none", typeArguments: ["0x2::allowance::RateLimit"] });
  tx.moveCall({
    target: "0x2::allowance::new",
    typeArguments: [balanceType],
    arguments: [
      tx.pure.string(opts.name.slice(0, 128)),
      tx.pure.address(opts.spender),
      tx.pure.option("u256", opts.lifetime ? opts.amount : null),
      tx.pure.option("u64", null),
      tx.pure.option("u64", opts.lifetime ? BigInt(opts.lifetime.expiresAt) : null),
      rateLimit,
    ],
  });
}

export function revokeAllowance(tx: Transaction, capId: string, allowanceId: string) {
  tx.moveCall({ target: "0x2::allowance::revoke", typeArguments: [`0x2::balance::Balance<${env.usdc}>`], arguments: [tx.object(capId), tx.object(allowanceId)] });
}

/** Move USDC coins into the owner's address balance, which is what allowances draw from. */
export function depositToAddressBalance(tx: Transaction, owner: string, coinIds: string[]) {
  if (!coinIds.length) return;
  const [first, ...rest] = coinIds.map((id) => tx.object(id));
  if (rest.length) tx.mergeCoins(first, rest);
  tx.moveCall({ target: "0x2::coin::send_funds", typeArguments: [env.usdc], arguments: [first, tx.pure.address(owner)] });
}

/** Created allowances are shared; their caps go to the funder. Create one per transaction so they pair up. */
export function createdAllowances(effects: TransactionEffects | null | undefined) {
  const created = (effects?.changedObjects ?? []).filter((c) => c.idOperation === "Created");
  return {
    allowances: created.filter((c) => c.outputOwner?.$kind === "Shared").map((c) => c.objectId),
    caps: created.filter((c) => c.outputOwner?.$kind === "AddressOwner").map((c) => c.objectId),
  };
}
