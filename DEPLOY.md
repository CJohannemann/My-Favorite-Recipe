# Putting the recipe app on your home server

This gets the app running on your home server with Docker and reachable from anywhere at an
`https://` address, protected by a password.

## 1. Put the code on the server

```bash
git clone https://github.com/CJohannemann/My-Favorite-Recipe.git
cd My-Favorite-Recipe
```

You also need Docker with the Compose plugin (`docker compose version` should work).

## 2. Create your `.env` file

```bash
cp .env.example .env
nano .env
```

Fill in:

```
GEMINI_API_KEY=your-gemini-key
APP_USER=cook
APP_PASSWORD=pick-a-long-password
```

`.env` stays on the server and is never committed to GitHub. The app **won't start** in Docker
without `APP_PASSWORD`. That's deliberate: without a password, anyone on the internet could delete
your recipes or use up your Gemini quota.

## 3. Start it

```bash
docker compose up -d --build
```

On the server itself, open <http://localhost:3000>. Your browser will ask for the username and
password from `.env`. Recipes are kept in a Docker volume, so they survive restarts and updates.

## 4. Make it reachable from the internet

### Option A: Cloudflare Tunnel (recommended)

You get `https://recipes.yourdomain.com` with free HTTPS. You don't open any ports on your router,
and your home IP address stays hidden. You need a free Cloudflare account and a domain whose DNS
Cloudflare manages.

1. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels** and **create a tunnel**
   (type: Cloudflared). Name it something like `recipes`.
2. When it shows the install command, copy just the long **token** (the part after `--token`).
   Add it to `.env`:
   ```
   TUNNEL_TOKEN=eyJhIjoi...
   ```
3. In the tunnel's **Public Hostname** settings, add:
   - Subdomain: `recipes`, Domain: your domain
   - Service type: `HTTP`, URL: `app:3000`
4. Start the app together with the tunnel:
   ```bash
   docker compose --profile tunnel up -d --build
   ```

Then open `https://recipes.yourdomain.com` from your phone.

### Option B: Tailscale (private, just your own devices)

If only you (and maybe family) need it, [Tailscale](https://tailscale.com) is simpler and nothing
is exposed to the public internet. Install Tailscale on the server and on your phone. Then on the
server, run `sudo tailscale serve --bg 3000`. It prints an `https://<server>.<tailnet>.ts.net`
address that only works on your Tailscale devices.

### Option C: Router port forwarding + Caddy

Only choose this if you already run a reverse proxy. Point it at `127.0.0.1:3000`. It **must**
serve HTTPS, because the password is only protected when the connection is encrypted. With Caddy,
for example:

```
recipes.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

## Everyday tasks

| Task | Command |
| --- | --- |
| Update to the latest code | `git pull && docker compose --profile tunnel up -d --build` |
| See logs | `docker compose logs -f app` |
| Back up recipes | `docker compose cp app:/app/data/recipes.json ./recipes-backup.json` |
| Restore a backup | `docker compose cp ./recipes-backup.json app:/app/data/recipes.json && docker compose restart app` |
| Stop | `docker compose --profile tunnel down` (your recipes are kept) |

(If you aren't using the tunnel, leave out `--profile tunnel`.)

## Built-in protections

- **Password** on every page and API call. 10 wrong passwords from one address locks that address
  out for 15 minutes.
- **Scan limit:** 30 Gemini scans per hour by default, so a leaked password can't run up a big
  bill. Change it with `SCANS_PER_HOUR` in `.env`.
- The app's port is only open to the server itself (`127.0.0.1`). Internet traffic arrives
  through the tunnel or your proxy. To also reach it directly on your home network, change the
  port line in `docker-compose.yml` to `"3000:3000"`.
- The container runs as a regular user, not root.
