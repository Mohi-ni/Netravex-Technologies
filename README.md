# Netravex Technologies website

Static website plus a Supabase backend (serverless Postgres, Auth and one Edge Function).

```
index.html                 public site (hero, services, scorecard, roadmap, enquiry form)
admin.html                 staff page: sign in, view enquiries, change status, add notes, export CSV
config.js                  your Supabase URL and anon key (safe to publish)
assets/                    styles.css, site.js, admin.js, admin.css, areas.js (the 10 scorecard areas)
supabase/
  migrations/…_init.sql    tables, row-level security, admin check
  functions/submit-enquiry validates the form, saves it, sends the SMTP auto-reply
  config.toml
```

## How it fits together

1. A visitor fills in the form. `site.js` posts it to the `submit-enquiry` Edge Function.
2. The function validates every field, works out the readiness score itself from the ten answers, saves a row in `scoping_inquiries` with the consent record, then sends a short automated email through your SMTP server. A copy goes to your team mailbox if you set one.
3. If the email fails, the enquiry is still saved and marked `FAILED` in the admin page.
4. Staff sign in at `admin.html` with Supabase Auth. Row-level security lets only users listed in `admin_users` read or change enquiries. Everyone else, including anonymous visitors, gets nothing from the database directly.

## Set it up

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) for step 4. Steps 1 to 3 can be done in the Supabase dashboard.

**1. Create a project** at supabase.com. Note the project URL and the `anon` key (Project Settings > API).

**2. Create the tables.** Open the SQL editor, paste `supabase/migrations/20261120000000_init.sql` and run it.

**3. Create your first admin.**
- Authentication > Users > Add user (email and password). In Authentication > Providers > Email, switch off "Allow new users to sign up" so nobody else can register.
- In the SQL editor run (use your own email):
  ```sql
  insert into public.admin_users (user_id)
  select id from auth.users where email = 'you@example.com';
  ```

**4. Deploy the function and set the mail secrets.**
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set \
  SMTP_HOST=smtp.example.com SMTP_PORT=465 \
  SMTP_USER=enquiries@yourdomain.in SMTP_PASS='app-password' \
  SMTP_FROM='Netravex Technologies <enquiries@yourdomain.in>' \
  NOTIFY_EMAIL=team@yourdomain.in \
  ALLOWED_ORIGINS=https://your-site.example
supabase functions deploy submit-enquiry --no-verify-jwt
```
- Port 465 (TLS) is the safest choice. Gmail works with an app password (`smtp.gmail.com`, 465). Brevo, Zoho and most hosts also work.
- `NOTIFY_EMAIL` is optional. `ALLOWED_ORIGINS` is optional (default `*`); set it to your real site address once you have one.

**5. Point the site at Supabase.** Edit `config.js`:
```js
window.NETRAVEX_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_ANON_KEY"
};
```
Never put the `service_role` key here.

**6. Host the folder** on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Open `admin.html` on the live site and sign in.

Until `config.js` is filled in, the site runs in demo mode: the form shows what it would send and stores nothing, and the admin page offers sample data.

## Check it works

- Submit the form on the live site. You should see a reference like `NVX-10001`, receive the short email, and see the row in `admin.html`.
- Function logs: Supabase dashboard > Edge Functions > submit-enquiry > Logs. SMTP problems show up there and in the row's auto-reply status.
- Function logic tests (no network needed): `deno test supabase/functions/submit-enquiry/handler.test.ts`

## Things to know

- Spam control: a hidden honeypot field, and a limit of 3 enquiries per email address per hour.
- The consent text version is stored with every enquiry (`notice_version`). If you change the wording on the form, change `NOTICE_VERSION` in `handler.ts` too.
- Deleting an enquiry from the admin page (for an erasure request) removes it permanently. Delete the matching emails from your mailbox separately.
- This replaces the earlier Flask and Neon files. The old `scoping_inquiries` table is kept by name but has more columns and stricter rules, so run the new migration on a fresh Supabase project rather than copying the old SQL.
