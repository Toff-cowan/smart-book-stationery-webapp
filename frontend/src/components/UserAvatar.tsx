"use client";

import { mediaUrl } from "@/lib/format";

type UserAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  size?: "sm" | "md";
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function UserAvatar({
  name,
  avatarUrl,
  className = "",
  size = "sm",
}: UserAvatarProps) {
  const src = mediaUrl(avatarUrl);
  const classes = `user-avatar user-avatar-${size}${className ? ` ${className}` : ""}`;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={classes} />
    );
  }

  return (
    <span className={`${classes} user-avatar-fallback`} aria-hidden>
      {initials(name)}
    </span>
  );
}
