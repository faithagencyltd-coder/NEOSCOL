"use client";

import { Mail, Smartphone } from "lucide-react";
import { Tabs } from "radix-ui";

import { PasswordSignInForm } from "@/features/auth/components/password-sign-in-form";
import { PhoneSignInForm } from "@/features/auth/components/phone-sign-in-form";

const triggerClass =
  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm [&_svg]:size-4";

export function SignInTabs({ next }: { next?: string }) {
  return (
    <Tabs.Root defaultValue="email" className="grid gap-6">
      <Tabs.List aria-label="Méthode de connexion" className="flex gap-1 rounded-lg bg-surface-muted p-1">
        <Tabs.Trigger value="email" className={triggerClass}>
          <Mail aria-hidden /> E-mail
        </Tabs.Trigger>
        <Tabs.Trigger value="phone" className={triggerClass}>
          <Smartphone aria-hidden /> Téléphone
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="email">
        <PasswordSignInForm next={next} />
      </Tabs.Content>
      <Tabs.Content value="phone">
        <PhoneSignInForm next={next} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
