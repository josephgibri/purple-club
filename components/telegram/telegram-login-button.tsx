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
  /** Fired when Telegram refuses to draw the button (wrong domain, blocked script). */
  onUnavailable?: () => void;
};

/**
 * Renders the official Telegram Login Widget button. Telegram injects an
 * iframe and calls a global callback with the signed auth payload, which we
 * forward to `onAuth`. The bot's domain must be registered with @BotFather
 * (`/setdomain`) or the widget silently refuses to render.
 */
export function TelegramLoginButton({ botUsername, onAuth, onUnavailable }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  const onUnavailableRef = useRef(onUnavailable);

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

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

    const timer = window.setTimeout(() => {
      if (!container.querySelector("iframe")) onUnavailableRef.current?.();
    }, 2500);

    return () => {
      window.clearTimeout(timer);
      container.innerHTML = "";
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [botUsername]);

  return <div ref={containerRef} className="flex justify-center" />;
}
