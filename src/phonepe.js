import axios from "axios";
import { b64, xVerifyForPay, xVerifyForStatus } from "./utils.js";

const SANDBOX_BASE = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PROD_BASE = "https://api.phonepe.com/apis/hermes";

export function getBaseUrl() {
  return process.env.PHONEPE_ENV === "production" ? PROD_BASE : SANDBOX_BASE;
}

export async function createPayment({
  amountInPaise,
  merchantUserId,
  merchantTransactionId,
  redirectUrl,
  callbackUrl,
  mobileNumber,
}) {
  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX;

  const payload = {
    merchantId,
    merchantTransactionId,
    merchantUserId,
    amount: amountInPaise,
    redirectUrl,
    redirectMode: "POST",
    callbackUrl,
    mobileNumber,
    paymentInstrument: {
      type: "PAY_PAGE",
    },
  };

  const base64Payload = b64(payload);
  const xVerify = xVerifyForPay(base64Payload, saltKey, saltIndex);

  const url = `${getBaseUrl()}/pg/v1/pay`;
  const headers = {
    "Content-Type": "application/json",
    "X-VERIFY": xVerify,
    "accept": "application/json",
  };

  const body = { request: base64Payload };
  const { data } = await axios.post(url, body, { headers, timeout: 20000 });
  return data;
}

export async function getPaymentStatus(merchantTransactionId) {
  const merchantId = process.env.PHONEPE_MERCHANT_ID;
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX;

  const urlPath = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
  const url = `${getBaseUrl()}${urlPath}`;
  const xVerify = xVerifyForStatus(merchantId, merchantTransactionId, saltKey, saltIndex);

  const headers = {
    "Content-Type": "application/json",
    "X-VERIFY": xVerify,
    "X-MERCHANT-ID": merchantId,
    "accept": "application/json",
  };

  const { data } = await axios.get(url, { headers, timeout: 15000 });
  return data;
}
