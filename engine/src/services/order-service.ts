import crypto from "crypto";
import { BALANCES, ORDERBOOKS, ORDERS, FILLS} from "../store/exchange-store";
import type { OrderRecord } from "../store/exchange-store";

export function createOrder(payload: any) {
  const { userId, type, side, symbol, price, qty } = payload;
  if (!BALANCES.has(userId)) {
    BALANCES.set(userId, {
      BTC: { available: 100, locked: 0 },
      USD: { available: 10000, locked: 0 },
    });
  }
  const userBalance = BALANCES.get(userId)!;
  //check balance
  if (side === "buy") {
    const cost = qty * price;
    if (userBalance.USD!.available < cost) {
      throw new Error("Can't buy due to Insufficient USD balance");
    }
    userBalance.USD!.available -= cost;
    userBalance.USD!.locked += cost;
  } else {
    if (userBalance.BTC!.available < qty) {
      throw new Error("Can't create sell Order due to Insufficient BTC balance");
    }
    userBalance.BTC!.available -= qty;
    userBalance.BTC!.locked += qty;
  }
  //create order
  const orderId = crypto.randomUUID();
  const fills: any[] = [];
  let filledQty = 0;
  let totalFillCost = 0;
  const orderRecord: OrderRecord = {
    orderId,
    userId,
    type,
    side,
    symbol,
    price,
    qty,
    filledQty: 0,
    status: "open",
    fills: [],  // Empty for now
    createdAt: Date.now(),
  }

  //initalize order if it doesnt exisrs
  if (!ORDERBOOKS.has(symbol)) {
    ORDERBOOKS.set(symbol, { bids: new Map(), asks: new Map() });
  }
  const orderbook = ORDERBOOKS.get(symbol)!;
  //TRY to match
  if (side === "buy") {
    const asks = Array.from(orderbook.asks.entries()).sort((a, b) => a[0] - b[0]);
    for (const [askPrice, askOrders] of asks) {
      if (filledQty >= qty) break;
      if (price < askPrice) break;
      while (askOrders.length > 0 && filledQty < qty) {
        const askOrder = askOrders[0];
        const canFill = Math.min(qty - filledQty, askOrder!.qty - askOrder!.filledQty);

        askOrder!.filledQty += canFill; //existing sell order being matched
        filledQty += canFill; // incoming buy order fill progress
        totalFillCost += canFill * askPrice;
        const fill = {
          fillId: crypto.randomUUID(),
          symbol,
          price: askPrice,
          qty: canFill,
          buyOrderId: orderId,
          sellOrderId: askOrder!.orderId,
          createdAt: Date.now(),
        };
        fills.push(fill);
        orderRecord.fills.push(fill)
        //update seller balance
        const sellerbalance = BALANCES.get(askOrder!.userId)!;
        sellerbalance.USD!.available += canFill * askPrice;
        sellerbalance.BTC!.locked -= canFill;
        const buyerBalance = userBalance;
        buyerBalance.USD!.locked -= canFill * askPrice;
        buyerBalance.BTC!.available += canFill;
        if (askOrder!.filledQty === askOrder!.qty) {
          askOrder!.status = "filled";
          askOrders.shift();
        } else {
          askOrder!.status = "partially_filled";
        }
        ORDERS.set(orderId, orderRecord);
      }
    }
  }
  else {
    //sell order
    const bids = Array.from(orderbook.bids.entries()).sort((a, b) => b[0] - a[0]);
    for (const [bidPrice, bidOrders] of bids) {
      if (filledQty >= qty) break;
      if (price < bidPrice) break;
      while (bidOrders.length > 0 && filledQty <= qty) {
        const bidOrder = bidOrders[0];
        const canFill = Math.min(qty - filledQty, bidOrder!.qty - bidOrder!.filledQty);
        bidOrder!!.filledQty += canFill;
        filledQty += canFill;
        totalFillCost += canFill * bidPrice;
        const fill = {
          fillId: crypto.randomUUID(),
          symbol,
          price: bidPrice,
          qty: canFill,
          createdAt: Date.now(),
        };
        fills.push(fill);
        const buyerBalance = BALANCES.get(bidOrder!.userId)!;
        buyerBalance.USD!.locked -= canFill * bidPrice;
        buyerBalance.BTC!.available += canFill;
        const sellerbalance = userBalance;
        sellerbalance.USD!.available += canFill * bidPrice;
        sellerbalance.BTC!.locked -= canFill
        if (bidOrder!.filledQty == bidOrder!.qty) {
          bidOrder!.status = "filled";
          bidOrders.shift();
        } else {
          bidOrder!.status = "partially_filled";
        }
        ORDERS.set(orderId, orderRecord);
      }
    }
  }
}