"use client";

import { loginSchema, registerSchema } from "@sinema/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJson, type User } from "@/lib/api";
import { useErrorMessage } from "@/lib/format";
import { setSession } from "@/lib/session";

type Mode = "login" | "register";

/** Only same-site paths are followed after sign-in, so a link cannot send users elsewhere. */
function safeNext(next: string | undefined): string {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** `demoEmail` is the seeded account shown under the form, e.g. the admin one in /admin. */
export function AuthForm({
  mode,
  next,
  demoEmail = "customer@sinema.test",
}: {
  mode: Mode;
  next?: string;
  demoEmail?: string;
}) {
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  const submit = useMutation({
    mutationFn: (input: unknown) =>
      postJson<{ token: string; user: User }>(`/auth/${mode}`, input),
    onSuccess: (session) => {
      setSession(session);
      void queryClient.invalidateQueries();
      router.push(safeNext(next));
    },
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const result = (mode === "login" ? loginSchema : registerSchema).safeParse(values);
    if (!result.success) {
      setInvalid(new Set(result.error.issues.map((issue) => String(issue.path[0]))));
      return;
    }
    setInvalid(new Set());
    submit.mutate(result.data);
  };

  const field = (name: string, type: string, autoComplete: string) => (
    <div className="space-y-2">
      <Label htmlFor={name}>{t(`auth.${name}`)}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-invalid={invalid.has(name) || undefined}
      />
    </div>
  );

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">
          {t(mode === "login" ? "auth.signInTitle" : "auth.registerTitle")}
        </CardTitle>
        <CardDescription>
          {t(mode === "login" ? "auth.signInSubtitle" : "auth.registerSubtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {mode === "register" && field("name", "text", "name")}
          {field("email", "email", "email")}
          {field("password", "password", mode === "login" ? "current-password" : "new-password")}

          {(invalid.size > 0 || submit.isError) && (
            <Alert variant="destructive">
              <AlertDescription>
                {invalid.size > 0 ? t("errors.VALIDATION") : errorMessage(submit.error)}
              </AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={submit.isPending}>
            {t(mode === "login" ? "common.signIn" : "common.register")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t(mode === "login" ? "auth.noAccount" : "auth.haveAccount")}{" "}
            <Link
              href={`${mode === "login" ? "/register" : "/login"}${nextQuery}`}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {t(mode === "login" ? "common.register" : "common.signIn")}
            </Link>
          </p>
          {mode === "login" && (
            <p className="text-center text-xs text-muted-foreground">
              {t("auth.demoHint", { email: demoEmail, password: "demo1234" })}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
