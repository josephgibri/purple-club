"use client";

import { useEffect, useRef } from "react";

export type TelegramAuthUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

type Props = {
  botUsername: string;
  onAuth: (user: TelegramAuthUser) => void;
};

/**
 * Renders the official Telegram Login Widget button. Telegram injects an
 * iframe and calls a global callback with the signed auth payload, which we
 * forward to `onAuth`. The bot's domain must be registered with @BotFather
 * (`/setdomain`) or the widget silently refuses to render.
 */
export function TelegramLoginButton({ botUsername, onAuth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !botUsername) return;

    const callbackName = "__pcTelegramAuth";
    (window as unknown as Record<string, unknown>)[callbackName] = (user: TelegramAuthUser) => {
      onAuthRef.current(user);
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [botUsername]);

  return <div ref={containerRef} className="flex justify-center" />;
}
