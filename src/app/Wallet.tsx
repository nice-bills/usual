"use client";
// Loaded only for live deployments: this is 160 KB that mock mode and first paint never need.
import { ConnectButton, SuiClientProvider, WalletProvider, createNetworkConfig, useCurrentAccount, useSignPersonalMessage, useSignTransaction } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export type WalletApi = {
  address?: string;
  signMessage: (input: { message: Uint8Array }) => Promise<{ signature: string }>;
  signTx: (input: { transaction: string }) => Promise<{ bytes: string; signature: string }>;
};

// The wallet only signs prebuilt bytes; all chain reads and execution go through the server (Tatum).
const { networkConfig } = createNetworkConfig({
  testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" },
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" },
});

function Bridge({ onChange, show }: { onChange: (w: WalletApi) => void; show: boolean }) {
  const address = useCurrentAccount()?.address;
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const { mutateAsync: signTx } = useSignTransaction();
  useEffect(() => onChange({ address, signMessage, signTx }), [address, signMessage, signTx, onChange]);
  return show ? <ConnectButton /> : null;
}

export default function Wallet(props: { onChange: (w: WalletApi) => void; show: boolean }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect><Bridge {...props} /></WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
