"use client";
// Loaded only for live deployments: this is 160 KB that mock mode and first paint never need.
import { ConnectButton, SuiClientProvider, WalletProvider, createNetworkConfig, useCurrentAccount, useSignPersonalMessage, useSignTransaction } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { agentKey } from "./agentKey";

export type WalletApi = {
  address?: string;
  agent?: DeviceSigner;
  signMessage: (input: { message: Uint8Array }) => Promise<{ signature: string }>;
  signTx: (input: { transaction: string }) => Promise<{ bytes: string; signature: string }>;
};

// The wallet only signs prebuilt bytes; all chain reads and execution go through the server (Tatum).
const { networkConfig } = createNetworkConfig({
  testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" },
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" },
});

export type DeviceSigner = Awaited<ReturnType<typeof agentKey>>;

function Bridge({ onChange, show }: { onChange: (w: WalletApi) => void; show: boolean }) {
  const address = useCurrentAccount()?.address;
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const { mutateAsync: signTx } = useSignTransaction();
  const [agent, setAgent] = useState<DeviceSigner>();
  useEffect(() => { if (address) agentKey(address).then(setAgent); }, [address]);
  useEffect(() => onChange({ address, agent, signMessage, signTx }), [address, agent, signMessage, signTx, onChange]);
  return show ? <ConnectButton /> : null;
}

export default function Wallet({ network, ...props }: { onChange: (w: WalletApi) => void; show: boolean; network: string }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={network as "testnet" | "mainnet"}>
        <WalletProvider autoConnect slushWallet={{ name: "Usual" }}><Bridge {...props} /></WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
