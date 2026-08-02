alter table public.notification_contacts
  drop constraint if exists notification_contacts_phone_check;

alter table public.notification_contacts
  add constraint notification_contacts_phone_check check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  );
