'use client';

/**
 * ConversationDrawer — slide-in overlay wrapper around ConversationPane.
 *
 * Use this in **contextual** entry points where the user is already on a page
 * (listing detail, orders page, authenticate workbench) and just wants to
 * chat without leaving.
 *
 * For the dedicated /messages route, use the two-pane layout (which renders
 * ConversationPane directly) — NOT this drawer.
 */
import { ConversationPane, type ConversationPaneProps } from './conversation-pane';

export type ConversationDrawerProps = Omit<ConversationPaneProps, 'chrome' | 'showBackButton'> & {
  onClose: () => void;
};

export function ConversationDrawer(props: ConversationDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={props.onClose}>
      <div
        className="h-full w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ConversationPane {...props} chrome="drawer" />
      </div>
    </div>
  );
}
