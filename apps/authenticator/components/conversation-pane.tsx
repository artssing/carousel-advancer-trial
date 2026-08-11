'use client';

/**
 * Authenticator's adapter over the shared ConversationPane.
 *
 * Same body as the consumer portal (@authentik/ui); the differences are the
 * authBrand colours and the fact that every listing/profile link points at the
 * consumer app, so it opens in a new tab rather than routing in-app.
 */
import {
  ConversationPane as SharedConversationPane,
  type ConversationPaneProps as SharedProps,
  type ConversationLinkProps,
} from '@authentik/ui';
import { api, getToken } from '@/lib/api';
import { OfferCard } from './offer-card';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');
const CONSUMER_URL = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';

/** Links leave the portal, so they are plain anchors into the consumer app. */
function CrossAppLink({ href, onClick, className, title, children }: ConversationLinkProps) {
  return (
    <a
      href={`${CONSUMER_URL}${href}`}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
    >
      {children}
    </a>
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
      theme="authenticator"
      linkComponent={CrossAppLink}
      deps={{ apiBaseUrl: API_URL, getToken, api }}
      renderOffer={(offerId) => <OfferCard offerId={offerId} currentUserId={props.currentUserId} />}
    />
  );
}
