"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";

interface PriceUpdate {
  ticker: string;
  price: number;
  time: string;
}

/**
 * Subscribe to real-time price updates via Socket.IO.
 * Returns a Map<ticker, PriceUpdate> that updates automatically.
 */
export function usePriceStream(tickers: string[]) {
  const { data: session } = useSession();
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());
  const tickersRef = useRef<string[]>([]);

  useEffect(() => {
    if (!session?.user?.id || tickers.length === 0) return;

    const socket = getSocket(session.user.id);
    const validTickers = tickers.filter(t => t && t.length > 0);

    // Subscribe
    socket.emit("subscribe_prices", validTickers);
    tickersRef.current = validTickers;

    const handleUpdate = (data: PriceUpdate) => {
      setPrices(prev => {
        const next = new Map(prev);
        next.set(data.ticker, data);
        return next;
      });
    };

    socket.on("price_update", handleUpdate);

    return () => {
      socket.off("price_update", handleUpdate);
      socket.emit("unsubscribe_prices", tickersRef.current);
    };
  }, [session?.user?.id, tickers.join(",")]);

  return prices;
}
