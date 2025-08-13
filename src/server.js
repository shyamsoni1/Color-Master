import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { nanoid } from "nanoid";
import { requiredEnv } from "./src/utils.js";
import { createPayment, getPaymentStatus } from "./src/phonepe.js";

dotenv.config();

requiredEnv(
  "PORT",
  "BASE_URL",
  "FRONTEND_ORIGIN",
  "PHONEPE_ENV",
  "PHONEPE_MERCHANT_ID",
  "PHONEPE_SALT_KEY",
  "PHONEPE_SALT_INDEX",
  "PHONEPE_CALLBACK_PATH"
);

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN, methods: ["GET", "POST"], credentials: true }));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 60 });
app.use("/api/", limiter);

const payments = new Map();

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.post("/api/phonepe/pay", async (req, res) => {
  try {
    const { amount, userId, mobile } = req.body || {};
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const merchantTransactionId = `CM_${Date.now()}_${nanoid(6)}`;
    const amountInPaise = Math.round(Number(amount) * 100);

    const redirectUrl = `${process.env.BASE_URL}/api/phonepe/redirect?txn=${merchantTransactionId}`;
    const callbackUrl = `${process.env.BASE_URL}${process.env.PHONEPE_CALLBACK_PATH}`;

    payments.set(merchantTransactionId, {
      userId,
      amount: amountInPaise,
      status: "CREATED",
      createdAt: new Date().toISOString(),
    });

    const data = await createPayment({
      amountInPaise,
      merchantUserId: String(userId),
      merchantTransactionId,
      redirectUrl,
      callbackUrl,
      mobileNumber: mobile || "9999999999",
    });

    if (data?.success && data?.data?.instrumentResponse?.redirectInfo?.url) {
      return res.json({
        ok: true,
        merchantTransactionId,
        redirectUrl: data.data.instrumentResponse.redirectInfo.url,
      });
    }

    return res.status(502).json({ ok: false, data });
  } catch (err) {
    return res.status(500).json({ error: "Payment init failed", detail: err.message });
  }
});

app.post(process.env.PHONEPE_CALLBACK_PATH, async (req, res) => {
  try {
    const payload = req.body || {};
    const merchantTransactionId = payload?.data?.merchantTransactionId;
    if (!merchantTransactionId) return res.status(400).send("Bad Request");

    const status = await getPaymentStatus(merchantTransactionId);

    const rec = payments.get(merchantTransactionId) || {};
    rec.status = status?.code || status?.data?.state || "UNKNOWN";
    rec.updatedAt = new Date().toISOString();
    payments.set(merchantTransactionId, rec);

    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

app.get("/api/phonepe/redirect", async (req, res) => {
  try {
    const merchantTransactionId = req.query.txn;
    if (!merchantTransactionId) return res.status(400).send("Missing txn");

    const status = await getPaymentStatus(merchantTransactionId);
    const success = status?.code === "PAYMENT_SUCCESS" || status?.data?.state === "COMPLETED";

    if (success) {
      return res.status(200).send(`Payment successful for ${merchantTransactionId}.`);
    }

    return res.status(200).send(`Payment pending/failed (${status?.code || status?.data?.state}).`);
  } catch {
    return res.status(500).send("Something went wrong");
  }
});

app.get("/api/phonepe/status/:txnId", async (req, res) => {
  try {
    const { txnId } = req.params;
    const status = await getPaymentStatus(txnId);
    return res.json({ ok: true, status });
  } catch (err) {
    return res.status(500).json({ ok: false, detail: err.message });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => console.log(`PhonePe backend listening on :${port}`));
