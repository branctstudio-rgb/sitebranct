import { createMockGatewayAdapter } from "./mock-adapter.mjs";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isDevFeatureEnabled(locationLike) {
  const url = locationLike instanceof URL ? locationLike : new URL(locationLike.href);
  return LOOPBACK.has(url.hostname) && url.searchParams.get("chat_ia_dev") === "1";
}

export function createChatSession({ adapter, locale = "pt-BR" }) {
  if (!adapter?.send) throw new TypeError("adapter.send is required");
  const state = {
    status: "idle",
    messages: [],
    fallback: null,
    contact: { state: "not_asked" },
    leadDraft: null,
  };
  let controller = null;
  const snapshot = () => structuredClone(state);

  return Object.freeze({
    snapshot,
    canAskForContact: () => state.contact.state === "not_asked",
    async send(text) {
      const visitor = { text: String(text).trim(), author: "visitante" };
      if (!visitor.text) return snapshot();
      state.messages.push(visitor);
      state.status = "loading";
      state.fallback = null;
      controller = new AbortController();
      try {
        const result = await adapter.send({ text: visitor.text, history: state.messages.slice(0, -1), locale, signal: controller.signal });
        const nonResponse = {
          recusa_seguranca: ["blocked", "A mensagem foi recusada pela política de segurança do mock."],
          entrada_inconclusiva: ["inconclusive", "A entrada sintética não foi conclusiva."],
          timeout: ["timeout", "O mock excedeu o tempo previsto."],
          falha_provedor: ["error", "O provedor sintético não respondeu."],
          cancelado: ["cancelled", "A resposta foi cancelada."],
          replay: ["replay", "O mock identificou uma repetição da mensagem."],
        };
        if (result?.resultado === "resposta" && typeof result.resposta?.texto === "string" && result.resposta.autor === "chat_ia") {
          state.messages.push({ text: result.resposta.texto, author: "chat_ia" });
          state.status = "ready";
        } else if (Object.hasOwn(nonResponse, result?.resultado)) {
          [state.status, state.fallback] = nonResponse[result.resultado];
        } else {
          state.status = "error";
          state.fallback = "O adaptador devolveu um resultado inválido.";
        }
      } catch (error) {
        if (error?.name === "AbortError") state.status = "cancelled";
        else {
          state.status = "error";
          state.fallback = "Não foi possível responder agora. Tente novamente neste ambiente DEV.";
        }
      } finally {
        controller = null;
      }
      return snapshot();
    },
    cancel() {
      controller?.abort();
    },
    acceptContact() {
      if (state.contact.state === "refused" || state.contact.state === "withdrawn") throw new Error("Contact consent was refused for this session");
      state.contact.state = "accepted";
      return snapshot();
    },
    refuseContact() {
      state.contact.state = "refused";
      state.leadDraft = null;
      return snapshot();
    },
    withdrawContact() {
      state.contact.state = "withdrawn";
      state.leadDraft = null;
      return snapshot();
    },
    createLeadDraft(fields) {
      if (state.contact.state !== "accepted") throw new Error("Explicit contact consent is required");
      state.leadDraft = Object.freeze({
        decision: "PROPOSTA_LEAD",
        destination: "edi-fronteira-simulada",
        nenhum_lead_real_criado: true,
        fields: { ...fields },
      });
      return structuredClone(state.leadDraft);
    },
  });
}

function renderMessages(list, messages) {
  list.replaceChildren(...messages.map(({ text, author }) => {
    const item = document.createElement("li");
    item.className = `chat-message chat-message--${author}`;
    item.textContent = text;
    return item;
  }));
  list.scrollTop = list.scrollHeight;
}

function installPrototype() {
  const root = document.querySelector("[data-chat-root]");
  if (!root || !isDevFeatureEnabled(window.location)) return;
  root.hidden = false;
  document.documentElement.dataset.chatDevEnabled = "true";
  const opener = root.querySelector("[data-chat-open]");
  const dialog = root.querySelector("[data-chat-dialog]");
  const close = root.querySelector("[data-chat-close]");
  const form = root.querySelector("[data-chat-form]");
  const input = root.querySelector("[data-chat-input]");
  const messages = root.querySelector("[data-chat-messages]");
  const status = root.querySelector("[data-chat-status]");
  const cancel = root.querySelector("[data-chat-cancel]");
  const consent = root.querySelector("[data-contact-consent]");
  const contactForm = root.querySelector("[data-contact-form]");
  const draft = root.querySelector("[data-lead-draft]");
  const page = document.querySelector("main");
  const session = createChatSession({ adapter: createMockGatewayAdapter(), locale: document.documentElement.lang || "pt-BR" });
  let lastFocus = null;

  const update = () => {
    const current = session.snapshot();
    renderMessages(messages, current.messages);
    status.textContent = current.status === "loading" ? "Edi está a preparar uma resposta…" : current.fallback ?? "";
    cancel.hidden = current.status !== "loading";
    form.querySelector("button[type=submit]").disabled = current.status === "loading";
    consent.hidden = !["not_asked", "accepted"].includes(current.contact.state);
    contactForm.hidden = current.contact.state !== "accepted";
    draft.hidden = !current.leadDraft;
    if (current.leadDraft) draft.textContent = "Rascunho local pronto — nenhuma gravação em CRM foi realizada.";
  };

  const openDialog = () => {
    lastFocus = opener;
    dialog.hidden = false;
    opener.disabled = true;
    opener.setAttribute("aria-expanded", "true");
    document.body.classList.add("chat-open");
    if (page) page.inert = true;
    close.focus();
  };
  const closeDialog = () => {
    dialog.hidden = true;
    opener.disabled = false;
    opener.setAttribute("aria-expanded", "false");
    document.body.classList.remove("chat-open");
    if (page) page.inert = false;
    lastFocus?.focus();
  };
  opener.addEventListener("click", openDialog);
  close.addEventListener("click", closeDialog);
  dialog.addEventListener("pointerdown", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDialog();
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), input:not([disabled])")].filter((element) => element.checkVisibility());
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value;
    input.value = "";
    const pending = session.send(text);
    update();
    await pending;
    update();
  });
  cancel.addEventListener("click", () => { session.cancel(); });
  root.querySelector("[data-contact-accept]").addEventListener("click", () => { session.acceptContact(); update(); contactForm.querySelector("button[type=submit]").focus(); });
  root.querySelector("[data-contact-refuse]").addEventListener("click", () => { session.refuseContact(); update(); close.focus(); });
  root.querySelector("[data-contact-withdraw]").addEventListener("click", () => { session.withdrawContact(); update(); close.focus(); });
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    session.createLeadDraft({ name: "Pessoa Sintética", channel: "contacto-sintetico" });
    update();
  });
  update();
}

if (typeof document !== "undefined") installPrototype();
