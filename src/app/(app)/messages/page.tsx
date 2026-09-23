import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { MessageCenter } from "@/features/communication/components/message-center";
import { NewThreadDialog } from "@/features/communication/components/thread-ui";
import { getThreadMessages, listMessageContacts, listMyThreads } from "@/features/communication/queries";
import { requireOrganization } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Messagerie" };

/**
 * Messagerie interne : conversations auxquelles l'utilisateur participe.
 * Démarrer une conversation exige communication.message ; les destinataires
 * possibles sont filtrés en base selon le rôle (enseignant : ses classes).
 */
export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const context = await requireOrganization();
  const orgId = context.organization.id;
  const fil = param(await searchParams, "fil");
  const canWrite = can(context, "communication.message");
  const [threads, contacts] = await Promise.all([listMyThreads(orgId), canWrite ? listMessageContacts(orgId) : Promise.resolve([])]);
  const selected = isUuid(fil) ? (threads.find((t) => t.id === fil) ?? null) : null;
  const messages = selected ? await getThreadMessages(selected.id) : null;
  const newThread = canWrite ? <NewThreadDialog contacts={contacts} /> : undefined;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Messagerie"
        description="Échanges entre le personnel et avec les familles. Les parents et élèves répondent depuis leur portail."
        actions={newThread}
      />
      <MessageCenter
        threads={threads}
        selected={selected ? { ...selected, unread: false } : null}
        messages={messages}
        basePath="/messages"
        timezone={context.organization.timezone}
        emptyAction={newThread}
      />
    </div>
  );
}
