import type { Metadata } from "next";

import { MessageCenter } from "@/features/communication/components/message-center";
import { getThreadMessages, listMyThreads } from "@/features/communication/queries";
import { requirePortal } from "@/features/portal/context";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Messages" };

/** Messages de l'établissement : la famille lit et répond aux conversations où elle est invitée. */
export default async function PortalMessagesPage({ searchParams }: PageProps<"/portail/messages">) {
  const { organization } = await requirePortal();
  const fil = param(await searchParams, "fil");
  const threads = await listMyThreads(organization.id);
  const selected = isUuid(fil) ? (threads.find((t) => t.id === fil) ?? null) : null;
  const messages = selected ? await getThreadMessages(selected.id) : null;

  return (
    <>
      <h1 className="text-xl font-bold">Messages</h1>
      <MessageCenter threads={threads} selected={selected ? { ...selected, unread: false } : null} messages={messages} basePath="/portail/messages" timezone={organization.timezone} />
    </>
  );
}
