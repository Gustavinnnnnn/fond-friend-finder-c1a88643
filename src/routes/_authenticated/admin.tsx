import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { claimAdmin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, LogOut, Copy, ExternalLink } from "lucide-react";

type Settings = {
  model_name: string;
  model_photo_url: string | null;
  video_url: string | null;
  free_duration_seconds: number;
  price_cents: number;
  offer_title: string;
  offer_subtitle: string;
  contact_url: string | null;
};

type Session = {
  id: string;
  status: string;
  created_at: string;
  free_ended_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
};

type Payment = {
  id: string;
  session_id: string | null;
  amount_cents: number;
  status: string;
  created_at: string;
};

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Painel admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

function AdminPage() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"video" | "photo" | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const claimFn = useServerFn(claimAdmin);

  // Check admin status; auto-claim first admin if applicable
  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) return;
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userRes.user.id)
        .eq("role", "admin");
      if (roleRows && roleRows.length > 0) {
        setIsAdmin(true);
        return;
      }
      // Try to claim
      try {
        const { becameAdmin } = await claimFn({});
        if (becameAdmin) {
          toast.success("Você virou o admin principal.");
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } catch (err) {
        console.error(err);
        setIsAdmin(false);
      }
    })();
  }, [claimFn]);

  // Load data
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setSettings(data as Settings);
      });
    supabase
      .from("call_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setSessions((data as Session[]) ?? []));
    supabase
      .from("payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setPayments((data as Payment[]) ?? []));
  }, [isAdmin]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("settings")
      .update({
        model_name: settings.model_name,
        model_photo_url: settings.model_photo_url,
        video_url: settings.video_url,
        free_duration_seconds: settings.free_duration_seconds,
        price_cents: settings.price_cents,
        offer_title: settings.offer_title,
        offer_subtitle: settings.offer_subtitle,
        contact_url: settings.contact_url,
      })
      .eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Configurações salvas");
  };

  const handleUpload = async (file: File, kind: "video" | "photo") => {
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop() || (kind === "video" ? "mp4" : "jpg");
      const path = `${kind}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("media")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const url = data.publicUrl;
      if (kind === "video") {
        setSettings((prev) => (prev ? { ...prev, video_url: url } : prev));
      } else {
        setSettings((prev) => (prev ? { ...prev, model_photo_url: url } : prev));
      }
      toast.success(`${kind === "video" ? "Vídeo" : "Foto"} enviado. Clique em Salvar.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro no upload";
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const callLink =
    typeof window !== "undefined" ? `${window.location.origin}/call` : "/call";

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-emerald-500" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 p-6 text-center text-white">
        <div className="text-lg font-semibold">Sem permissão</div>
        <div className="max-w-sm text-sm text-white/60">
          Sua conta não é admin. Se você é o dono do sistema e ninguém ainda
          reivindicou admin, pode ter outro admin já cadastrado.
        </div>
        <Button variant="outline" onClick={handleSignOut}>
          Sair
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 pb-20 text-white">
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Painel da chamada</h1>
          <Button variant="ghost" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>

        {/* Link para o lead */}
        <Card className="mb-6 border-neutral-800 bg-neutral-900 p-4 text-white">
          <div className="text-xs uppercase tracking-widest text-white/50">
            Link da chamada
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-black/40 px-3 py-2 text-sm">
              {callLink}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(callLink);
                toast.success("Link copiado");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <a href={callLink} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </Card>

        {settings ? (
          <>
            {/* Modelo */}
            <Card className="mb-6 border-neutral-800 bg-neutral-900 p-5 text-white">
              <h2 className="mb-4 text-lg font-semibold">Modelo</h2>
              <div className="grid gap-4 sm:grid-cols-[auto,1fr]">
                <div>
                  <div className="mb-2 text-xs text-white/60">Foto</div>
                  <div className="relative h-24 w-24 overflow-hidden rounded-full bg-neutral-800">
                    {settings.model_photo_url ? (
                      <img
                        src={settings.model_photo_url}
                        alt="Foto"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-xs">
                    <Upload className="h-3.5 w-3.5" />
                    {uploading === "photo" ? "Enviando…" : "Trocar"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(f, "photo");
                      }}
                    />
                  </label>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label className="text-white/80">Nome exibido</Label>
                    <Input
                      value={settings.model_name}
                      onChange={(e) =>
                        setSettings({ ...settings, model_name: e.target.value })
                      }
                      className="mt-1 border-neutral-700 bg-neutral-800 text-white"
                    />
                  </div>
                  <div>
                    <Label className="text-white/80">Link de contato (opcional)</Label>
                    <Input
                      placeholder="https://t.me/... ou https://wa.me/..."
                      value={settings.contact_url ?? ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          contact_url: e.target.value || null,
                        })
                      }
                      className="mt-1 border-neutral-700 bg-neutral-800 text-white"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Vídeo */}
            <Card className="mb-6 border-neutral-800 bg-neutral-900 p-5 text-white">
              <h2 className="mb-4 text-lg font-semibold">Vídeo da modelo</h2>
              {settings.video_url ? (
                <video
                  src={settings.video_url}
                  controls
                  className="mb-3 aspect-video w-full rounded-lg bg-black"
                />
              ) : (
                <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-white/20 bg-black/40 text-sm text-white/50">
                  Nenhum vídeo enviado ainda
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-white">
                <Upload className="h-4 w-4" />
                {uploading === "video" ? "Enviando…" : "Enviar vídeo (MP4)"}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f, "video");
                  }}
                />
              </label>
            </Card>

            {/* Chamada */}
            <Card className="mb-6 border-neutral-800 bg-neutral-900 p-5 text-white">
              <h2 className="mb-4 text-lg font-semibold">Configurações da chamada</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-white/80">Duração grátis (segundos)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.free_duration_seconds}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        free_duration_seconds: parseInt(e.target.value || "0", 10),
                      })
                    }
                    className="mt-1 border-neutral-700 bg-neutral-800 text-white"
                  />
                </div>
                <div>
                  <Label className="text-white/80">Valor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    value={(settings.price_cents / 100).toFixed(2)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        price_cents: Math.round(
                          parseFloat(e.target.value || "0") * 100,
                        ),
                      })
                    }
                    className="mt-1 border-neutral-700 bg-neutral-800 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-white/80">Título da oferta</Label>
                  <Input
                    value={settings.offer_title}
                    onChange={(e) =>
                      setSettings({ ...settings, offer_title: e.target.value })
                    }
                    className="mt-1 border-neutral-700 bg-neutral-800 text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-white/80">Subtítulo da oferta</Label>
                  <Textarea
                    value={settings.offer_subtitle}
                    onChange={(e) =>
                      setSettings({ ...settings, offer_subtitle: e.target.value })
                    }
                    className="mt-1 border-neutral-700 bg-neutral-800 text-white"
                  />
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="mt-4 bg-emerald-500 hover:bg-emerald-600"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </Card>

            {/* Histórico */}
            <Card className="mb-6 border-neutral-800 bg-neutral-900 p-5 text-white">
              <h2 className="mb-4 text-lg font-semibold">Últimas chamadas</h2>
              {sessions.length === 0 ? (
                <div className="text-sm text-white/50">Nenhuma chamada ainda.</div>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => {
                    const payment = payments.find((p) => p.session_id === s.id);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-lg bg-black/30 px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="text-white/80">
                            {new Date(s.created_at).toLocaleString("pt-BR")}
                          </div>
                          <div className="mt-0.5 text-white/40">
                            {s.id.slice(0, 8)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={s.status} />
                          {payment ? (
                            <Badge variant="secondary">
                              Pix {payment.status}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        ) : (
          <div className="text-sm text-white/60">Carregando configurações…</div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    started: "bg-blue-500/20 text-blue-300",
    free_ended: "bg-yellow-500/20 text-yellow-300",
    paid: "bg-emerald-500/20 text-emerald-300",
    completed: "bg-neutral-500/20 text-neutral-300",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        map[status] ?? "bg-neutral-500/20 text-neutral-300"
      }`}
    >
      {status}
    </span>
  );
}
