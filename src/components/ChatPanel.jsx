import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, User } from "lucide-react";

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g;

const renderInline = (text, keyPrefix) => {
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(
        <code key={`${keyPrefix}-code-${parts.length}`} className="chat-inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <strong key={`${keyPrefix}-strong-${parts.length}`}>
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <em key={`${keyPrefix}-em-${parts.length}`}>
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
};

const parseBlocks = (content) => {
  const lines = String(content || "").split(/\r?\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.trim()) {
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2]
      });
      i += 1;
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    const bulletMatch = line.match(/^\s*[-*•]\s+(.+)$/);
    if (orderedMatch || bulletMatch) {
      const type = orderedMatch ? "ol" : "ul";
      const items = [];
      while (i < lines.length) {
        const current = lines[i];
        const nextMatch =
          type === "ol"
            ? current.match(/^\s*\d+\.\s+(.+)$/)
            : current.match(/^\s*[-*•]\s+(.+)$/);
        if (!nextMatch) break;
        items.push(nextMatch[1]);
        i += 1;
      }
      blocks.push({ type, items });
      continue;
    }

    const paragraph = [];
    while (i < lines.length) {
      const current = lines[i];
      if (!current || !current.trim()) {
        i += 1;
        break;
      }
      if (/^(#{1,3})\s+/.test(current)) break;
      if (/^\s*[-*•]\s+/.test(current)) break;
      if (/^\s*\d+\.\s+/.test(current)) break;
      paragraph.push(current);
      i += 1;
    }
    if (paragraph.length) {
      blocks.push({ type: "p", text: paragraph.join("\n") });
    }
  }

  return blocks.length ? blocks : [{ type: "p", text: String(content || "") }];
};

const renderHeadingContent = (text, keyPrefix) => {
  const match = String(text || "").match(/^\s*(\d+(?:\.\d+)*)([.)]?)\s+(.+)$/);
  if (!match) {
    return renderInline(text, `${keyPrefix}-heading`);
  }
  const number = `${match[1]}${match[2] || ""}`;
  const rest = match[3];
  return (
    <>
      <strong className="chat-heading-number">{number}</strong>{" "}
      {renderInline(rest, `${keyPrefix}-heading-rest`)}
    </>
  );
};

const renderMessageContent = (content, keyPrefix) => {
  const blocks = parseBlocks(content);
  return (
    <div className="chat-markdown">
      {blocks.map((block, index) => {
        const key = `${keyPrefix}-block-${index}`;
        if (block.type === "heading") {
          const HeadingTag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
          return (
            <HeadingTag key={key}>
              {renderHeadingContent(block.text, `${key}-heading`)}
            </HeadingTag>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>
                  {renderInline(item, `${key}-item-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-item-${itemIndex}`}>
                  {renderInline(item, `${key}-item-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }
        const lines = String(block.text || "").split("\n");
        return (
          <p key={key}>
            {lines.map((line, lineIndex) => (
              <span key={`${key}-line-${lineIndex}`}>
                {renderInline(line, `${key}-line-${lineIndex}`)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
};

export default function ChatPanel({
  messages = [],
  onSend,
  onCollapse,
  readOnly = false,
  eyebrow = "Chatbot",
  title = "RFQ Assistant"
}) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const attachmentsRef = useRef([]);
  const messagesEndRef = useRef(null);

  const canSend =
    !readOnly && (input.trim().length > 0 || attachments.length > 0) && !busy;

  const speechAvailable = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  const handleSend = async () => {
    if (!canSend) return;
    const content = input.trim();
    const outgoingAttachments = attachments;
    setInput("");
    setAttachments([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    const shouldShowBusy = content.length > 0 || outgoingAttachments.length > 0;
    if (shouldShowBusy) {
      setBusy(true);
    }

    try {
      if (onSend) {
        await onSend(content, outgoingAttachments);
      }
    } finally {
      if (shouldShowBusy) {
        setBusy(false);
      }
    }
  };

  const handleStartListening = () => {
    if (!speechAvailable || readOnly) {
      return;
    }
    if (!recognitionRef.current) {
      const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new Speech();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = () => setListening(false);
      recognitionRef.current = recognition;
    }
    setListening(true);
    recognitionRef.current.start();
  };

  const handleAttach = (event) => {
    if (readOnly) {
      event.target.value = "";
      return;
    }
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const next = files.map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      name: file.name,
      url: URL.createObjectURL(file)
    }));
    setAttachments((prev) => [...prev, ...next]);
    event.target.value = "";
  };

  const handleOpenAttachment = (attachment) => {
    if (!attachment?.url) return;
    setPreviewAttachment(attachment);
  };

  const handleClosePreview = () => {
    setPreviewAttachment(null);
  };

  const getAttachmentName = (attachment) =>
    attachment?.name || attachment?.file?.name || "Attachment";

  const getAttachmentKind = (attachment) => {
    const mime = attachment?.file?.type || "";
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf") return "pdf";
    const name = getAttachmentName(attachment);
    const ext = name.split(".").pop()?.toLowerCase() || "";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (["txt", "md", "csv"].includes(ext)) return "text";
    return "file";
  };

  const renderAttachmentPreview = (attachment) => {
    const kind = getAttachmentKind(attachment);
    const name = getAttachmentName(attachment);
    if (kind === "image") {
      return <img src={attachment.url} alt={name} className="chat-modal-image" />;
    }
    if (kind === "pdf" || kind === "text") {
      return (
        <iframe
          title={name}
          src={attachment.url}
          className="chat-modal-frame"
        />
      );
    }
    return (
      <div className="chat-modal-fallback">
        <p>Preview not available for this file type.</p>
        <div className="chat-modal-actions">
          <a
            className="outline-button px-3 py-2 text-xs"
            href={attachment.url}
            target="_blank"
            rel="noreferrer"
          >
            Open in new tab
          </a>
          <a className="outline-button px-3 py-2 text-xs" href={attachment.url} download={name}>
            Download
          </a>
        </div>
      </div>
    );
  };

  const handleRemoveAttachment = (id) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const renderAttachmentChips = (items, variant) => {
    if (!items?.length) return null;
    const variantClass =
      variant === "message"
        ? "chat-attachment-row--message"
        : variant === "message-compact"
          ? "chat-attachment-row--message-compact"
          : "chat-attachment-row--input";
    return (
      <div className={`chat-attachment-row ${variantClass}`}>
        {items.map((attachment) => {
          const name = getAttachmentName(attachment);
          return (
            <div key={attachment.id || name} className="chat-attachment-chip">
              <button
                type="button"
                className="chat-attachment-open"
                onClick={() => attachment.url && handleOpenAttachment(attachment)}
                title={name}
              >
                <span className="chat-attachment-dot" aria-hidden="true" />
                <span className="chat-attachment-name">{name}</span>
              </button>
              {variant === "input" ? (
                <button
                  type="button"
                  className="chat-attachment-remove"
                  onClick={() => handleRemoveAttachment(attachment.id)}
                  aria-label={`Remove ${name}`}
                  title="Remove attachment"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12" />
                    <path d="M18 6l-12 12" />
                  </svg>
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    if (!readOnly) return;
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
    setInput("");
    setAttachments((prev) => {
      prev.forEach((attachment) => {
        URL.revokeObjectURL(attachment.url);
      });
      return [];
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [readOnly, listening]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.url);
      });
    };
  }, []);

  useEffect(() => {
    if (!previewAttachment) return;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewAttachment(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewAttachment]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  return (
    <div className="card flex h-full min-h-0 flex-col pt-6 pb-2 px-6 md:pt-7 md:pb-2 md:px-7">
      <div className="flex items-center justify-between border-slate-200/70">
        <div className="flex items-center gap-3">
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="collapse-toggle"
              aria-label="Collapse chatbot"
              title="Collapse chatbot"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : null}
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">{eyebrow}</p>
            <h2 className="font-display text-2xl text-ink">{title}</h2>
          </div>
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto rounded-2xl border border-slate-200/70 bg-white/70 px-2 pt-2 pb-2">
        <div className="flex min-h-full flex-col justify-start">
          <div className="space-y-3">
            {messages.map((message, index) => {
              const hasContent = Boolean(message.content && String(message.content).trim());
              return (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex items-end gap-2 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role !== "user" ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
                      <Bot className="h-4 w-4" />
                    </span>
                  ) : null}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-3 text-sm shadow-sm ${
                      message.role === "user" ? "chat-bubble-user" : "chat-bubble-bot"
                    }`}
                  >
                    {hasContent ? renderMessageContent(message.content, `${message.role}-${index}`) : null}
                    {message.attachments?.length
                      ? renderAttachmentChips(
                          message.attachments,
                          hasContent ? "message" : "message-compact"
                        )
                      : null}
                  </div>
                  {message.role === "user" ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-tide/30 bg-tide/10 text-tide shadow-sm">
                      <User className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
              );
            })}
            {busy ? (
              <div className="flex items-end gap-2 justify-start">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="max-w-[60%] rounded-2xl px-4 py-3 text-sm shadow-sm chat-bubble-bot">
                  <span className="typing-dots" aria-label="Assistant is typing">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              </div>
            ) : null}
          </div>
          <div ref={messagesEndRef} className="h-0" />
        </div>
      </div>

      <div className="mt-2 space-y-3">
        <div className="chat-input-shell">
          {renderAttachmentChips(attachments, "input")}
          <div className="relative">
            <textarea
              rows={1}
              className="chat-input-textarea w-full resize-none py-3 pl-12 pr-20"
              placeholder={
                readOnly
                  ? "Chat is locked once the RFQ enters validation"
                  : "Type your message"
              }
              value={input}
              readOnly={readOnly}
              disabled={readOnly}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (readOnly) {
                  event.preventDefault();
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                  event.preventDefault();
                  handleSend();
                }
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleAttach}
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={readOnly}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-50"
                title="Attach files"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-8.49 8.49a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95L9.88 15.38a2 2 0 1 1-2.83-2.83l8.49-8.49" />
                </svg>
              </button>
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartListening}
                disabled={readOnly}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-tide/40 hover:text-tide disabled:cursor-not-allowed disabled:opacity-50"
                title={readOnly ? "Chat is locked" : listening ? "Listening..." : "Speak"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <path d="M12 19v4" />
                  <path d="M8 23h8" />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-tide/40 bg-tide/10 text-tide shadow-sm transition hover:bg-tide/20 disabled:cursor-not-allowed disabled:opacity-50"
                title={busy ? "Analyzing..." : "Send"}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22l-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {previewAttachment ? (
        <div className="chat-modal-backdrop" onClick={handleClosePreview} role="presentation">
          <div
            className="chat-modal chat-modal--preview"
            role="dialog"
            aria-modal="true"
            aria-label={getAttachmentName(previewAttachment)}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-modal-header">
              <p className="chat-modal-title">{getAttachmentName(previewAttachment)}</p>
              <button
                type="button"
                className="chat-modal-close"
                onClick={handleClosePreview}
                aria-label="Close preview"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12" />
                  <path d="M18 6l-12 12" />
                </svg>
              </button>
            </div>
            <div className="chat-modal-body">{renderAttachmentPreview(previewAttachment)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
