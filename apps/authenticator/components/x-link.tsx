'use client';

/**
 * Cross-app link to the consumer portal. Opens in a new tab so authenticator
 * portal session is preserved.
 *
 * Lesson #4 — never use next/link to navigate to consumer routes from the
 * authenticator app (404). Always use <a target="_blank"> with the
 * NEXT_PUBLIC_CONSUMER_URL env baked in at build time.
 */
const CONSUMER_URL = process.env.NEXT_PUBLIC_CONSUMER_URL ?? 'http://localhost:3008';

export function XLink({ href, className, children, title, onClick }: {
  href: string;
  className?: string;
  children: React.ReactNode;
  title?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <a
      href={`${CONSUMER_URL}${href}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
