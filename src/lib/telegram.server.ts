// Server-only helper for Telegram dispatches. Never import in client code.
import { createHash } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not configured`);
  return v;
}

export function deriveTelegramWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256")
    .update(`telegram-webhook:${telegramApiKey}`)
    .digest("base64url");
}

async function tgCall<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const LOVABLE_API_KEY = requireEnv("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = requireEnv("TELEGRAM_API_KEY");
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": TELEGRAM_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Telegram ${method} failed [${res.status}]: ${text}`);
    throw new Error(`Telegram ${method} failed: ${text}`);
  }
  const json = JSON.parse(text) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    console.error(`Telegram ${method} !ok: ${json.description}`);
    throw new Error(json.description ?? `Telegram ${method} failed`);
  }
  return json.result as T;
}

type SessionRow = {
  id: string;
  recording_path: string | null;
  geo_city: string | null;
  geo_region: string | null;
  geo_country: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  telegram_chat_id: number | null;
};

type SettingsRow = {
  telegram_copy_template: string;
  telegram_purchase_url: string | null;
  model_name: string;
};

export async function dispatchToLead(sessionId: string): Promise<{ ok: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: session, error: sErr } = await supabaseAdmin
    .from("call_sessions")
    .select(
      "id, recording_path, geo_city, geo_region, geo_country, geo_lat, geo_lng, telegram_chat_id",
    )
    .eq("id", sessionId)
    .single<SessionRow>();
  if (sErr || !session) return { ok: false, reason: "sessão não encontrada" };
  if (!session.telegram_chat_id) return { ok: false, reason: "lead ainda não iniciou o bot" };

  const { data: settings, error: setErr } = await supabaseAdmin
    .from("settings")
    .select("telegram_copy_template, telegram_purchase_url, model_name")
    .eq("id", 1)
    .single<SettingsRow>();
  if (setErr || !settings) return { ok: false, reason: "configurações não encontradas" };

  let videoLink = "(sem gravação)";
  if (session.recording_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from("media")
      .createSignedUrl(session.recording_path, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) videoLink = signed.signedUrl;
  }

  const purchaseUrl = settings.telegram_purchase_url?.trim() || "";

  const text = (settings.telegram_copy_template ?? "")
    .replaceAll("{cidade}", session.geo_city ?? "sua cidade")
    .replaceAll("{estado}", session.geo_region ?? "")
    .replaceAll("{pais}", session.geo_country ?? "")
    .replaceAll("{modelo}", settings.model_name ?? "")
    .replaceAll("{video_link}", videoLink)
    .replaceAll("{compra_link}", purchaseUrl);

  // 1. Send location if available
  if (session.geo_lat != null && session.geo_lng != null) {
    try {
      await tgCall("sendLocation", {
        chat_id: session.telegram_chat_id,
        latitude: session.geo_lat,
        longitude: session.geo_lng,
      });
    } catch (err) {
      console.warn("sendLocation failed", err);
    }
  }

  // 2. Send main message with purchase button
  const replyMarkup = purchaseUrl
    ? {
        inline_keyboard: [[{ text: "💳 Continuar minha compra", url: purchaseUrl }]],
      }
    : undefined;

  await tgCall("sendMessage", {
    chat_id: session.telegram_chat_id,
    text,
    disable_web_page_preview: false,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

  await supabaseAdmin
    .from("call_sessions")
    .update({ telegram_sent_at: new Date().toISOString() })
    .eq("id", sessionId);

  return { ok: true };
}

export async function sendPlainMessage(chatId: number, text: string): Promise<void> {
  await tgCall("sendMessage", { chat_id: chatId, text });
}
