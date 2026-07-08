import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { deriveTelegramWebhookSecret, dispatchToLead, sendPlainMessage } from "@/lib/telegram.server";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
};

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
        if (!TELEGRAM_API_KEY) {
          return new Response("TELEGRAM_API_KEY not configured", { status: 500 });
        }
        const expected = deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: TelegramUpdate;
        try {
          update = (await request.json()) as TelegramUpdate;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const message = update.message;
        if (!message?.chat?.id || !message.from?.id) {
          return Response.json({ ok: true, ignored: true });
        }

        const text = (message.text ?? "").trim();
        const chatId = message.chat.id;
        const username = message.from.username ?? null;

        // /start <sessionId>
        const startMatch = text.match(/^\/start(?:\s+([a-f0-9-]{36}))?/i);
        if (startMatch) {
          const sessionId = startMatch[1];
          if (!sessionId) {
            await sendPlainMessage(
              chatId,
              "Olá! Abra o link pela tela de pagamento para eu conseguir te identificar.",
            );
            return Response.json({ ok: true });
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: session } = await supabaseAdmin
            .from("call_sessions")
            .select("id")
            .eq("id", sessionId)
            .maybeSingle();

          if (!session) {
            await sendPlainMessage(chatId, "Não encontrei sua chamada. Abra o link de novo pela tela de pagamento.");
            return Response.json({ ok: true });
          }

          await supabaseAdmin
            .from("call_sessions")
            .update({
              telegram_chat_id: chatId,
              telegram_username: username,
            })
            .eq("id", sessionId);

          await sendPlainMessage(chatId, "✅ Pronto! Em instantes você recebe seus dados aqui.");

          // Fire-and-await dispatch so we surface errors in logs
          try {
            await dispatchToLead(sessionId);
          } catch (err) {
            console.error("auto-dispatch failed", err);
            await sendPlainMessage(chatId, "Tive um problema pra montar sua mensagem. Vou te chamar em instantes.");
          }
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
