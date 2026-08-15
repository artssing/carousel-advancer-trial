'use client';

/**
 * Authenticator's adapter over the shared OfferCard.
 *
 * Merging the fork (2026-08-11) fixed two things this copy had drifted on: it
 * was never wired to i18n, and it still used an inline confirmation panel
 * instead of ConfirmDialog (founder 2026-07-12). Both now come from the shared
 * component. Links leave the portal, so they are plain anchors into consumer.
 */
import { OfferCard as SharedOfferCard, type ConversationLinkProps } from '@certifine/ui';
import { api } from '@/lib/api';

const CONSUMER_URL = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';

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
      theme="authenticator"
      linkComponent={CrossAppLink}
      api={api}
    />
  );
}
