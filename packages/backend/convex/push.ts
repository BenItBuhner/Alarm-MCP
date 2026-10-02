"use node";

import { createSign } from "node:crypto";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "project_id" in parsed &&
      "client_email" in parsed &&
      "private_key" in parsed &&
      typeof parsed.project_id === "string" &&
      typeof parsed.client_email === "string" &&
      typeof parsed.private_key === "string"
    ) {
      return {
        project_id: parsed.project_id,
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      };
    }
  } catch {
    // fall through
  }
  console.error("FCM_SERVICE_ACCOUNT_JSON is set but is not a valid service account JSON");
  return null;
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64Url(signer.sign(account.private_key));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth token request failed: ${response.status}`);
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("Google OAuth response had no access_token");
  return body.access_token;
}

/**
 * Sends a high-priority FCM data message so Android devices wake from doze and ring
 * even when the live Convex subscription is suspended. No-op without FCM credentials.
 */
export const sendAlarm = internalAction({
  args: { alarmId: v.id("alarms"), deviceIds: v.array(v.id("devices")) },
  returns: v.null(),
  handler: async (ctx, { alarmId, deviceIds }) => {
    const account = parseServiceAccount(process.env.FCM_SERVICE_ACCOUNT_JSON);
    if (!account) return null;
    const data = await ctx.runQuery(internal.pushData.getPushTargets, { alarmId, deviceIds });
    if (!data || data.targets.length === 0) return null;

    const accessToken = await getAccessToken(account);
    const delivered = [];
    const invalidTokens = [];
    for (const target of data.targets) {
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: target.pushToken,
              android: { priority: "HIGH", ttl: `${data.alarm.maxRingSeconds}s` },
              data: {
                type: "alarm",
                alarmId: data.alarm.alarmId,
                title: data.alarm.title,
                message: data.alarm.message ?? "",
                intensity: data.alarm.intensity,
                alarm: JSON.stringify(data.alarm),
              },
            },
          }),
        },
      );
      if (response.ok) {
        delivered.push(target.deviceId);
      } else if (response.status === 404 || response.status === 400) {
        invalidTokens.push(target.deviceId);
        console.warn(`FCM rejected token for device ${target.deviceId}: ${response.status}`);
      } else {
        console.error(`FCM send failed for device ${target.deviceId}: ${response.status}`);
      }
    }
    await ctx.runMutation(internal.pushData.recordPushResults, {
      alarmId,
      delivered,
      invalidTokens,
    });
    return null;
  },
});
