'use client';

/**
 * Consumer's adapter over the shared ConversationPane.
 *
 * The 1,200-line body now lives in @certifine/ui. This file supplies only the
 * three things that were ever actually different between the two portals —
 * colours, how a link is rendered, and which api client to call. Existing
 * callers (the messages page, ConversationDrawer) import from here unchanged.
 *
 * The offer card stays app-local on purpose: it is still forked between the
 * portals and is a separate merge.
 */
import NextLink from 'next/link';
import {
  ConversationPane as SharedConversationPane,
  type ConversationPaneProps as SharedProps,
  type ConversationLinkProps,
} from '@certifine/ui';
import { api, getToken } from '@/lib/api';
import { OfferCard } from './offer-card';

// WebSocket connects to the API origin (not the /api path). Strip a trailing
// /api so one NEXT_PUBLIC_API_URL serves both REST and WS.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');

function ConsumerLink({ href, onClick, className, title, children }: ConversationLinkProps) {
  return (
    <NextLink href={href as any} onClick={onClick} className={className} title={title}>
      {children}
    </NextLink>
  );
}

export type ConversationPaneProps = Omit<
  SharedProps,
  'theme' | 'linkComponent' | 'deps' | 'renderOffer'
>;

export function ConversationPane(props: ConversationPaneProps) {
  return (
    <SharedConversationPane
      {...props}
      theme="consumer"
      linkComponent={ConsumerLink}
      deps={{ apiBaseUrl: API_URL, getToken, api }}
      renderOffer={(offerId) => <OfferCard offerId={offerId} currentUserId={props.currentUserId} />}
    />
  );
}
