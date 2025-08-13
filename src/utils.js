import crypto from "crypto";

export function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function b64(json) {
  return Buffer.from(JSON.stringify(json)).toString("base64");
}

export function xVerifyForPay(base64Payload, saltKey, saltIndex) {
  const hash = sha256(base64Payload + "/pg/v1/pay" + saltKey);
  return `${hash}###${saltIndex}`;
}

export function xVerifyForStatus(merchantId, merchantTxnId, saltKey, saltIndex) {
  const path = `/pg/v1/status/${merchantId}/${merchantTxnId}`;
  const hash = sha256(path + saltKey);
  return `${hash}###${saltIndex}`;
}

export function requiredEnv(...keys) {
  for (const k of keys) {
    if (!process.env[k]) {
      throw new Error(`Missing env: ${k}`);
    }
  }
}
