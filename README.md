# Wonderway

## Promo Code Logic

Promo codes are used to track sign-ups from events, locations etc. The promo code is built into the query string as `promo`.

**How promo codes are captured**

1. When the user hits the `app/` route with a `promo` value in the query string. Note HAS to be the `app/` route
2. Then the app loader file will save it to the session cookie.
3. After the user logs in and hits `/app` then the promo is read from the session and is used to create a new access log.

## Place logic

1. When the user hits the `app/` route with a `place` value in the query string. Note HAS to be the `app/` route
2. Then the app loader file will save it to the session cookie.
3. After the user logs in and hits `/app` then the place is read from the session and passed to the front end.
4. The front end stores the place in Zustand store using `stores/placeStore`.

## Access Logic

- The `app/` loader will check with `access.manager.server` to determine if the user can access the view.
- The loader passes an `access` property to the front end
- When a conversation starts...
- - If the front end `access` doesn't have an expiration date, then set it by adding the access record's `hours` to the current date.
- When a conversation ends...
- - We check to see if the current date is beyond the `access` expiration. If expired NEED business decision on how to update the UI

---

# Welcome to Remix!

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.

---
