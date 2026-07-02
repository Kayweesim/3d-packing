 The cost/pentest concern is really about public internet exposure

  Most of the security/pentest burden you're worried about comes from putting something on the public internet. There are two cheaper shapes that still give you "admin saves once, ground references by ID":
     
  1. Internal-only ("intranet") web app — identical smooth UX to a normal web app, but only reachable inside PSA's network/VPN. Because it never touches the public internet, it typically falls under much
  lighter internal security review rather than a full external pentest. This is the standard answer and by far the smoothest for a "type an ID, see the sequence" workflow.
  
  2. Truly serverless via shared storage — no server at all. You're already on Microsoft 365 (your paths are under OneDrive/PSA). Use a shared SharePoint/OneDrive folder as the "history database": each
  packing result is saved as a small JSON file named by an ID (e.g. LP-20260624-014.json). Admin generates and saves it; ground opens the app and "Load by ID," which just reads the synced file. The only thing the two teams exchange is the short ID.
  
  The unavoidable core

  To reference the same ID on both sides without re-entering data, you need one shared place both sides read from. That place can be an internal server (a DB) or a synced file store (SharePoint/OneDrive) —
  but there's no way to skip having some shared medium. The good news is it doesn't have to be a public web app.

  One technical wrinkle for the serverless route

  A browser can't freely read your local/synced folder (sandbox). So for option 2 you'd pick one of:
  - Run your existing FastAPI backend locally on each machine and let it read/write the synced folder (frontend calls it). You already have this backend — least new work.
  - Package as a desktop app (Tauri/Electron) that can touch the filesystem.
  - Chrome's File System Access API — the page reads a folder the user picks (Chromium-only).

  My default recommendation

  - If you can get any internal machine/VM to host it: internal intranet app + a tiny SQLite history table. Central, smoothest, light security burden.
  - If you must stay fully serverless: SharePoint/OneDrive folder of JSON history keyed by ID, with your local FastAPI backend doing the file I/O.

  The data model is the same either way: { id, createdAt, createdBy, summary, containers, placements }, where id is short and human-sayable.

  A few things change the answer materially, so:

● User answered Claude's questions:
  ⎿  · What does the ground team primarily use to view the sequence? → Mixed
     · Can you get an internal machine/VM to host the app on PSA's network (reachable only via LAN/VPN, not the public internet)? → Unsure
     · Are both teams on the same Microsoft 365 / SharePoint tenant (so a shared folder is accessible to both)? → Yes

● That combination actually points to a clean answer: lean on Microsoft 365 itself as the shared layer. Same tenant = yes is the big lever, and "mixed devices including handhelds" rules out the OneDrive
  file-sync approach (sync is fine on desktops, painful on phones/tablets).

  Recommended shape: SharePoint as the shared "history DB," M365 as the viewer

  Split the app into two roles:

  1. Admin = the generator. Keep using your packing app (it can stay local — no public deployment needed). When a plan is finalized, it writes one record to a SharePoint List (or a JSON file in a
  SharePoint document library) via the Microsoft Graph API. That call is tenant-internal, not a public endpoint.
  2. Ground = the viewer. They reference the ID through tools Microsoft already hosts and PSA IT already secures:
    - SharePoint List opened in a browser or the SharePoint mobile app — works on desktop and handhelds, filter/search by ID, done. Zero custom deployment.
    - Optional nicer mobile UI: a Power App over the same list (drag-and-drop, runs inside M365 auth, still no public surface).

  Why this fits your constraints:
  - No public web app → no external pentest. Everything lives inside the M365 tenant under PSA's existing governance. The only IT ask is an Entra app registration so your admin app can write via Graph —   
  far smaller than deploying and pentesting a public service.
  - Mixed devices handled — SharePoint/Power Apps are first-class on mobile and desktop; OneDrive folder-sync wouldn't be.
  - Reference-by-ID — the ID is just the list item key / a filterable column.
  - No double entry — admin writes, ground only reads.
  - Hosting "unsure" doesn't block you — Microsoft hosts the viewer; you don't stand up a server.

  Data model (one list item per plan):
  id          LP-20260624-014      (short, human-sayable: load-plan, date, running #)
  createdAt   2026-06-24T09:14:00
  createdBy   admin user
  summary     "2× 40ft FEU + 1× 20ft TEU, 7785 cartons, 96% all-packed"
  payload     <JSON: containers + placements + pallet sequence>
  The ordered pallet/carton sequence is what ground reads off; payload carries the full detail if you later want richer views.

  The one fork that changes the build

  It comes down to what "see the sequence" means for the ground team:

  - If they need the ordered pallet/carton sequence as a list/table → the SharePoint-List (+ optional Power App) route above is the whole solution. Nothing else to deploy, nothing to pentest.
  - If they need the live 3D visualization on their devices → M365-native tools can't render your R3F scene, so you'd host the existing React frontend. To stay out of public-pentest scope, host it as an   
  Azure Static Web App gated by Entra ID (free tier, only PSA accounts can open it) reading from the same SharePoint list. It's still authenticated and inside your identity boundary, so the security scope 
  stays small — but it is a hosted frontend, which is the thing you wanted to avoid.

  So before I sketch any code: does the ground team need the actual 3D view, or just the ordered sequence (a list/table they can follow)? That single answer decides whether you're fully serverless on M365 
  or need to host the SPA behind Entra auth.