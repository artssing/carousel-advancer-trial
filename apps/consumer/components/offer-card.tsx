'use client';

/**
 * Consumer's adapter over the shared OfferCard.
 *
 * The body now lives in @authentik/ui — see the note there for why the fork was
 * merged. This file supplies the same three things the ConversationPane adapter
 * does: colours, how a link is rendered, and which api client to call.
 */
import NextLink from 'next/link';
import { OfferCard as SharedOfferCard, type ConversationLinkProps } from '@authentik/ui';
import { api } from '@/lib/api';

function ConsumerLink({ href, onClick, className, title, children }: ConversationLinkProps) {
  return (
    <NextLink href={href as any} onClick={onClick} className={className} title={title}>
      {children}
    </NextLink>
  );
}

interface OfferCardProps {
  offerId: string;
  currentUserId: string;
  /** Optional callback to refresh conversation messages after action */
  onAction?: () => void;
}

export function OfferCard(props: OfferCardProps) {
  return (
    <SharedOfferCard
      {...props}
      theme="consumer"
      linkComponent={ConsumerLink}
      api={api}
    />
  );
}
