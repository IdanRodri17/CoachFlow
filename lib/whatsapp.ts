// lib/whatsapp.ts — V11: "Remind on WhatsApp" deep link.
//
// Builds a wa.me link with a prefilled reminder message. The trainer enters
// each client's phone manually (trainer_clients.contact_phone / managed_
// clients.phone) — neither auth mode exposes a client's real phone to the
// trainer's client-side session, so this is a simple, trainer-owned contact
// field, not tied to auth (see 0011_reminders.sql).

import i18next from "./i18n";

/**
 * International digits-only, as wa.me requires (country code, no leading 0,
 * no "+"). Converts an Israeli local number (leading 0, e.g. "0501234567")
 * to international ("972501234567") — a loose sanity check, not a full
 * E.164 validator.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

/** A wa.me link to this phone with a prefilled (already translated) message;
 * null when the phone isn't usable. D23b's nudge and renewal messages. */
export function buildWhatsAppLink(phone: string | null, text: string): string | null {
  const digits = phone ? normalizePhone(phone) : null;
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/** D25: the invite code on WhatsApp (clients.inviteMessage). With a phone it
 * opens that chat; without one, WhatsApp's chat picker. */
export function buildWhatsAppInviteLink({
  code,
  label,
  trainerName,
  phone,
}: {
  code: string;
  label: string | null;
  trainerName: string;
  phone?: string | null;
}): string {
  const message = i18next.t("clients.inviteMessage", {
    greeting: label ? i18next.t("clients.inviteGreetingNamed", { name: label }) : i18next.t("clients.inviteGreeting"),
    code,
    trainerName,
  });
  return buildWhatsAppLink(phone ?? null, message) ?? `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildWhatsAppReminderLink({
  phone,
  clientName,
  trainerName,
  dateLabel,
  timeLabel,
  templateName,
}: {
  phone: string | null;
  clientName: string;
  trainerName: string;
  dateLabel: string;
  timeLabel: string | null;
  templateName: string;
}): string | null {
  const digits = phone ? normalizePhone(phone) : null;
  if (!digits) return null;

  const when = timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel;
  const message = `Hi ${clientName}! Just a reminder about your "${templateName}" workout ${when} with ${trainerName}. See you then! 💪`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
