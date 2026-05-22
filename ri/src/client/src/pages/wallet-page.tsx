import { useQuery } from "@tanstack/react-query";
import { scootApi, type Transaction } from "../api/scoot.js";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Badge } from "../components/ui/badge.js";
import { Separator } from "../components/ui/separator.js";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";

function TxRow({ tx }: { tx: Transaction }) {
  const isReceive = tx.type === "receive";
  return (
    <div className="flex items-center gap-3 py-3">
      <div className={`rounded-full p-2 ${isReceive ? "bg-green-500/10" : "bg-red-500/10"}`}>
        {isReceive ? (
          <ArrowDownLeft className="h-4 w-4 text-green-400" />
        ) : (
          <ArrowUpRight className="h-4 w-4 text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {isReceive ? `From ${tx.from}` : `To ${tx.to}`}
        </p>
        <p className="text-xs text-white/50">
          {new Date(tx.createdAt).toLocaleDateString()}
        </p>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${isReceive ? "text-green-400" : "text-red-400"}`}>
        {isReceive ? "+" : "-"}{tx.amount} SCT
      </span>
    </div>
  );
}

export default function WalletPage() {
  const { data: balance } = useQuery({ queryKey: ["scoot", "balance"], queryFn: scootApi.getBalance });
  const { data: transactions = [] } = useQuery({ queryKey: ["scoot", "transactions"], queryFn: scootApi.getTransactions });

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/60 flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Scoot Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold tabular-nums">{balance?.balance ?? "—"} <span className="text-xl text-white/50">SCT</span></p>
          <p className="text-xs text-white/40 mt-2 font-mono truncate">{balance?.address ?? "…"}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-white/60">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {transactions.length === 0 ? (
            <p className="text-sm text-white/40 py-4 text-center">No transactions yet</p>
          ) : (
            transactions.map((tx, i) => (
              <div key={tx.id}>
                <TxRow tx={tx} />
                {i < transactions.length - 1 && <Separator />}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <Badge variant="outline" className="text-white/40 border-white/20 text-xs">
          Blockchain integration — Phase 2
        </Badge>
      </div>
    </div>
  );
}
