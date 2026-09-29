/** « Mon badge » tel que renvoyé par la fonction my_badge (identité + QR du moment). */
export type MyBadge = {
  kind: "staff" | "student";
  role: string;
  number: string;
  first_name: string;
  last_name: string;
  subtitle: string | null;
  identifier: string | null;
  photo_file_id: string | null;
  issued_at: string;
  organization: { name: string; code: string; color: string | null; is_demo: boolean };
  code: string;
  expires_at: string;
};
