import { NextResponse } from "next/server";

import {
  getRazorpayPayment,
  verifyRazorpayPaymentSignature,
} from "@/lib/razorpay";
import {
  handleRazorpayS2SCallback,
  markRazorpayCallbackVerified,
} from "@/lib/settlement-charge";

type RazorpayCallbackBody = {
  razorpay_payment_id?: unknown;
  razorpay_order_id?: unknown;
  razorpay_signature?: unknown;
  error?: { description?: unknown; reason?: unknown };
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const body = (await request.json().catch(() => null)) as RazorpayCallbackBody | null;
  const paymentId = readString(body?.razorpay_payment_id);
  const orderId = readString(body?.razorpay_order_id);
  if (!paymentId || !orderId) return NextResponse.json({ error: "Razorpay callback is missing payment identifiers." }, { status: 400 });

  const signature = readString(body?.razorpay_signature);
  try {
    if (signature) {
      if (!verifyRazorpayPaymentSignature(orderId, paymentId, signature)) {
        return NextResponse.json({ error: "Invalid Razorpay payment signature." }, { status: 401 });
      }
    } else {
      const payment = await getRazorpayPayment(paymentId);
      if (payment.order_id !== orderId || payment.status !== "failed") {
        return NextResponse.json({ error: "Razorpay failure callback could not be verified." }, { status: 401 });
      }
    }

    const result = await handleRazorpayS2SCallback({ sessionId, paymentId, orderId });
    await markRazorpayCallbackVerified(sessionId);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Razorpay callback processing failed." }, { status: 503 });
  }
}
