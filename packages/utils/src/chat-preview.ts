import { t, type TLocale } from './locales';

/**
 * One-line preview of a conversation's last message, for the messages sidebar.
 *
 * Exists because the sidebar was printing message bodies verbatim, and some
 * bodies are not text: an offer's body is `__OFFER__:<offerId>`, so a real user
 * saw 「賣家：__OFFER__:clx8h2k9…」 in their list (2026-08-12).
 *
 * The rule this encodes: a body is only shown raw when we KNOW it is prose.
 * Anything matching the `__SENTINEL__:` shape falls back to a neutral label
 * even if we do not recognise it — so the next sentinel added to the product
 * cannot leak the same way while nobody remembers to update this file.
 */

/** An offer message. Must stay in step with the pane's own renderer. */
export const OFFER_SENTINEL = /^__OFFER__:(.+)$/;
/** Any `__NAME__:payload` body — the shape itself means "not prose". */
const ANY_SENTINEL = /^__[A-Z0-9_]+__:/;

export interface PreviewMessage {
  body: string;
  senderRole: 'BUYER' | 'SELLER' | 'AUTHENTICATOR' | 'SYSTEM' | string;
  senderId?: string | null;
  senderDisplayName?: string | null;
  isFiltered?: boolean;
  /** Resolved server-side so every client renders the same amount. */
  offerPriceHKD?: number | null;
}

export interface PreviewContext {
  /** The viewer, so their own messages read 「你」 rather than their name. */
  currentUserId?: string | null;
  /**
   * True for THREE_WAY. In a two-person channel the row title already names the
   * other person, so prefixing every line with that same name is noise.
   */
  showSenderName?: boolean;
}

/** Collapse newlines/runs of space, then cut on grapheme boundaries. */
function squash(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  // Intl.Segmenter keeps emoji (and family/flag sequences) whole; slicing by
  // code unit can cut one in half and render a replacement box.
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
    let out = '';
    for (const { segment } of seg.segment(flat)) {
      if (out.length + segment.length > max) break;
      out += segment;
    }
    return `${out}…`;
  }
  return `${flat.slice(0, max)}…`;
}

/** The body part of the preview — no sender prefix. */
export function previewBody(msg: PreviewMessage, locale: TLocale = 'zh'): string {
  if (msg.isFiltered) return t('utils.chatPreview.filtered', undefined, locale);

  const offer = OFFER_SENTINEL.exec(msg.body);
  if (offer) {
    return typeof msg.offerPriceHKD === 'number'
      ? t('utils.chatPreview.offer', { amount: msg.offerPriceHKD.toLocaleString('en-HK') }, locale)
      : t('utils.chatPreview.offerNoAmount', undefined, locale);
  }
  // Unknown sentinel — deliberately vague rather than leaking the payload.
  if (ANY_SENTINEL.test(msg.body)) return t('utils.chatPreview.unknown', undefined, locale);

  return squash(msg.body);
}

/**
 * The prefix naming who spoke, or '' when it would be redundant.
 *
 * Kept separate from the body so the caller can mark ONLY the body as
 * user-written content: the prefix is translated UI copy, and tagging the whole
 * line would hide a genuine translation gap from QA's scan.
 */
export function previewPrefix(
  msg: PreviewMessage,
  ctx: PreviewContext,
  locale: TLocale = 'zh',
): string {
  if (msg.senderRole === 'SYSTEM') return t('utils.chatPreview.systemPrefix', undefined, locale);
  if (ctx.currentUserId && msg.senderId === ctx.currentUserId) {
    return t('utils.chatPreview.youPrefix', undefined, locale);
  }
  if (!ctx.showSenderName) return '';
  const name = msg.senderDisplayName;
  if (!name) return '';
  // In a three-way thread "買家" and "賣家" are two specific people; the point of
  // the prefix is knowing WHICH one, so it uses the name. The authenticator
  // additionally carries their role, because who they are is load-bearing:
  // every authenticity call is attributed to a named authenticator, never to
  // the platform.
  return msg.senderRole === 'AUTHENTICATOR'
    ? t('utils.chatPreview.senderPrefixAuth', { name }, locale)
    : t('utils.chatPreview.senderPrefix', { name }, locale);
}

/** Placeholder for a conversation whose messages are all gone. */
export function previewEmpty(locale: TLocale = 'zh'): string {
  return t('utils.chatPreview.empty', undefined, locale);
}
